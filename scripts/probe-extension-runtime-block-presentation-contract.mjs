import assert from 'node:assert/strict'
import {
  buildExtensionRuntimeBlockPresentation,
  describeExtensionRuntimeBlockPresentation,
  describeExtensionHostStatePresentation,
} from '../src/domains/extensions/extensionRuntimeBlockPresentation.ts'

function t(key, params = {}) {
  const suffix = Object.keys(params).length ? ` ${JSON.stringify(params)}` : ''
  return `${key}${suffix}`
}

const ready = buildExtensionRuntimeBlockPresentation({
  blocked: false,
  status: 'ready',
  tone: '',
  labelKey: 'Blocked',
  messageKey: 'Should not render',
  messageParams: { ignored: true },
})
assert.equal(ready.blocked, false)
assert.equal(ready.labelKey, '')
assert.equal(ready.messageKey, '')

const runtimeBlocked = describeExtensionRuntimeBlockPresentation({
  blocked: true,
  status: 'blocked',
  tone: 'is-blocked',
  labelKey: 'Blocked',
  messageKey: 'The shared extension host is currently blocked by {extensionId} in {workspace}. Resolve that prompt first.',
  messageParams: {
    extensionId: 'another-extension',
    workspace: '/tmp/workspace-b',
  },
}, t)
assert.equal(runtimeBlocked.blocked, true)
assert.equal(runtimeBlocked.status, 'blocked')
assert.equal(runtimeBlocked.toneClass, 'is-blocked')
assert.equal(runtimeBlocked.label, 'Blocked')
assert.equal(
  runtimeBlocked.message,
  'The shared extension host is currently blocked by {extensionId} in {workspace}. Resolve that prompt first. {"extensionId":"another-extension","workspace":"/tmp/workspace-b"}',
)

const hostWaiting = describeExtensionHostStatePresentation({
  blocked: true,
  status: 'waiting',
  tone: 'is-warning',
  labelKey: 'Waiting for prompt',
  messageKey: 'This extension is waiting for prompt input in {workspace}. Complete or cancel that prompt before running another command.',
  messageParams: {
    workspace: '/tmp/workspace-a',
  },
}, t)
assert.equal(hostWaiting.blocked, true)
assert.equal(hostWaiting.status, 'waiting')
assert.equal(hostWaiting.toneClass, 'is-warning')
assert.equal(hostWaiting.label, 'Waiting for prompt')
assert.equal(
  hostWaiting.message,
  'This extension is waiting for prompt input in {workspace}. Complete or cancel that prompt before running another command. {"workspace":"/tmp/workspace-a"}',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    readyBlocked: ready.blocked,
    blockedLabel: runtimeBlocked.label,
    blockedTone: runtimeBlocked.toneClass,
    waitingLabel: hostWaiting.label,
    waitingTone: hostWaiting.toneClass,
  },
}, null, 2))
