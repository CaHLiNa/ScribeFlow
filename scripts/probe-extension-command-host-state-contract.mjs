import assert from 'node:assert/strict'
import { buildExtensionHostDiagnostics } from '../src/domains/extensions/extensionHostDiagnostics.ts'
import { buildExtensionCommandHostState } from '../src/domains/extensions/extensionCommandHostState.ts'

const runtimeEntry = { activated: true }

function diagnosticsFor({
  extensionId = 'example-pdf-extension',
  workspaceRoot = '/tmp/workspace-a',
  hostStatus = {},
} = {}) {
  return buildExtensionHostDiagnostics({
    extensionId,
    workspaceRoot,
    hostStatus,
    runtimeEntry,
  })
}

const readyDiagnostics = diagnosticsFor({
  hostStatus: {
    runtime: 'node-extension-host-persistent',
    activeRuntimeSlots: [
      {
        extensionId: 'example-pdf-extension',
        workspaceRoot: '/tmp/workspace-a',
      },
    ],
    pendingPromptOwner: null,
  },
})
const readyState = buildExtensionCommandHostState(readyDiagnostics)
assert.equal(readyState.blocked, false)
assert.equal(readyState.status, 'ready')

const waitingDiagnostics = diagnosticsFor({
  hostStatus: {
    runtime: 'node-extension-host-persistent',
    activeRuntimeSlots: [
      {
        extensionId: 'example-pdf-extension',
        workspaceRoot: '/tmp/workspace-a',
      },
    ],
    pendingPromptOwner: {
      extensionId: 'example-pdf-extension',
      workspaceRoot: '/tmp/workspace-a',
    },
  },
})
const waitingState = buildExtensionCommandHostState(waitingDiagnostics)
assert.equal(waitingState.blocked, true)
assert.equal(waitingState.status, 'waiting')
assert.equal(waitingState.labelKey, 'Waiting for prompt')
assert.match(waitingState.messageKey, /this workspace/i)

const blockedDiagnostics = diagnosticsFor({
  hostStatus: {
    runtime: 'node-extension-host-persistent',
    activeRuntimeSlots: [
      {
        extensionId: 'example-pdf-extension',
        workspaceRoot: '/tmp/workspace-a',
      },
      {
        extensionId: 'another-extension',
        workspaceRoot: '/tmp/workspace-b',
      },
    ],
    pendingPromptOwner: {
      extensionId: 'another-extension',
      workspaceRoot: '/tmp/workspace-b',
    },
  },
})
const blockedState = buildExtensionCommandHostState(blockedDiagnostics)
assert.equal(blockedState.blocked, true)
assert.equal(blockedState.status, 'blocked')
assert.equal(blockedState.labelKey, 'Blocked')
assert.equal(blockedState.messageParams.extensionId, 'another-extension')
assert.equal(blockedState.messageParams.workspace, '/tmp/workspace-b')

console.log(JSON.stringify({
  ok: true,
  summary: {
    ready: readyState.status,
    waiting: waitingState.status,
    blocked: blockedState.status,
    blockedOwner: blockedState.messageParams.extensionId,
  },
}, null, 2))
