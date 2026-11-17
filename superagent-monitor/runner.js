/**
 * Runner helpers of the Superagent monitor.
 *
 * The monitor normally runs in the DSH profile the operator works in (for example
 * `desktop`), while dsh-superagent runs as its own DSH profile (for example
 * `superagent`, often inside WSL). Starting it therefore means running the
 * checkout's `scripts/dsh-superagent` through the right shell. These helpers build
 * and run that command without shelling out through an unquoted string.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Directory of this package; the default checkout is its parent, because the monitor lives inside the checkout. */
export const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url))

const PROFILE_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

const number = (value, fallback, min, max) => {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

const boolean = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback
  if (value === false || value === 0 || value === 'false' || value === '0' || value === 'no' || value === 'off') return false
  return true
}

/** Watchdog defaults: one local probe every 30 s, restart after 3 failures, at most 3 restarts an hour. */
export function watchdogConfig(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    enabled: boolean(source.enabled, true),
    intervalSeconds: number(source.intervalSeconds, 30, 10, 3600),
    failureThreshold: number(source.failureThreshold, 3, 1, 60),
    restartCooldownSeconds: number(source.restartCooldownSeconds, 300, 30, 86_400),
    maxRestartsPerHour: number(source.maxRestartsPerHour, 3, 1, 60),
    respectStop: boolean(source.respectStop, true),
  }
}

/** Normalize the row configuration, with defaults that match docs/006-deployment.md. */
export function normalizeConfig(input = {}, { platform = process.platform, env = process.env } = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const rawBase = String(source.baseUrl || env.DSH_SUPERAGENT_URL || 'http://127.0.0.1:3082').trim().replace(/\/+$/, '')
  let baseUrl
  try {
    baseUrl = new URL(rawBase)
  } catch {
    throw new Error(`baseUrl is not a URL: ${rawBase}`)
  }
  if (!/^https?:$/.test(baseUrl.protocol)) throw new Error('baseUrl must use http or https')
  if (!LOOPBACK.has(baseUrl.hostname)) throw new Error('baseUrl must point at the loopback host of the management API (127.0.0.1 or localhost)')
  const profile = String(source.profile || env.DSH_SUPERAGENT_PROFILE || 'superagent').trim()
  if (!PROFILE_PATTERN.test(profile)) throw new Error('profile must be a DSH profile name')
  const checkout = String(source.checkout || env.DSH_SUPERAGENT_CHECKOUT || resolve(PACKAGE_DIR, '..')).trim()
  if (!checkout) throw new Error('checkout must be an absolute path')
  const requestedRunner = String(source.runner || 'auto').trim().toLowerCase()
  const runner = requestedRunner === 'wsl' || requestedRunner === 'direct'
    ? requestedRunner
    : platform === 'win32' ? 'wsl' : 'direct'
  return {
    baseUrl: baseUrl.origin,
    profile,
    checkout,
    runner,
    wslDistro: String(source.wslDistro || '').trim(),
    pollSeconds: number(source.pollSeconds, 5, 2, 120),
    httpTimeoutSeconds: number(source.httpTimeoutSeconds, 10, 2, 120),
    statusTimeoutSeconds: number(source.statusTimeoutSeconds, 15, 3, 120),
    startTimeoutSeconds: number(source.startTimeoutSeconds, 180, 30, 1800),
    restartTimeoutSeconds: number(source.restartTimeoutSeconds, 420, 60, 3600),
    watchdog: watchdogConfig(source.watchdog),
  }
}

/** Convert a Windows path to the path WSL sees (`E:\\work\\repo` -> `/mnt/e/work/repo`); pass other paths through. */
export function toWslPath(path) {
  const text = String(path)
  const drive = /^([A-Za-z]):[\\/]*(.*)$/.exec(text)
  if (drive) return `/mnt/${drive[1].toLowerCase()}/${drive[2].replace(/\\/g, '/')}`.replace(/\/+$/, '')
  return text.replace(/\\/g, '/').replace(/\/+$/, '')
}

