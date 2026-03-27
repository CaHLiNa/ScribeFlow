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
    ['files', 'references'],
  )
  assert.deepEqual(
    getWorkbenchSidebarChromeEntries(t, 'conversion').map((entry) => entry.key),
    ['pdf-translate', 'pdf-translate-tasks', 'files'],
  )
  assert.deepEqual(
    getWorkbenchSidebarChromeEntries(t, 'library').map((entry) => entry.key),
    ['library-views', 'library-tags'],
  )
  assert.deepEqual(
    getWorkbenchSidebarChromeEntries(t, 'ai').map((entry) => entry.key),
    ['ai-chats'],
  )
})

test('inspector chrome entries expose workspace and library panels but no ai inspector', () => {
  assert.deepEqual(
    getWorkbenchInspectorChromeEntries(t, 'workspace').map((entry) => entry.key),
    ['outline', 'backlinks', 'document-run'],
  )
  assert.deepEqual(
    getWorkbenchInspectorChromeEntries(t, 'conversion').map((entry) => entry.key),
    [],
  )
  assert.deepEqual(
    getWorkbenchInspectorChromeEntries(t, 'library').map((entry) => entry.key),
    ['library-details'],
  )
  assert.deepEqual(
    getWorkbenchInspectorChromeEntries(t, 'ai').map((entry) => entry.key),
    [],
  )
})

test('chrome entry labels and titles are localized through the provided translator', () => {
  const translated = getWorkbenchSidebarChromeEntries((value) => `x:${value}`, 'workspace')
  assert.equal(translated[0].label, 'x:Project files')
  assert.equal(translated[1].title, 'x:References')

  const translatedConversion = getWorkbenchSidebarChromeEntries((value) => `x:${value}`, 'conversion')
  assert.equal(translatedConversion[0].label, 'x:PDF Translation')
  assert.equal(translatedConversion[1].title, 'x:Recent tasks')

  const translatedInspector = getWorkbenchInspectorChromeEntries((value) => `x:${value}`, 'workspace')
  assert.equal(translatedInspector[2].label, 'x:Document run')
})
