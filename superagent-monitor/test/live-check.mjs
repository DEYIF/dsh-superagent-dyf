/**
 * Manual live check of a configured dsh-superagent instance. Read-only: it
 * fetches the management state and, only if that fails, runs `status`.
 *
 *   node test/live-check.mjs
 *   node test/live-check.mjs --baseUrl http://127.0.0.1:3082 --profile superagent --checkout /mnt/e/...
 */
import { Monitor } from '../monitor.js'
import { inspectStart, normalizeConfig, serviceCommand } from '../runner.js'

const args = {}
for (let index = 2; index < process.argv.length; index += 2) {
  args[process.argv[index].replace(/^--/, '')] = process.argv[index + 1]
}
const config = normalizeConfig(args)
const start = inspectStart(config)
const monitor = new Monitor(config, { info() {}, error() {} })
const view = await monitor.view()
monitor.dispose()
console.log(JSON.stringify({
  config,
  start,
  serviceCommand: serviceCommand(config, 'status').display,
  view: {
    status: view.status,
    level: view.level,
    reachable: view.reachable,
    latencyMs: view.latencyMs,
    repository: view.repository,
    paused: view.state ? view.state.paused : null,
    health: view.state ? view.state.health : null,
    sources: view.sources,
    process: view.process,
    error: view.error,
    monitor: view.monitor,
    history: view.history,
  },
}, null, 2))
