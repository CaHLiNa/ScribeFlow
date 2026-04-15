import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getWorkbenchInspectorChromeEntries,
  getWorkbenchSidebarChromeEntries,
} from '../src/shared/workbenchChromeEntries.js'

const t = (value) => value

test('sidebar chrome entries follow the normalized workbench surface map', () => {
  assert.deepEqual(
    getWorkbenchSidebarChromeEntries(t, 'workspace').map((entry) => entry.key),
    ['files']
  )
  assert.deepEqual(
    getWorkbenchSidebarChromeEntries(t, 'removed-surface').map((entry) => entry.key),
    ['files']
  )
})

test('inspector chrome entries expose the document workspace panels', () => {
  assert.deepEqual(
    getWorkbenchInspectorChromeEntries(t, 'workspace').map((entry) => entry.key),
    ['outline', 'ai']
  )
  assert.deepEqual(
    getWorkbenchInspectorChromeEntries(t, 'removed-surface').map((entry) => entry.key),
    ['outline', 'ai']
  )
})

test('chrome entry labels and titles are localized through the provided translator', () => {
  const translated = getWorkbenchSidebarChromeEntries((value) => `x:${value}`, 'workspace')
  assert.equal(translated[0].label, 'x:Project files')

  const translatedConversion = getWorkbenchSidebarChromeEntries(
    (value) => `x:${value}`,
    'removed-surface'
  )
  assert.equal(translatedConversion[0].label, 'x:Project files')

  const translatedInspector = getWorkbenchInspectorChromeEntries(
    (value) => `x:${value}`,
    'workspace'
  )
  assert.equal(translatedInspector[0].label, 'x:Outline')
  assert.equal(translatedInspector[1].label, 'x:AI workflow')
})
