import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveStatus } from '../monitor.js'

const readyState = {
  setup: { problem: null, feishuProblem: null },
  health: { runtime: { state: 'ready', detail: 'Orchestrator is ready' }, github: { state: 'ready', detail: '0 notifications' } },
  paused: false,
}

test('a running operation wins over every other state', () => {
  const result = deriveStatus({ reachable: true, state: readyState, process: null, operation: { running: true } })
  assert.equal(result.status, 'starting')
  assert.equal(result.level, 'warn')
})

test('unreachable with live pids is running but not answering', () => {
  const result = deriveStatus({ reachable: false, state: null, process: { known: true, pids: [1], manuallyStopped: false }, operation: null })
  assert.equal(result.status, 'unreachable')
  assert.equal(result.level, 'error')
})

test('unreachable with no pids is stopped', () => {
  const result = deriveStatus({ reachable: false, state: null, process: { known: true, pids: [], manuallyStopped: true }, operation: null })
  assert.equal(result.status, 'stopped')
  assert.equal(result.level, 'idle')
})

test('an unreadable process check is unknown', () => {
  const result = deriveStatus({ reachable: false, state: null, process: { known: false, pids: [], error: 'timeout' }, operation: null })
  assert.equal(result.status, 'unknown')
})

test('setup problems are reported as setup', () => {
  const result = deriveStatus({
    reachable: true,
    state: { ...readyState, setup: { problem: { detail: 'The agent GitHub CLI is not set.' } } },
    process: null,
    operation: null,
  })
  assert.equal(result.status, 'setup')
  assert.match(result.detail, /GitHub CLI/)
})

test('a part error is an error even when the runtime is ready', () => {
  const result = deriveStatus({
    reachable: true,
    state: {
      setup: { problem: null },
      health: { runtime: { state: 'ready' }, github: { state: 'error', detail: 'gh failed' } },
      paused: false,
    },
    process: null,
    operation: null,
  })
  assert.equal(result.status, 'error')
  assert.equal(result.level, 'error')
})

test('pausing processing is a warning, not an error', () => {
  const result = deriveStatus({ reachable: true, state: { ...readyState, paused: true }, process: null, operation: null })
  assert.equal(result.status, 'paused')
  assert.equal(result.level, 'warn')
})

test('a ready runtime with no errors is ready', () => {
  const result = deriveStatus({ reachable: true, state: readyState, process: null, operation: null })
  assert.equal(result.status, 'ready')
  assert.equal(result.level, 'ok')
  assert.equal(result.detail, 'Orchestrator is ready')
})
