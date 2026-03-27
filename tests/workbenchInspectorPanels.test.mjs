import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ALL_WORKBENCH_INSPECTOR_PANELS,
  normalizeWorkbenchInspectorPanel,
} from '../src/shared/workbenchInspectorPanels.js'

test('workbench inspector panels expose the expected cross-surface panel ids', () => {
  assert.deepEqual(ALL_WORKBENCH_INSPECTOR_PANELS, [
    'outline',
    'backlinks',
    'document-run',
    'library-details',
  ])
})

test('workbench inspector panel normalization falls back to each surface default', () => {
  assert.equal(normalizeWorkbenchInspectorPanel('workspace', 'outline'), 'outline')
  assert.equal(normalizeWorkbenchInspectorPanel('workspace', 'document-run'), 'document-run')
  assert.equal(normalizeWorkbenchInspectorPanel('workspace', 'library-details'), 'outline')
  assert.equal(normalizeWorkbenchInspectorPanel('conversion', 'outline'), '')
  assert.equal(normalizeWorkbenchInspectorPanel('library', 'library-details'), 'library-details')
  assert.equal(normalizeWorkbenchInspectorPanel('library', 'backlinks'), 'library-details')
  assert.equal(normalizeWorkbenchInspectorPanel('ai', 'outline'), '')
})
