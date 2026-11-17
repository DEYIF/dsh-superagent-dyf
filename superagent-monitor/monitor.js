/**
 * Monitoring and control of a standalone dsh-superagent instance.
 *
 * All reads go through the instance's own management API
 * (`/orchestrator/api/...`, local HTTP only). When that API does not answer,
 * `scripts/dsh-superagent status` is used to tell a stopped process from a
 * running-but-unresponsive one. Start and restart run the same service script,
 * so recovery follows the behaviour docs/006-deployment.md documents.
 */
import { inspectStart, parseStatusOutput, runCommand, serviceCommand } from './runner.js'

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

/** An error that carries the HTTP status and payload the management route should mirror. */
export class MonitorError extends Error {
  constructor(message, { status = 502, code = 'monitor-error', payload = null } = {}) {
    super(message)
    this.name = 'MonitorError'
    this.status = status
    this.code = code
    this.payload = payload
  }
}

/** Convert a fetch failure into an operator-readable sentence. */
export function describeNetworkError(error) {
  const cause = error && error.cause ? error.cause : error
  const code = cause && cause.code
  if (code === 'ECONNREFUSED') return 'The management API refused the connection; the service is probably stopped.'
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'The management API host could not be resolved.'
  if (code === 'ETIMEDOUT') return 'The connection to the management API timed out.'
  if (code === 'ECONNRESET') return 'The connection to the management API was reset.'
  return `Cannot reach the management API: ${error instanceof Error ? error.message : String(error)}`
}

