import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ALL_WORKBENCH_SIDEBAR_PANELS,
  normalizeWorkbenchSidebarPanel,
  normalizeWorkbenchSurface,
} from '../src/shared/workbenchSidebarPanels.js'

test('workbench sidebar panels expose the expected cross-surface panel ids', () => {
  assert.deepEqual(ALL_WORKBENCH_SIDEBAR_PANELS, ['files', 'references'])
})

test('workbench sidebar panel normalization falls back to each surface default', () => {
  assert.equal(normalizeWorkbenchSidebarPanel('workspace', 'files'), 'files')
  assert.equal(normalizeWorkbenchSidebarPanel('workspace', 'references'), 'references')
  assert.equal(normalizeWorkbenchSidebarPanel('workspace', 'outline'), 'files')
  assert.equal(normalizeWorkbenchSidebarPanel('removed-surface', 'files'), 'files')
  assert.equal(normalizeWorkbenchSidebarPanel('removed-surface', 'removed-panel'), 'files')
})

test('workbench surface normalization stays inside the supported shell surfaces', () => {
  assert.equal(normalizeWorkbenchSurface('workspace'), 'workspace')
  assert.equal(normalizeWorkbenchSurface('removed-surface'), 'workspace')
  assert.equal(normalizeWorkbenchSurface('invalid'), 'workspace')
})
