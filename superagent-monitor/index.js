/**
 * Host half of the Superagent monitor bundle.
 *
 * Serves a small same-origin JSON API for the panel:
 *   GET  /superagent-monitor/api/state       live status, health, load, sources, watchdog
 *   POST /superagent-monitor/api/start       run scripts/dsh-superagent start
 *   POST /superagent-monitor/api/restart     run scripts/dsh-superagent restart
 *   POST /superagent-monitor/api/repository  change the GitHub Source's repository
 *   POST /superagent-monitor/api/pause       pause or resume processing
 *   POST /superagent-monitor/api/watchdog            enable or disable automatic recovery
 *   POST /superagent-monitor/api/watchdog/check      probe now
 *   POST /superagent-monitor/api/watchdog/reset      clear failures, budget and block
 *
 * The management API of dsh-superagent is local and loopback-only, so this route
 * accepts only local, same-origin requests carrying the monitor header.
 */
import { Monitor, MonitorError } from './monitor.js'
import { normalizeConfig } from './runner.js'
import { Watchdog } from './watchdog.js'

const PREFIX = '/superagent-monitor'
const API = `${PREFIX}/api/`
const HEADER = 'x-superagent-monitor-request'
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1'])

export const name = 'superagent-monitor'
export const inject = ['webServer']

export function apply(ctx, config) {
  const settings = normalizeConfig(config || {})
  const monitor = new Monitor(settings, ctx.logger)
  const watchdog = new Watchdog(monitor, { config: settings.watchdog, logger: ctx.logger })
  monitor.attachWatchdog(watchdog)
  watchdog.start()
  ctx.logger.info(
    'superagent-monitor: watching %s (profile %s, runner %s, watchdog %s)',
    settings.baseUrl,
    settings.profile,
    settings.runner,
    settings.watchdog.enabled ? 'enabled' : 'disabled',
  )
  ctx.effect(() => () => {
    watchdog.dispose()
    monitor.dispose()
  }, 'superagent-monitor:operations')
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: (req, res) => handle(ctx, monitor, watchdog, req, res),
  }), 'superagent-monitor:routes')
}

async function handle(ctx, monitor, watchdog, req, res) {
  try {
    const url = new URL(req.url || '/', 'http://localhost')
    if (!url.pathname.startsWith(API)) {
      reply(res, 404, { error: 'Not found' })
      return
    }
    if (!trusted(req)) {
      reply(res, 403, { error: 'A same-origin local request with the monitor header is required.' })
      return
    }
    const route = url.pathname.slice(API.length).replace(/\/+$/, '')
    const method = (req.method || 'GET').toUpperCase()
    if (method === 'GET' && route === 'state') {
      reply(res, 200, await monitor.view())
      return
    }
    if (method === 'POST' && (route === 'start' || route === 'restart')) {
      const operation = monitor.runService(route)
      reply(res, 202, { started: true, operation })
      return
    }
    if (method === 'POST' && route === 'repository') {
      const body = await readJson(req)
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new MonitorError('The request body must be a JSON object.', { status: 400, code: 'invalid-body' })
      }
      const result = await monitor.setRepository(body.repository)
      // A repository change makes dsh-superagent restart itself; do not treat that gap as a crash.
      if (result.restarting) watchdog.suppress(120)
      reply(res, 200, { ...result, watchdog: watchdog.snapshot() })
      return
    }
    if (method === 'POST' && route === 'pause') {
      const body = await readJson(req)
      if (!body || typeof body.paused !== 'boolean') {
        throw new MonitorError('paused must be a boolean.', { status: 400, code: 'invalid-body' })
      }
      reply(res, 200, await monitor.setPaused(body.paused))
      return
    }
    if (method === 'POST' && route === 'watchdog') {
      const body = await readJson(req)
      if (!body || typeof body.enabled !== 'boolean') {
        throw new MonitorError('enabled must be a boolean.', { status: 400, code: 'invalid-body' })
      }
      const snapshot = watchdog.setEnabled(body.enabled)
      monitor.invalidate()
      reply(res, 200, { enabled: snapshot.enabled, watchdog: snapshot })
      return
    }
    if (method === 'POST' && route === 'watchdog/check') {
      // A check may wait for a restart; answer now and let the panel follow the state.
      watchdog.checkNow().catch(error => {
        ctx.logger.error('superagent-monitor watchdog: manual check failed: %s', error instanceof Error ? error.message : String(error))
      })
      reply(res, 202, { checking: true, watchdog: watchdog.snapshot() })
      return
    }
    if (method === 'POST' && route === 'watchdog/reset') {
      const snapshot = watchdog.reset()
      monitor.invalidate()
      reply(res, 200, { watchdog: snapshot })
      return
    }
    reply(res, 404, { error: 'Unknown monitor operation' })
  } catch (error) {
    fail(ctx, res, error)
  }
}

function fail(ctx, res, error) {
  const known = error instanceof MonitorError
  const status = known && Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 500
  const message = error instanceof Error ? error.message : String(error)
  const payload = known && error.payload && typeof error.payload === 'object' ? error.payload : null
  const body = {
    error: message,
    ...(known ? { code: error.code } : {}),
    ...(payload && payload.setup ? { setup: payload.setup } : {}),
    ...(payload && payload.issues ? { issues: payload.issues } : {}),
  }
  if (status >= 500) ctx.logger.error('superagent-monitor: %s', message)
  reply(res, status, body)
}

function reply(res, status, body) {
  if (res.headersSent || res.writableEnded) return
  try {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(JSON.stringify(body))
  } catch {
    // The client may have gone away while the response was being written.
  }
}

function hostnameOf(value) {
  if (!value) return ''
  try {
    const text = String(value)
    const url = new URL(text.includes('://') ? text : `http://${text}`)
    return url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  } catch {
    return ''
  }
}

function trusted(req) {
  if (req.headers[HEADER] !== '1') return false
  const address = String(req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '').replace(/^::ffff:/, '')
  if (!LOOPBACK.has(address) && address !== '127.0.0.1') return false
  const host = hostnameOf(req.headers.host)
  if (!LOOPBACK.has(host)) return false
  if (req.headers.origin) {
    const origin = hostnameOf(req.headers.origin)
    if (!LOOPBACK.has(origin)) return false
  }
  return true
}

async function readJson(req, limit = 64 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new MonitorError('The request body is too large.', { status: 413, code: 'body-too-large' })
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new MonitorError('The request body is not valid JSON.', { status: 400, code: 'invalid-body' })
  }
}