/** Call one route of the superagent management API. */
export async function requestJson(baseUrl, path, { method = 'GET', body, timeoutMs = 10_000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response
  try {
    response = await fetch(`${baseUrl}/orchestrator/api/${path}`, {
      method,
      headers: {
        'x-orchestrator-request': '1',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new MonitorError(`The management API did not answer within ${Math.round(timeoutMs / 1000)} s.`, { status: 503, code: 'timeout' })
    }
    throw new MonitorError(describeNetworkError(error), { status: 503, code: 'unreachable' })
  } finally {
    clearTimeout(timer)
  }
  const text = await response.text().catch(() => '')
  let payload = null
  if (text) {
    try { payload = JSON.parse(text) } catch { payload = null }
  }
  if (!response.ok) {
    const message = payload && (payload.error || payload.message)
      ? String(payload.error || payload.message)
      : `The management API answered ${response.status}${text ? `: ${text.slice(0, 300)}` : ''}`
    throw new MonitorError(message, { status: response.status, code: payload && payload.code ? payload.code : 'api-error', payload })
  }
  return payload
}

/** Derive the headline status shown by the panel. Pure so tests can cover the rules. */
export function deriveStatus({ reachable, state, process, operation }) {
  if (operation && operation.running) return { status: 'starting', level: 'warn', detail: null }
  if (!reachable) {
    if (!process) return { status: 'unknown', level: 'error', detail: null }
    if (process.known === false) return { status: 'unknown', level: 'error', detail: null }
    if (Array.isArray(process.pids) && process.pids.length > 0) return { status: 'unreachable', level: 'error', detail: null }
    return { status: 'stopped', level: 'idle', detail: null }
  }
  const problem = state && state.setup ? state.setup.problem : null
  if (problem) return { status: 'setup', level: 'warn', detail: problem.detail || null }
  const health = (state && state.health) || {}
  const errors = Object.entries(health).filter(([, entry]) => entry && entry.state === 'error')
  if (errors.length) {
    return {
      status: 'error',
      level: 'error',
      detail: errors.map(([name, entry]) => `${name}: ${entry.detail || 'error'}`).join('; '),
    }
  }
  if (state && state.paused) return { status: 'paused', level: 'warn', detail: null }
  const starting = Object.entries(health).filter(([, entry]) => entry && entry.state === 'starting')
  if (starting.length) return { status: 'starting', level: 'warn', detail: null }
  const runtime = health.runtime
  return { status: 'ready', level: 'ok', detail: runtime && runtime.detail ? runtime.detail : null }
}

const pickState = state => state ? {
  setup: {
    machine: state.setup ? state.setup.machine ?? null : null,
    problem: state.setup ? state.setup.problem ?? null : null,
    feishuProblem: state.setup ? state.setup.feishuProblem ?? null : null,
    accounts: state.setup ? state.setup.accounts ?? null : null,
  },
  health: state.health && typeof state.health === 'object' ? state.health : {},
  load: state.load ?? null,
  paused: state.paused === true,
  masterId: state.masterId ?? null,
} : null

const pickSources = sources => (Array.isArray(sources) ? sources : []).map(source => ({
  id: source.id,
  title: source.title ?? null,
  enabled: source.enabled === true,
  installed: source.installed === true,
  state: source.state ?? 'unknown',
  health: Array.isArray(source.health)
    ? source.health.map(part => ({ name: part.name, state: part.state, detail: part.detail ?? null, at: part.at ?? null }))
    : [],
  stats: source.stats ?? null,
}))

export class Monitor {
  constructor(config, logger) {
    this._config = config
    this._logger = logger
    this._cache = null
    this._cacheAt = 0
    this._pending = null
    this._reachable = false
    this._error = null
    this._latencyMs = null
    this._lastSeenAt = null
    this._process = null
    this._processAt = 0
    this._processPending = null
    this._operation = null
    this._operationChild = null
    this._operationPromise = null
    this._watchdog = null
    this._history = []
    this._lastStatus = null
    this._disposed = false
  }

  get config() { return this._config }

  _api(path, options) {
    return requestJson(this._config.baseUrl, path, {
      timeoutMs: this._config.httpTimeoutSeconds * 1000,
      ...options,
    })
  }

  _shouldCheckProcess() {
    return !this._processAt || Date.now() - this._processAt > 10_000
  }

  _checkProcess() {
    if (this._processPending) return this._processPending
    const spec = serviceCommand(this._config, 'status')
    this._processPending = runCommand(spec, { timeoutMs: this._config.statusTimeoutSeconds * 1000 })
      .then(result => {
        this._processAt = Date.now()
        const parsed = parseStatusOutput(result.output)
        this._process = {
          checkedAt: new Date(this._processAt).toISOString(),
          pids: parsed && Array.isArray(parsed.pids) ? parsed.pids : [],
          manuallyStopped: Boolean(parsed && parsed.manually_stopped),
          cwd: parsed ? parsed.cwd ?? null : null,
          url: parsed ? parsed.url ?? null : null,
          known: Boolean(parsed),
          error: parsed ? null : result.timedOut ? 'The status check timed out.' : result.spawnError || `The status check exited with code ${result.code}.`,
        }
      })
      .finally(() => { this._processPending = null })
    return this._processPending
  }

  _operationView() {
    const operation = this._operation
    if (!operation) return null
    return {
      kind: operation.kind,
      trigger: operation.trigger || 'manual',
      running: operation.running,
      startedAt: operation.startedAt,
      endedAt: operation.endedAt,
      ok: operation.ok,
      code: operation.code,
      timedOut: operation.timedOut,
      output: operation.output,
    }
  }

  _record(statusInfo, at) {
    if (this._lastStatus === statusInfo.status) return
    this._lastStatus = statusInfo.status
    this._history.push({ at, status: statusInfo.status, level: statusInfo.level, detail: statusInfo.detail })
    if (this._history.length > 20) this._history.shift()
  }

  async _collect() {
    const checkedAt = new Date().toISOString()
    const started = Date.now()
    let state = null
    let sources = null
    let sourcesError = null
    let error = null
    try {
      state = await this._api('state')
      this._reachable = true
      this._latencyMs = Date.now() - started
      this._lastSeenAt = checkedAt
      this._process = null
      this._processAt = 0
    } catch (failure) {
      this._reachable = false
      this._latencyMs = null
      error = failure instanceof Error ? failure.message : String(failure)
      if (!this._operation || !this._operation.running) {
        if (this._shouldCheckProcess()) {
          try { await this._checkProcess() } catch { /* The process check is best effort. */ }
        }
      }
    }
    this._error = error
    if (state) {
      try {
        sources = await this._api('sources')
      } catch (failure) {
        sourcesError = failure instanceof Error ? failure.message : String(failure)
      }
    }
    const statusInfo = deriveStatus({
      reachable: this._reachable,
      state,
      process: this._process,
      operation: this._operation,
    })
    this._record(statusInfo, checkedAt)
    const start = inspectStart(this._config)
    let command = null
    let watchdogCommand = null
    try { command = serviceCommand(this._config, 'start').display } catch { command = null }
    try { watchdogCommand = serviceCommand(this._config, 'restart', { respectStop: true }).display } catch { watchdogCommand = null }
    return {
      checkedAt,
      baseUrl: this._config.baseUrl,
      profile: this._config.profile,
      autoRefreshSeconds: this._config.pollSeconds,
      reachable: this._reachable,
      latencyMs: this._latencyMs,
      lastSeenAt: this._lastSeenAt,
      error: this._error,
      status: statusInfo.status,
      level: statusInfo.level,
      statusDetail: statusInfo.detail,
      state: pickState(state),
      sources: pickSources(sources),
      sourcesError,
      repository: state && state.setup && state.setup.accounts ? state.setup.accounts.repository ?? null : null,
      accounts: state && state.setup ? state.setup.accounts ?? null : null,
      process: this._reachable ? null : this._process,
      operation: this._operationView(),
      watchdog: this._watchdog ? this._watchdog.snapshot() : null,
      history: this._history.slice().reverse(),
      monitor: {
        baseUrl: this._config.baseUrl,
        profile: this._config.profile,
        runner: this._config.runner,
        wslDistro: this._config.wslDistro,
        checkout: this._config.checkout,
        command,
        watchdogCommand,
        startAvailable: start.available,
        startProblem: start.problem,
        stateDir: state && state.setup && state.setup.machine ? state.setup.machine.stateDir ?? null : null,
      },
    }
  }

  /** Current snapshot; repeated calls within a second share one upstream read. */
  async view() {
    if (this._disposed) throw new MonitorError('The monitor was disposed.', { status: 503, code: 'disposed' })
    if (this._cache && Date.now() - this._cacheAt < 750) return this._cache
    if (!this._pending) {
      const pending = this._collect()
        .then(value => {
          this._cache = value
          this._cacheAt = Date.now()
          return value
        })
        .finally(() => { if (this._pending === pending) this._pending = null })
      this._pending = pending
    }
    return this._pending
  }

  /**
   * Start or restart through the checkout's service script; resolves once the operation is launched.
   * `respectStop` is the watchdog's guard: it must not undo an intentional stop.
   */
  runService(kind, { respectStop = false, trigger = 'manual' } = {}) {
    if (kind !== 'start' && kind !== 'restart') throw new MonitorError(`Unsupported action: ${kind}`, { status: 400, code: 'invalid-action' })
    if (this._operation && this._operation.running) {
      throw new MonitorError('Another start or restart is still running.', { status: 409, code: 'operation-in-progress' })
    }
    if (this._disposed) throw new MonitorError('The monitor was disposed.', { status: 503, code: 'disposed' })
    const start = inspectStart(this._config)
    if (!start.available) throw new MonitorError(start.problem || 'Starting is unavailable.', { status: 409, code: 'start-unavailable' })
    const spec = serviceCommand(this._config, kind, { respectStop })
    const timeoutMs = (kind === 'restart' ? this._config.restartTimeoutSeconds : this._config.startTimeoutSeconds) * 1000
    const operation = {
      kind,
      trigger,
      running: true,
      startedAt: new Date().toISOString(),
      endedAt: null,
      ok: null,
      code: null,
      timedOut: false,
      output: '',
    }
    this._operation = operation
    this._cacheAt = 0
    this._logger.info('superagent-monitor: %s requested by %s for profile %s', kind, trigger, this._config.profile)
    this._operationPromise = runCommand(spec, {
      timeoutMs,
      onSpawn: child => { this._operationChild = child },
      onOutput: text => { operation.output = text },
    })
      .then(result => {
        operation.ok = result.ok
        operation.code = result.code
        operation.timedOut = result.timedOut
        operation.output = result.output
        if (result.spawnError) operation.output = `${result.spawnError}\n${operation.output}`
        if (result.ok) this._logger.info('superagent-monitor: %s (%s) finished successfully', kind, trigger)
        else this._logger.error('superagent-monitor: %s (%s) failed (code %s%s)', kind, trigger, result.code, result.timedOut ? ', timed out' : '')
      })
      .catch(failure => {
        operation.ok = false
        operation.output = `${operation.output}\n${failure instanceof Error ? failure.message : String(failure)}\n`
        this._logger.error('superagent-monitor: %s (%s) failed: %s', kind, trigger, failure instanceof Error ? failure.message : String(failure))
      })
      .finally(() => {
        operation.running = false
        operation.endedAt = new Date().toISOString()
        this._operationChild = null
        this._cacheAt = 0
        this._processAt = 0
      })
    return this._operationView()
  }

  /** Await the operation this monitor launched last, so the watchdog can record its outcome. */
  async waitForOperation() {
    if (this._operationPromise) {
      try { await this._operationPromise } catch { /* the chain handles its own failures */ }
    }
    return this._operationView()
  }

  /** Give the watchdog a place in the snapshot returned by `view()`. */
  attachWatchdog(watchdog) {
    this._watchdog = watchdog
  }

  /** Drop the short read cache, for callers that just changed the far side. */
  invalidate() {
    this._cache = null
    this._cacheAt = 0
  }

  /** Change the GitHub Source's repository through the management API, which checks push access and restarts. */
  async setRepository(repository) {
    const value = String(repository || '').trim()
    if (!REPOSITORY_PATTERN.test(value)) {
      throw new MonitorError('The repository must be written as owner/name.', { status: 400, code: 'invalid-repository' })
    }
    const settings = await this._api('settings', { timeoutMs: Math.max(20_000, this._config.httpTimeoutSeconds * 1000) })
    const source = settings && Array.isArray(settings.sources)
      ? settings.sources.find(candidate => candidate && candidate.id === 'github')
      : undefined
    if (!source) throw new MonitorError('This dsh-superagent instance has no GitHub Source.', { status: 404, code: 'source-missing' })
    const config = source.value && source.value.config ? source.value.config : {}
    if (config.repository === value) {
      return { unchanged: true, repository: value, revision: source.revision ?? null, restarting: false }
    }
    const next = { ...(source.value || {}), config: { ...config, repository: value } }
    const saved = await this._api('settings/source:github', {
      method: 'PUT',
      body: { value: next, revision: source.revision },
      timeoutMs: 90_000,
    })
    this._cacheAt = 0
    this._cache = null
    return {
      unchanged: false,
      repository: value,
      revision: saved && saved.revision !== undefined ? saved.revision : null,
      restarting: Boolean(saved && saved.restarting),
    }
  }

  /** Pause or resume the instance's processing. */
  async setPaused(paused) {
    const result = await this._api('executor/pause', {
      method: 'POST',
      body: { paused: Boolean(paused) },
      timeoutMs: 15_000,
    })
    this._cacheAt = 0
    this._cache = null
    return { paused: Boolean(result && result.paused) }
  }

  dispose() {
    this._disposed = true
    if (this._operationChild) {
      try { this._operationChild.kill('SIGTERM') } catch { /* the child may already be gone */ }
      this._operationChild = null
    }
  }
}
