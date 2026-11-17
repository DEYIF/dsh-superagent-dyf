import test from 'node:test'
import assert from 'node:assert/strict'
import {
  inspectStart,
  normalizeConfig,
  parseStatusOutput,
  serviceCommand,
  shQuote,
  toWslPath,
  watchdogConfig,
} from '../runner.js'

test('toWslPath converts Windows drive paths and leaves POSIX paths alone', () => {
  assert.equal(toWslPath('E:\\HUAWEI工作\\dsh-superagent-prototype'), '/mnt/e/HUAWEI工作/dsh-superagent-prototype')
  assert.equal(toWslPath('C:/work/repo/'), '/mnt/c/work/repo')
  assert.equal(toWslPath('/home/me/repo/'), '/home/me/repo')
})

test('shQuote quotes one POSIX word, including single quotes', () => {
  assert.equal(shQuote('plain'), "'plain'")
  assert.equal(shQuote("a'b"), "'a'\\''b'")
})

test('normalizeConfig fills deployment defaults and validates the profile', () => {
  const config = normalizeConfig({ baseUrl: 'http://127.0.0.1:3082/', profile: 'superagent' }, { platform: 'win32', env: {} })
  assert.equal(config.baseUrl, 'http://127.0.0.1:3082')
  assert.equal(config.profile, 'superagent')
  assert.equal(config.runner, 'wsl')
  assert.equal(config.pollSeconds, 5)
  assert.equal(config.watchdog.enabled, true)
  assert.equal(config.watchdog.intervalSeconds, 30)
  assert.throws(() => normalizeConfig({ profile: '../bad' }, { platform: 'linux', env: {} }), /profile/)
  assert.throws(() => normalizeConfig({ baseUrl: 'http://example.com' }, { platform: 'linux', env: {} }), /loopback/)
})

test('watchdogConfig applies defaults and clamps bounds', () => {
  const defaults = watchdogConfig({})
  assert.deepEqual(defaults, {
    enabled: true,
    intervalSeconds: 30,
    failureThreshold: 3,
    restartCooldownSeconds: 300,
    maxRestartsPerHour: 3,
    respectStop: true,
  })
  const tuned = watchdogConfig({
    enabled: false,
    intervalSeconds: 5,
    failureThreshold: 0,
    restartCooldownSeconds: 10,
    maxRestartsPerHour: 999,
    respectStop: false,
  })
  assert.equal(tuned.enabled, false)
  assert.equal(tuned.intervalSeconds, 10)
  assert.equal(tuned.failureThreshold, 1)
  assert.equal(tuned.restartCooldownSeconds, 30)
  assert.equal(tuned.maxRestartsPerHour, 60)
  assert.equal(tuned.respectStop, false)
})

test('serviceCommand builds a WSL command with the converted checkout path', () => {
  const config = normalizeConfig({
    baseUrl: 'http://127.0.0.1:3082',
    profile: 'superagent',
    checkout: 'E:\\work\\repo',
    runner: 'wsl',
    wslDistro: 'Ubuntu',
  }, { platform: 'win32', env: {} })
  const spec = serviceCommand(config, 'start')
  assert.equal(spec.command, 'wsl.exe')
  assert.deepEqual(spec.args.slice(0, 4), ['-d', 'Ubuntu', '--', 'bash'])
  const inner = spec.args[spec.args.length - 1]
  assert.match(inner, /cd '\/mnt\/e\/work\/repo'/)
  assert.match(inner, /--profile 'superagent'/)
  assert.match(inner, /--url 'http:\/\/127\.0\.0\.1:3082'/)
  assert.match(inner, / start$/)
})

test('serviceCommand builds a direct bash command in the checkout', () => {
  const config = normalizeConfig({
    baseUrl: 'http://127.0.0.1:3082',
    profile: 'superagent',
    checkout: '/home/me/repo',
    runner: 'direct',
  }, { platform: 'linux', env: {} })
  const spec = serviceCommand(config, 'restart')
  assert.equal(spec.command, 'bash')
  assert.equal(spec.cwd, '/home/me/repo')
  assert.match(spec.args[1], /restart$/)
})

test('serviceCommand adds --respect-stop only to watchdog start/restart', () => {
  const config = normalizeConfig({
    baseUrl: 'http://127.0.0.1:3082',
    profile: 'superagent',
    checkout: '/home/me/repo',
    runner: 'direct',
  }, { platform: 'linux', env: {} })
  const restart = serviceCommand(config, 'restart', { respectStop: true })
  assert.match(restart.args[1], /restart --respect-stop$/)
  const status = serviceCommand(config, 'status', { respectStop: true })
  assert.doesNotMatch(status.args[1], /--respect-stop/)
  const plain = serviceCommand(config, 'restart')
  assert.doesNotMatch(plain.args[1], /--respect-stop/)
})

test('inspectStart reports a missing service script', () => {
  const config = normalizeConfig({ checkout: 'Z:\\does-not-exist', runner: 'direct' }, { platform: 'linux', env: {} })
  const inspect = inspectStart(config, { platform: 'linux' })
  assert.equal(inspect.available, false)
  assert.match(inspect.problem, /scripts\/dsh-superagent/)
})

test('parseStatusOutput reads JSON that follows CLI warnings', () => {
  const output = [
    'your 131072x1 screen size is bogus. expect trouble',
    JSON.stringify({ pids: [1061], manually_stopped: false, health: { runtime: 'ready' } }, null, 2),
    'trailing warning',
  ].join('\n')
  const parsed = parseStatusOutput(output)
  assert.deepEqual(parsed.pids, [1061])
  assert.equal(parsed.health.runtime, 'ready')
  assert.equal(parseStatusOutput('not json'), null)
})
