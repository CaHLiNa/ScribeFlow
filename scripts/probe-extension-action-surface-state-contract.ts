import assert from 'node:assert/strict'
import { buildExtensionActionSurfaceState } from '../src/domains/extensions/extensionActionSurfaceState.ts'

const hostDiagnostics = {
  ownsPendingPrompt: false,
  blockedByForeignPrompt: true,
  pendingPromptOwner: {
    extensionId: 'another-extension',
    workspaceRoot: '/tmp/workspace-b',
  },
  blockingPromptWorkspaceRoot: '/tmp/workspace-b',
}

const blockedHeaderAction = buildExtensionActionSurfaceState({
  hostDiagnostics,
  headerAction: {
    commandId: 'example.command',
  },
})
assert.equal(blockedHeaderAction.runtimeBlock.blocked, true)
assert.equal(blockedHeaderAction.headerActionBlocked, true)

const blockedResultEntry = buildExtensionActionSurfaceState({
  hostDiagnostics,
  resultEntry: {
    action: 'execute-command',
    commandId: 'example.command',
  },
})
assert.equal(blockedResultEntry.resultEntryBlocked, true)

const blockedTreePrimary = buildExtensionActionSurfaceState({
  hostDiagnostics,
  primaryTreeItem: {
    id: 'item-1',
    commandId: 'example.command',
    collapsibleState: 'none',
  },
})
assert.equal(blockedTreePrimary.primaryTreeItemBlocked, true)

const expandableTreePrimary = buildExtensionActionSurfaceState({
  hostDiagnostics,
  primaryTreeItem: {
    id: 'group-1',
    commandId: '',
    collapsibleState: 'collapsed',
  },
})
assert.equal(expandableTreePrimary.primaryTreeItemBlocked, false)

const passiveResultEntry = buildExtensionActionSurfaceState({
  hostDiagnostics,
  resultEntry: {
    action: 'open',
    path: '/tmp/output.pdf',
  },
})
assert.equal(passiveResultEntry.resultEntryBlocked, false)

console.log(JSON.stringify({
  ok: true,
  summary: {
    blockedHeaderAction: blockedHeaderAction.headerActionBlocked,
    blockedResultEntry: blockedResultEntry.resultEntryBlocked,
    blockedTreePrimary: blockedTreePrimary.primaryTreeItemBlocked,
    expandableTreePrimary: expandableTreePrimary.primaryTreeItemBlocked,
    passiveResultEntry: passiveResultEntry.resultEntryBlocked,
  },
}, null, 2))
