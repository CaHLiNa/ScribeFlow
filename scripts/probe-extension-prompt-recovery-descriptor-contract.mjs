import assert from 'node:assert/strict'
import { buildExtensionPromptRecoveryDescriptor } from '../src/domains/extensions/extensionPromptRecovery.ts'

const empty = buildExtensionPromptRecoveryDescriptor(null)
assert.equal(empty.available, false)

const ready = buildExtensionPromptRecoveryDescriptor({
  extensionId: 'another-extension',
  workspaceRoot: '/tmp/workspace-b',
}, {
  cancelling: false,
})
assert.equal(ready.available, true)
assert.equal(ready.extensionId, 'another-extension')
assert.equal(ready.workspaceRoot, '/tmp/workspace-b')
assert.equal(ready.labelKey, 'Cancel Prompt')

const cancelling = buildExtensionPromptRecoveryDescriptor({
  extensionId: 'another-extension',
  workspaceRoot: '/tmp/workspace-b',
}, {
  cancelling: true,
})
assert.equal(cancelling.labelKey, 'Cancelling...')

console.log(JSON.stringify({
  ok: true,
  summary: {
    emptyAvailable: empty.available,
    readyAvailable: ready.available,
    readyOwner: `${ready.extensionId}@${ready.workspaceRoot}`,
    readyLabel: ready.labelKey,
    cancellingLabel: cancelling.labelKey,
  },
}, null, 2))