/** Quote one POSIX shell word. */
export function shQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`
}

/**
 * Build the command for `status`, `start` or `restart` of `scripts/dsh-superagent`.
 * WSL runs with the checkout's path converted; a direct runner runs bash in the checkout.
 * `respectStop` adds the script's flag that skips start/restart after an intentional stop.
 */
export function serviceCommand(config, action, { respectStop = false } = {}) {
  if (!['status', 'start', 'restart'].includes(action)) throw new Error(`unsupported action: ${action}`)
  const target = config.runner === 'wsl' ? toWslPath(config.checkout) : config.checkout
  const script = `${target.replace(/\/+$/, '')}/scripts/dsh-superagent`
  const guarded = respectStop && action !== 'status' ? ' --respect-stop' : ''
  const inner = `cd ${shQuote(target)} && exec python3 ${shQuote(script)} --profile ${shQuote(config.profile)} --url ${shQuote(config.baseUrl)} ${action}${guarded}`
  if (config.runner === 'wsl') {
    const args = []
    if (config.wslDistro) args.push('-d', config.wslDistro)
    args.push('--', 'bash', '-lc', inner)
    return { command: 'wsl.exe', args, cwd: undefined, display: ['wsl.exe', ...args].join(' ') }
  }
  return { command: 'bash', args: ['-lc', inner], cwd: config.checkout, display: `bash -lc ${shQuote(inner)}` }
}

/** Report whether the checkout has the service script and how to start it. */
export function inspectStart(config, { platform = process.platform } = {}) {
  if (config.runner === 'wsl' && /^\//.test(config.checkout)) {
    // A WSL-only path cannot be inspected from the Windows host; let the runner report failure.
    return { available: true, checkable: false, script: config.checkout, problem: null }
  }
  const script = join(config.checkout, 'scripts', 'dsh-superagent')
  if (!existsSync(script)) {
    return { available: false, checkable: true, script, problem: `scripts/dsh-superagent was not found under ${config.checkout}` }
  }
  if (config.runner === 'wsl' && platform !== 'win32') {
    return { available: false, checkable: true, script, problem: 'runner is wsl, but the host is not Windows' }
  }
  if (config.runner === 'direct' && platform === 'win32') {
    return { available: false, checkable: true, script, problem: 'runner is direct, but the host is Windows' }
  }
  return { available: true, checkable: true, script, problem: null }
}

const ERROR_CODES = {
  ECONNREFUSED: 'connection refused; the service may be stopped',
  ENOTFOUND: 'host not found',
  ETIMEDOUT: 'connection timed out',
  ENOENT: 'the command was not found',
  EACCES: 'the command is not executable',
}

/** Run one command, keeping a bounded tail of its combined output. */
export function runCommand(spec, { timeoutMs = 30_000, onSpawn, onOutput } = {}) {
  return new Promise(resolvePromise => {
    let settled = false
    let output = ''
    let child = null
    let timer = null
    let escalation = null
    const push = text => {
      output += text
      if (output.length > 60_000) output = output.slice(output.length - 60_000)
      if (onOutput) {
        try { onOutput(output) } catch { /* an observer must not break the operation */ }
      }
    }
    const finish = result => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (escalation) clearTimeout(escalation)
      resolvePromise({ ...result, output })
    }
    try {
      child = spawn(spec.command, spec.args, {
        cwd: spec.cwd,
        env: process.env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      finish({ ok: false, code: null, signal: null, timedOut: false, spawnError: error instanceof Error ? error.message : String(error) })
      return
    }
    if (onSpawn) {
      try { onSpawn(child) } catch { /* an observer must not break the operation */ }
    }
    if (child.stdout) {
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', push)
    }
    if (child.stderr) {
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', push)
    }
    child.on('error', error => {
      const code = error && error.code
      finish({
        ok: false, code: null, signal: null, timedOut: false,
        spawnError: `${ERROR_CODES[code] || 'could not run the command'}${error && error.message ? ` (${error.message})` : ''}`,
      })
    })
    child.on('close', (code, signal) => {
      finish({ ok: code === 0, code, signal, timedOut: false })
    })
    timer = setTimeout(() => {
      push(`\n[monitor] timed out after ${Math.round(timeoutMs / 1000)} s; terminating ${spec.command}\n`)
      try { child.kill('SIGTERM') } catch { /* the child may already be gone */ }
      escalation = setTimeout(() => {
        try { child.kill('SIGKILL') } catch { /* the child may already be gone */ }
      }, 5000)
      if (escalation.unref) escalation.unref()
      finish({ ok: false, code: null, signal: 'SIGTERM', timedOut: true })
    }, timeoutMs)
  })
}

/** Parse the JSON object `scripts/dsh-superagent status` prints, even when other lines precede it. */
export function parseStatusOutput(text) {
  const source = String(text || '')
  const start = source.indexOf('{')
  if (start < 0) return null
  const end = source.lastIndexOf('}')
  if (end <= start) return null
  for (let stop = end; stop > start; stop = source.lastIndexOf('}', stop - 1)) {
    try {
      const value = JSON.parse(source.slice(start, stop + 1))
      if (value && typeof value === 'object') return value
    } catch {
      // Keep trying an earlier closing brace; a CLI warning may follow the JSON.
    }
  }
  return null
}
