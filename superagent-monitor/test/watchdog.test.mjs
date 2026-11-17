import test from 'node:test'
import assert from 'node:assert/strict'
import { Watchdog } from '../watchdog.js'

const baseConfig = {
  enabled: true,
  intervalSeconds: 30,
  failureThreshold: 3,
  restartCooldownSeconds: 300,
  maxRestartsPerHour: 3,
  respectStop: true,
}

const readyView = () => ({
  status: 'ready',
  level: 'ok',
  statusDetail: 'Orchestrator is ready',
  operation: null,
  process: null,
  monitor: { startAvailable: true, startProblem: null },
})

const downView = (overrides = {}) => ({
  status: 'stopped',
  level: 'idle',
  statusDetail: null,
  operation: null,
  process: { known: true, pids: [], manuallyStopped: false },
  monitor: { startAvailable: true, startProblem: null },
  ...overrides,
})

const stoppedView = (overrides = {}) => downView({
  process: { known: true, pids: [], manuallyStopped: true },
  ...overrides,
})

function fakeMonitor(views) {
  const queue = Array.isArray(views) ? views.slice() : null
  let index = 0
  const monitor = {
    config: {},
    calls: [],
    view: async () => {
      if (queue) return queue[Math.min(index++, queue.length - 1)]
      return views()
    },
    runService(kind, options) {
      monitor.calls.push({ kind, options })
      return { kind, running: true }
    },
    waitForOperation: async () => ({ ok: true, code: 0, output: '' }),
    invalidate() {},
  }
  return monitor
}

function fakeWatchdog(monitor, overrides = {}) {
  const clock = overrides.clock || { value: Date.UTC(2026, 10, 5, 12, 0, 0) }
  const config = { ...baseConfig, ...overrides.config }
  const watchdog = new Watchdog(monitor, {
    config,
    now: () => clock.value,
    setTimeout: () => ({ id: 1, unref() {} }),
    clearTimeout: () => {},
    sleep: async () => {},
    logger: { info() {}, error() {} },
  })
  return { watchdog, clock }
}

test('a healthy main process is healthy and never restarts', async () => {
  const monitor = fakeMonitor(() => readyView())
  const { watchdog } = fakeWatchdog(monitor)
  await watchdog.checkNow()
  const snapshot = watchdog.snapshot()
  assert.equal(snapshot.state, 'healthy')
  assert.equal(snapshot.consecutiveFailures, 0)
  assert.deepEqual(monitor.calls, [])
})

test('a part error does not cause a restart', async () => {
  const monitor = fakeMonitor(() => ({
    ...readyView(),
    status: 'error',
    level: 'error',
    statusDetail: 'github: poll failed',
  }))
  const { watchdog } = fakeWatchdog(monitor)
  await watchdog._check('timer')
  assert.equal(watchdog.snapshot().state, 'healthy')
  assert.deepEqual(monitor.calls, [])
})

test('a service that is still starting is not restarted', async () => {
  const monitor = fakeMonitor(() => ({
    ...readyView(),
    status: 'starting',
    level: 'warn',
    statusDetail: null,
  }))
  const { watchdog } = fakeWatchdog(monitor)
  await watchdog._check('timer')
  await watchdog._check('timer')
  await watchdog._check('timer')
  assert.equal(watchdog.snapshot().state, 'healthy')
  assert.deepEqual(monitor.calls, [])
})

test('three failures restart the main process with --respect-stop', async () => {
  const monitor = fakeMonitor([downView(), downView(), downView(), readyView()])
  const { watchdog } = fakeWatchdog(monitor)
  await watchdog._check('timer')
  assert.equal(watchdog.snapshot().state, 'waiting')
  assert.equal(watchdog.snapshot().consecutiveFailures, 1)
  await watchdog._check('timer')
  assert.equal(watchdog.snapshot().consecutiveFailures, 2)
  await watchdog._check('timer')
  assert.deepEqual(monitor.calls, [{ kind: 'restart', options: { respectStop: true, trigger: 'watchdog' } }])
  const snapshot = watchdog.snapshot()
  assert.equal(snapshot.state, 'recovered')
  assert.equal(snapshot.consecutiveFailures, 0)
  assert.equal(snapshot.restartsLastHour, 1)
  assert.ok(snapshot.lastRestartAt)
  assert.ok(snapshot.events.some(event => event.kind === 'restart'))
  assert.ok(snapshot.events.some(event => event.kind === 'recovered'))
})

test('a manual probe never restarts, even at the threshold', async () => {
  const monitor = fakeMonitor([downView(), downView(), downView(), downView()])
  const { watchdog } = fakeWatchdog(monitor)
  await watchdog._check('timer')
  await watchdog._check('timer')
  await watchdog.checkNow()
  assert.deepEqual(monitor.calls, [])
  assert.equal(watchdog.snapshot().consecutiveFailures, 3)
})

