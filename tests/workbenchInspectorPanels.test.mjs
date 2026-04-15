import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ALL_WORKBENCH_INSPECTOR_PANELS,
  normalizeWorkbenchInspectorPanel,
} from '../src/shared/workbenchInspectorPanels.js'

test('workbench inspector panels expose the expected cross-surface panel ids', () => {
  assert.deepEqual(ALL_WORKBENCH_INSPECTOR_PANELS, ['outline', 'ai'])
})

test('workbench inspector panel normalization falls back to each surface default', () => {
  assert.equal(normalizeWorkbenchInspectorPanel('workspace', 'outline'), 'outline')
  assert.equal(normalizeWorkbenchInspectorPanel('workspace', 'ai'), 'ai')
  assert.equal(normalizeWorkbenchInspectorPanel('workspace', 'document-run'), 'outline')
  assert.equal(normalizeWorkbenchInspectorPanel('workspace', 'removed-panel'), 'outline')
  assert.equal(normalizeWorkbenchInspectorPanel('removed-surface', 'outline'), 'outline')
})
