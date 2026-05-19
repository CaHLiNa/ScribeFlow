import assert from 'node:assert/strict'
import { describeExtensionHostStatusSurface } from '../src/domains/extensions/extensionHostStatusPresentation.ts'

function t(key, params = {}) {
  const suffix = Object.keys(params).length ? ` ${JSON.stringify(params)}` : ''
  return `${key}${suffix}`
}

const idle = describeExtensionHostStatusSurface({
  badgeKey: 'Idle',
  titleKey: 'Extension host runtime is idle',
  descriptionKey: 'No extension runtime slots are currently active.',
  toneClass: 'is-idle',
  summaryParts: [],
  recoveryOwner: null,
}, t)
assert.equal(idle.badge, 'Idle')
assert.equal(idle.title, 'Extension host runtime is idle')
assert.equal(idle.description, 'No extension runtime slots are currently active.')
assert.equal(idle.summaryText, '')

const blocked = describeExtensionHostStatusSurface({
  badgeKey: 'Blocked',
  titleKey: 'Extension host is waiting for prompt input',
  descriptionKey: 'A pending prompt from {extensionId} in {workspace} is blocking new top-level host requests until it is completed or cancelled.',
  descriptionParams: {
    extensionId: 'another-extension',
    workspace: '/tmp/workspace-b',
  },
  toneClass: 'is-warning',
  summaryParts: [
    {
      key: 'Also active in another workspace: {roots}',
      params: { roots: '/tmp/workspace-a' },
    },
    {
      key: 'Blocked by prompt from {extensionId} in {workspace}',
      params: {
        extensionId: 'another-extension',
        workspace: '/tmp/workspace-b',
      },
    },
  ],
  recoveryOwner: {
    extensionId: 'another-extension',
    workspaceRoot: '/tmp/workspace-b',
  },
}, t)
assert.equal(blocked.badge, 'Blocked')
assert.equal(
  blocked.description,
  'A pending prompt from {extensionId} in {workspace} is blocking new top-level host requests until it is completed or cancelled. {"extensionId":"another-extension","workspace":"/tmp/workspace-b"}',
)
assert.equal(
  blocked.summaryText,
  'Also active in another workspace: {roots} {"roots":"/tmp/workspace-a"} · Blocked by prompt from {extensionId} in {workspace} {"extensionId":"another-extension","workspace":"/tmp/workspace-b"}',
)
assert.equal(blocked.recoveryOwner.extensionId, 'another-extension')
assert.equal(blocked.recoveryOwner.workspaceRoot, '/tmp/workspace-b')

console.log(JSON.stringify({
  ok: true,
  summary: {
    idleBadge: idle.badge,
    blockedBadge: blocked.badge,
    blockedTone: blocked.toneClass,
    blockedSummary: blocked.summaryText,
    recoveryOwner: `${blocked.recoveryOwner.extensionId}@${blocked.recoveryOwner.workspaceRoot}`,
  },
}, null, 2))