test('a reachable starting instance counts as a successful restart', async () => {
  const starting = { ...readyView(), status: 'starting', level: 'warn', reachable: true }
  const monitor = fakeMonitor([downView(), downView(), downView(), starting])
  const { watchdog } = fakeWatchdog(monitor)
  await watchdog._check('timer')
  await watchdog._check('timer')
  await watchdog._check('timer')
  assert.equal(watchdog.snapshot().state, 'recovered')
  assert.equal(watchdog.snapshot().consecutiveFailures, 0)
  assert.deepEqual(monitor.calls, [{ kind: 'restart', options: { respectStop: true, trigger: 'watchdog' } }])
})

test('an intentional stop is never undone while respectStop is on', async () => {
  const monitor = fakeMonitor([stoppedView(), stoppedView(), stoppedView(), stoppedView()])
  const { watchdog } = fakeWatchdog(monitor)
  await watchdog._check('timer')
  await watchdog._check('timer')
  await watchdog._check('timer')
  assert.equal(watchdog.snapshot().state, 'manual-stop')
  assert.equal(watchdog.snapshot().consecutiveFailures, 0)
  assert.deepEqual(monitor.calls, [])
})

test('a disabled watchdog observes but does not restart', async () => {
  const monitor = fakeMonitor([downView(), downView(), downView()])
  const { watchdog } = fakeWatchdog(monitor, { config: { enabled: false } })
  await watchdog._check('timer')
  await watchdog._check('timer')
  await watchdog._check('timer')
  assert.equal(watchdog.snapshot().state, 'disabled')
  assert.deepEqual(monitor.calls, [])
})

test('the cooldown prevents an immediate second restart', async () => {
  const monitor = fakeMonitor([
    downView(), downView(), downView(), readyView(),
    downView(), downView(), downView(),
  ])
  const { watchdog } = fakeWatchdog(monitor)
  await watchdog._check('timer')
  await watchdog._check('timer')
  await watchdog._check('timer')
  assert.equal(monitor.calls.length, 1)
  await watchdog._check('timer')
  await watchdog._check('timer')
  await watchdog._check('timer')
  assert.equal(monitor.calls.length, 1)
  assert.equal(watchdog.snapshot().state, 'cooldown')
})

test('the hourly budget blocks restart loops', async () => {
  const monitor = fakeMonitor([
    downView(), downView(), downView(), readyView(),
    downView(), downView(), downView(),
  ])
  const clock = { value: Date.UTC(2026, 10, 5, 12, 0, 0) }
  const { watchdog } = fakeWatchdog(monitor, { clock, config: { maxRestartsPerHour: 1 } })
  await watchdog._check('timer')
  await watchdog._check('timer')
  await watchdog._check('timer')
  assert.equal(monitor.calls.length, 1)
  clock.value += 301_000
  await watchdog._check('timer')
  await watchdog._check('timer')
  await watchdog._check('timer')
  assert.equal(monitor.calls.length, 1)
  const snapshot = watchdog.snapshot()
  assert.equal(snapshot.state, 'blocked')
  assert.equal(snapshot.blocked, true)
  assert.match(snapshot.blockedReason, /budget/)
})

test('reset clears failures, budget and the block', async () => {
  const monitor = fakeMonitor([
    downView(), downView(), downView(), readyView(),
    downView(), downView(), downView(),
  ])
  const clock = { value: Date.UTC(2026, 10, 5, 12, 0, 0) }
  const { watchdog } = fakeWatchdog(monitor, { clock, config: { maxRestartsPerHour: 1 } })
  await watchdog._check('timer')
  await watchdog._check('timer')
  await watchdog._check('timer')
  clock.value += 301_000
  await watchdog._check('timer')
  await watchdog._check('timer')
  await watchdog._check('timer')
  assert.equal(watchdog.snapshot().blocked, true)
  watchdog.reset()
  const snapshot = watchdog.snapshot()
  assert.equal(snapshot.blocked, false)
  assert.equal(snapshot.consecutiveFailures, 0)
  assert.equal(snapshot.restartsLastHour, 0)
  assert.equal(snapshot.nextRestartAt, null)
})

test('an unavailable start command blocks instead of trying forever', async () => {
  const unavailable = downView({ monitor: { startAvailable: false, startProblem: 'scripts/dsh-superagent was not found' } })
  const monitor = fakeMonitor([unavailable, unavailable, unavailable])
  const { watchdog } = fakeWatchdog(monitor)
  await watchdog._check('timer')
  await watchdog._check('timer')
  await watchdog._check('timer')
  const snapshot = watchdog.snapshot()
  assert.equal(snapshot.state, 'blocked')
  assert.match(snapshot.blockedReason, /not found/)
  assert.deepEqual(monitor.calls, [])
})

test('suppression skips probing until it expires', async () => {
  const monitor = fakeMonitor(downView())
  let probed = 0
  monitor.view = async () => { probed += 1; return downView() }
  const clock = { value: Date.UTC(2026, 10, 5, 12, 0, 0) }
  const { watchdog } = fakeWatchdog(monitor, { clock })
  watchdog.suppress(120)
  await watchdog._check('timer')
  assert.equal(watchdog.snapshot().state, 'suppressed')
  assert.equal(probed, 0)
  clock.value += 121_000
  await watchdog._check('timer')
  assert.equal(probed, 1)
})
