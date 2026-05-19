import assert from 'node:assert/strict'
import { buildExtensionHostStatusSurface } from '../src/domains/extensions/extensionHostStatusSurface.ts'

const idle = buildExtensionHostStatusSurface({}, { hostRuntimeSlots: [] })
assert.equal(idle.badgeKey, 'Idle')
assert.equal(idle.toneClass, 'is-idle')
assert.equal(idle.recoveryOwner, null)

const active = buildExtensionHostStatusSurface({
  hasActiveWorkspaceRuntime: true,
  activeWorkspaceSlotCount: 1,
}, {
  hostRuntimeSlots: [{ extensionId: 'example', workspaceRoot: '/tmp/workspace-a' }],
})
assert.equal(active.badgeKey, 'Active')
assert.equal(active.toneClass, 'is-active')
assert.equal(active.summaryParts[0].key, 'Active in this workspace')

const blocked = buildExtensionHostStatusSurface({
  blockedByForeignPrompt: true,
  pendingPromptOwner: {
    extensionId: 'another-extension',
    workspaceRoot: '/tmp/workspace-b',
  },
  blockingPromptWorkspaceRoot: '/tmp/workspace-b',
}, { hostRuntimeSlots: [] })
assert.equal(blocked.badgeKey, 'Blocked')
assert.equal(blocked.toneClass, 'is-warning')
assert.equal(blocked.recoveryOwner.extensionId, 'another-extension')
assert.equal(blocked.recoveryOwner.workspaceRoot, '/tmp/workspace-b')

const waiting = buildExtensionHostStatusSurface({
  extensionId: 'example-pdf-extension',
  ownsPendingPrompt: true,
  pendingPromptWorkspaceRoot: '/tmp/workspace-a',
  pendingPromptInActiveWorkspace: true,
}, { hostRuntimeSlots: [] })
assert.equal(waiting.badgeKey, 'Waiting for prompt')
assert.equal(waiting.recoveryOwner.extensionId, 'example-pdf-extension')
assert.equal(waiting.recoveryOwner.workspaceRoot, '/tmp/workspace-a')

console.log(JSON.stringify({
  ok: true,
  summary: {
    idleBadge: idle.badgeKey,
    activeBadge: active.badgeKey,
    blockedBadge: blocked.badgeKey,
    waitingBadge: waiting.badgeKey,
    blockedOwner: blocked.recoveryOwner.extensionId,
    waitingOwner: waiting.recoveryOwner.extensionId,
  },
}, null, 2))
