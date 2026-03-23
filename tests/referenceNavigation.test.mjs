import test from 'node:test'
import assert from 'node:assert/strict'

import { openReferencePdfInWorkspace } from '../src/domains/reference/referenceNavigation.js'

test('openReferencePdfInWorkspace is a no-op without a reference key', () => {
  const events = []
  const result = openReferencePdfInWorkspace({
    key: '',
    referencesStore: {
      pdfPathForKey: () => {
        events.push('lookup')
        return '/tmp/example.pdf'
      },
    },
    workspace: {
      openWorkspaceSurface: () => events.push('surface'),
    },
    editorStore: {
      openFile: (path) => events.push(`open:${path}`),
    },
  })

  assert.equal(result, null)
  assert.deepEqual(events, [])
})

test('openReferencePdfInWorkspace is a no-op when the reference has no PDF', () => {
  const events = []
  const result = openReferencePdfInWorkspace({
    key: 'ref-1',
    referencesStore: {
      pdfPathForKey: (key) => {
        events.push(`lookup:${key}`)
        return null
      },
    },
    workspace: {
      openWorkspaceSurface: () => events.push('surface'),
    },
    editorStore: {
      openFile: (path) => events.push(`open:${path}`),
    },
  })

  assert.equal(result, null)
  assert.deepEqual(events, ['lookup:ref-1'])
})

test('openReferencePdfInWorkspace switches back to the workspace before opening the PDF', () => {
  const events = []
  const result = openReferencePdfInWorkspace({
    key: 'ref-1',
    referencesStore: {
      pdfPathForKey: (key) => {
        events.push(`lookup:${key}`)
        return '/tmp/example.pdf'
      },
    },
    workspace: {
      openWorkspaceSurface: () => events.push('surface'),
    },
    editorStore: {
      openFile: (path) => events.push(`open:${path}`),
    },
  })

  assert.equal(result, '/tmp/example.pdf')
  assert.deepEqual(events, [
    'lookup:ref-1',
    'surface',
    'open:/tmp/example.pdf',
  ])
})
