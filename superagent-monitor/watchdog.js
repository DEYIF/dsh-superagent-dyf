/**
 * Background watchdog for the dsh-superagent main process.
 *
 * It probes the instance through the same read-only path the panel uses: the
 * management API is the heartbeat, and `scripts/dsh-superagent status` is used
 * only when that API is unreachable (to distinguish a stopped process from a
 * running but unresponsive one). When the process stays down or silent for
 * `failureThreshold` checks, the watchdog runs
 * `scripts/dsh-superagent restart --respect-stop` and records the outcome.
 *
 * Safety rules:
 * - an intentional stop (`--respect-stop`) is never undone;
 * - a running manual start/restart or a repository-triggered restart
 *   (`suppress`) pauses the watchdog;
 * - a cooldown and an hourly restart budget stop restart loops;
 * - setup waiting and non-runtime part errors are not restarted: a restart
 *   does not fix them.
 */
const HOUR_MS = 3_600_000

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export class Watchdog {
  constructor(monitor, options = {}) {
    this._monitor = monitor
    this._config = options.config || (monitor && monitor.config && monitor.config.watchdog) || {}
    this._logger = options.logger || { info() {}, error() {} }
    this._now = options.now || (() => Date.now())
    this._setTimeout = options.setTimeout || setTimeout
    this._clearTimeout = options.clearTimeout || clearTimeout
    this._sleep = options.sleep || sleep
    this._enabled = this._config.enabled !== false
    this._running = false
    this._disposed = false
    this._timer = null
    this._checking = null
    this._state = this._enabled ? 'idle' : 'disabled'
    this._lastCheckAt = null
    this._nextCheckAt = null
    this._lastResult = null
    this._lastError = null
    this._events = []
    this._lastEventKey = null
    this._consecutiveFailures = 0
    this._restarts = []
    this._lastRestartAt = null
    this._nextRestartAt = null
    this._blocked = false
    this._blockedReason = null
    this._suppressUntil = 0
  }

  /** Begin the background loop; the first probe runs shortly after the plugin activates. */
  start() {
    if (this._disposed || this._running) return this.snapshot()
    this._running = true
    this._event('started', this._enabled ? 'Watchdog started; interval ' + this._config.intervalSeconds + ' s.' : 'Watchdog started disabled.')
    if (this._enabled) this._schedule(1000)
    else this._state = 'disabled'
    return this.snapshot()
  }

  stop() {
    this._cancelTimer()
    this._running = false
    this._nextCheckAt = null
    this._state = this._enabled ? 'idle' : 'disabled'
    return this.snapshot()
  }

  dispose() {
    this._disposed = true
    this._running = false
    this._cancelTimer()
    this._nextCheckAt = null
    this._state = 'disposed'
  }

  /** Runtime switch for the panel; the durable value stays in the plugin configuration. */
  setEnabled(enabled) {
    if (this._disposed) return this.snapshot()
    const next = Boolean(enabled)
    if (next === this._enabled) {
      if (next && this._running && !this._timer && !this._checking) this._schedule(1000)
      return this.snapshot()
    }
    this._enabled = next
    if (!next) {
      this._cancelTimer()
      this._nextCheckAt = null
      this._state = 'disabled'
      this._event('disabled', 'Watchdog disabled; the main process is only observed.')
      return this.snapshot()
    }
    this._clearBlocked()
    this._resetBudget()
    this._state = 'idle'
    this._event('enabled', 'Watchdog enabled.')
    if (this._running) this._schedule(1000)
    return this.snapshot()
  }

  /** Clear the failure count, restart budget and block; useful after fixing the environment by hand. */
  reset() {
    if (this._disposed) return this.snapshot()
    this._clearBlocked()
    this._resetBudget()
    this._state = this._enabled ? 'idle' : 'disabled'
    this._event('reset', 'Failure count and restart budget cleared.')
    if (this._running && this._enabled) this._schedule(1000)
    return this.snapshot()
  }

  /** Pause automatic recovery for a while, e.g. while dsh-superagent restarts itself after a repository change. */
  suppress(seconds) {
    if (this._disposed) return this.snapshot()
    const ms = Math.max(0, Number(seconds) || 0) * 1000
    if (!ms) return this.snapshot()
    this._suppressUntil = this._now() + ms
    this._state = 'suppressed'
    this._event('suppressed', 'Automatic recovery paused for ' + Math.round(ms / 1000) + ' s after a repository change.')
    if (this._running && this._enabled) {
      this._cancelTimer()
      this._schedule(ms)
    }
    return this.snapshot()
  }

  /** Probe now; a manual probe never restarts while the watchdog is disabled. */
  checkNow() {
    if (this._disposed) return Promise.resolve(this.snapshot())
    return this._run('manual')
  }

  snapshot() {
    const now = this._now()
    const recent = this._restarts.filter(at => now - at < HOUR_MS)
    this._restarts = recent
    return {
      enabled: this._enabled,
      state: this._state,
      intervalSeconds: this._config.intervalSeconds,
      failureThreshold: this._config.failureThreshold,
      restartCooldownSeconds: this._config.restartCooldownSeconds,
      maxRestartsPerHour: this._config.maxRestartsPerHour,
      respectStop: this._config.respectStop !== false,
      consecutiveFailures: this._consecutiveFailures,
      restartsLastHour: recent.length,
      lastCheckAt: this._lastCheckAt,
      nextCheckAt: this._enabled && this._running && !this._suppressed(now) ? this._nextCheckAt : null,
      lastResult: this._lastResult,
      lastError: this._lastError,
      lastRestartAt: this._lastRestartAt,
      nextRestartAt: this._nextRestartAt ? new Date(this._nextRestartAt).toISOString() : null,
      blocked: this._blocked,
      blockedReason: this._blockedReason,
      suppressUntil: this._suppressUntil > now ? new Date(this._suppressUntil).toISOString() : null,
      events: this._events.slice().reverse(),
    }
  }

  _suppressed(now) {
    return this._suppressUntil > now
  }

  _cancelTimer() {
    if (this._timer !== null) {
      try { this._clearTimeout(this._timer) } catch { /* a stale timer handle is harmless */ }
      this._timer = null
    }
  }

  _schedule(delay) {
    this._cancelTimer()
    if (this._disposed || !this._running || !this._enabled) {
      this._nextCheckAt = null
      return
    }
    const at = this._now() + Math.max(0, delay)
    this._nextCheckAt = new Date(at).toISOString()
    this._timer = this._setTimeout(() => {
      this._timer = null
      this._run('timer').catch(failure => {
        this._lastError = failure instanceof Error ? failure.message : String(failure)
        this._event('error', this._lastError)
      })
    }, Math.max(0, delay))
    if (this._timer && typeof this._timer.unref === 'function') this._timer.unref()
  }

  _run(trigger) {
    if (this._checking) return this._checking
    const running = this._check(trigger).finally(() => {
      this._checking = null
      if (!this._disposed && this._running && this._enabled) this._schedule(this._config.intervalSeconds * 1000)
    })
    this._checking = running
    return running
  }

  async _check(trigger) {
    if (this._disposed) return
    const started = this._now()
    this._lastCheckAt = new Date(started).toISOString()
    this._lastError = null
    if (this._suppressed(started)) {
      this._state = 'suppressed'
      return
    }
    this._state = 'checking'
    let view
    try {
      view = await this._monitor.view()
    } catch (failure) {
      this._lastError = failure instanceof Error ? failure.message : String(failure)
      this._state = 'error'
      this._event('error', this._lastError)
      return
    }
    this._lastResult = {
      status: view.status,
      level: view.level,
      detail: view.statusDetail || null,
      at: new Date(this._now()).toISOString(),
    }
    if (view.operation && view.operation.running) {
      this._state = 'operation'
      return
    }
    if (view.status === 'ready' || view.status === 'paused' || view.status === 'setup' || view.status === 'error' || view.status === 'starting') {
      if (this._consecutiveFailures > 0) this._event('recovered', 'Main process is ' + view.status + '.')
      this._consecutiveFailures = 0
      this._clearBlocked(false)
      this._state = 'healthy'
      return
    }
    if (view.process && view.process.manuallyStopped && this._config.respectStop !== false) {
      this._consecutiveFailures = 0
      this._state = 'manual-stop'
      this._event('manual-stop', 'Intentional stop is active; automatic recovery skipped.')
      return
    }
    this._consecutiveFailures += 1
    if (!this._enabled) {
      this._state = 'disabled'
      return
    }
    if (view.monitor && view.monitor.startAvailable === false) {
      this._blocked = true
      this._blockedReason = view.monitor.startProblem || 'Starting is unavailable.'
      this._state = 'blocked'
      this._event('blocked', this._blockedReason)
      return
    }
    if (this._consecutiveFailures < this._config.failureThreshold) {
      this._state = 'waiting'
      this._event('waiting', 'Main process is ' + view.status + ' (' + this._consecutiveFailures + '/' + this._config.failureThreshold + ').')
      return
    }
    const now = this._now()
    const recent = this._restarts.filter(at => now - at < HOUR_MS)
    this._restarts = recent
    if (recent.length >= this._config.maxRestartsPerHour) {
      this._blocked = true
      this._blockedReason = 'Restart budget exhausted (' + recent.length + '/' + this._config.maxRestartsPerHour + ' per hour).'
      this._state = 'blocked'
      this._event('blocked', this._blockedReason)
      return
    }
    if (trigger === 'manual') {
      // A manual probe is a look, not an action: the timer owns recovery.
      this._state = this._nextRestartAt && now < this._nextRestartAt ? 'cooldown' : 'waiting'
      this._event('manual-probe', 'Manual probe: main process is ' + view.status + '; recovery is left to the timer.')
      return
    }
    if (this._nextRestartAt && now < this._nextRestartAt) {
      this._state = 'cooldown'
      return
    }
    await this._restart(view)
  }

  async _restart(view) {
    const now = this._now()
    this._state = 'recovering'
    try {
      this._monitor.runService('restart', {
        respectStop: this._config.respectStop !== false,
        trigger: 'watchdog',
      })
    } catch (failure) {
      const code = failure && failure.code
      if (code === 'operation-in-progress') {
        this._state = 'operation'
        this._event('skip-operation', 'Another start or restart is still running; retrying after the next check.')
        return
      }
      if (code === 'start-unavailable') {
        this._blocked = true
        this._blockedReason = failure.message || 'Starting is unavailable.'
        this._state = 'blocked'
        this._event('blocked', this._blockedReason)
        return
      }
      this._lastError = failure instanceof Error ? failure.message : String(failure)
      this._state = 'error'
      this._event('restart-error', this._lastError)
      return
    }
    this._restarts.push(now)
    this._lastRestartAt = new Date(now).toISOString()
    this._nextRestartAt = now + this._config.restartCooldownSeconds * 1000
    this._event('restart', 'Main process is ' + view.status + '; running restart --respect-stop.')
    let result = null
    try {
      result = await this._monitor.waitForOperation()
    } catch (failure) {
      this._lastError = failure instanceof Error ? failure.message : String(failure)
      this._state = 'error'
      this._event('restart-error', this._lastError)
      return
    }
    if (!result || !result.ok) {
      this._state = 'restart-failed'
      this._event('restart-failed', result
        ? 'restart exited with code ' + result.code + (result.timedOut ? ' (timed out)' : '')
        : 'restart did not complete.')
      return
    }
    this._monitor.invalidate()
    await this._sleep(500)
    let confirmation = null
    try {
      confirmation = await this._monitor.view()
    } catch (failure) {
      this._lastError = failure instanceof Error ? failure.message : String(failure)
    }
    if (confirmation && (confirmation.status === 'ready' || confirmation.status === 'paused' || confirmation.status === 'setup' || confirmation.status === 'error' || confirmation.status === 'starting')) {
      this._consecutiveFailures = 0
      this._clearBlocked(false)
      this._state = 'recovered'
      this._event('recovered', 'Main process is ' + confirmation.status + ' after restart.')
    } else {
      this._state = 'waiting'
      this._event('restart-unconfirmed', confirmation ? 'Main process is still ' + confirmation.status + ' after restart.' : 'Restart finished; the next check confirms the state.')
    }
  }

  _clearBlocked(withEvent = true) {
    const wasBlocked = this._blocked
    this._blocked = false
    this._blockedReason = null
    if (wasBlocked && withEvent) this._event('unblocked', 'The watchdog can recover the main process again.')
  }

  _resetBudget() {
    this._consecutiveFailures = 0
    this._restarts = []
    this._nextRestartAt = null
  }

  _event(kind, detail = null) {
    const key = kind + ':' + (detail || '')
    if (this._lastEventKey === key) return
    this._lastEventKey = key
    const event = { at: new Date(this._now()).toISOString(), kind, detail }
    this._events.push(event)
    if (this._events.length > 40) this._events.shift()
    if (kind === 'error' || kind === 'restart-failed' || kind === 'restart-error' || kind === 'blocked') {
      this._logger.error('superagent-monitor watchdog: %s (%s)', kind, detail || '')
    } else {
      this._logger.info('superagent-monitor watchdog: %s (%s)', kind, detail || '')
    }
  }
}
