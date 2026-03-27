import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPersistedEditorState,
  normalizeLoadedEditorState,
} from '../src/services/editorPersistence.js'
import { deriveRestoredEditorRuntimeState } from '../src/domains/editor/editorRestoreRuntime.js'

function isContextCandidatePath(path) {
  return !!path && !path.startsWith('preview:') && !path.startsWith('typst-preview:')
}

test('editor persistence reads old legacy preview panes and flags them for restore', () => {
  const sourcePath = '/workspace/chapter.md'
  const previewPath = `preview:${sourcePath}`
  const loaded = normalizeLoadedEditorState({
    version: 1,
    activePaneId: 'pane-preview',
    paneTree: {
      type: 'split',
      direction: 'vertical',
      ratio: 0.5,
      children: [
        { type: 'leaf', id: 'pane-source', tabs: [sourcePath], activeTab: sourcePath },
        { type: 'leaf', id: 'pane-preview', tabs: [previewPath], activeTab: previewPath },
      ],
    },
  })

  assert.deepEqual(loaded.legacyPreviewPaths, [previewPath])
  assert.equal(loaded.paneTree.type, 'split')
  assert.deepEqual(loaded.paneTree.children[1], {
    type: 'leaf',
    id: 'pane-preview',
    tabs: [previewPath],
    activeTab: previewPath,
  })

  const restored = deriveRestoredEditorRuntimeState({
    state: loaded,
    isContextCandidatePath,
  })

  assert.equal(restored.activePaneId, 'pane-preview')
  assert.equal(restored.lastContextPath, sourcePath)
  assert.deepEqual([...restored.legacyPreviewPaths], [previewPath])
})

test('editor persistence write-new strips workspace preview pseudo-tabs and collapses preview-only panes', () => {
  const sourcePath = '/workspace/main.tex'
  const previewPath = `preview:${sourcePath}`
  const persisted = buildPersistedEditorState({
    activePaneId: 'pane-preview',
    paneTree: {
      type: 'split',
      direction: 'vertical',
      ratio: 0.5,
      children: [
        { type: 'leaf', id: 'pane-source', tabs: [sourcePath], activeTab: sourcePath },
        { type: 'leaf', id: 'pane-preview', tabs: [previewPath], activeTab: previewPath },
      ],
    },
  })

  assert.deepEqual(persisted.paneTree, {
    type: 'leaf',
    id: 'pane-source',
    tabs: [sourcePath],
    activeTab: sourcePath,
  })
})

test('editor persistence preserve-open-legacy keeps restored preview pseudo-tabs until closed', () => {
  const sourcePath = '/workspace/main.typ'
  const previewPath = `typst-preview:${sourcePath}`
  const persisted = buildPersistedEditorState({
    activePaneId: 'pane-preview',
    legacyPreviewPaths: [previewPath],
    paneTree: {
      type: 'split',
      direction: 'vertical',
      ratio: 0.5,
      children: [
        { type: 'leaf', id: 'pane-source', tabs: [sourcePath], activeTab: sourcePath },
        { type: 'leaf', id: 'pane-preview', tabs: [previewPath], activeTab: previewPath },
      ],
    },
  })

  assert.equal(persisted.paneTree.type, 'split')
  assert.deepEqual(persisted.paneTree.children[1], {
    type: 'leaf',
    id: 'pane-preview',
    tabs: [previewPath],
    activeTab: previewPath,
  })
})

test('editor persistence keeps raw pdf viewers independent from workspace preview filtering', () => {
  const sourcePath = '/workspace/main.tex'
  const pdfPath = '/workspace/main.pdf'
  const persisted = buildPersistedEditorState({
    activePaneId: 'pane-pdf',
    paneTree: {
      type: 'split',
      direction: 'vertical',
      ratio: 0.5,
      children: [
        { type: 'leaf', id: 'pane-source', tabs: [sourcePath], activeTab: sourcePath },
        { type: 'leaf', id: 'pane-pdf', tabs: [pdfPath], activeTab: pdfPath },
      ],
    },
  })

  assert.equal(persisted.paneTree.type, 'split')
  assert.deepEqual(persisted.paneTree.children[1], {
    type: 'leaf',
    id: 'pane-pdf',
    tabs: [pdfPath],
    activeTab: pdfPath,
  })
})
