import test from 'node:test'
import assert from 'node:assert/strict'

import { deriveRestoredEditorRuntimeState } from '../src/domains/editor/editorRestoreRuntime.js'
import { createDocumentWorkspacePreviewAction } from '../src/domains/document/documentWorkspacePreviewRuntime.js'
import {
  buildPersistedEditorState,
  normalizeLoadedEditorState,
} from '../src/services/editorPersistence.js'
import {
  createWorkflowPreviewPath,
  getDocumentWorkflowKind,
  getPreferredWorkflowPreviewKind,
} from '../src/services/documentWorkflow/policy.js'
import { reconcileDocumentWorkflow } from '../src/services/documentWorkflow/reconcile.js'

function isContextCandidatePath(path) {
  return !!path && !path.startsWith('preview:') && !path.startsWith('typst-preview:')
}

function createWorkflowStore() {
  return {
    previewPrefs: {
      markdown: { preferredPreview: 'html' },
      latex: { preferredPreview: 'pdf' },
      typst: { preferredPreview: 'native' },
    },
    session: {
      detachedSources: {},
    },
    getPreviewBinding() {
      return null
    },
    inferPreviewKind(sourcePath, previewPath) {
      if (previewPath === `preview:${sourcePath}`) return 'html'
      if (previewPath === `typst-preview:${sourcePath}`) return 'native'
      return null
    },
  }
}

test('document workspace persistence round-trip restores source-first workspace semantics instead of pane-first preview tabs', () => {
  const sourcePath = '/workspace/main.tex'
  const previewPath = `preview:${sourcePath}`
  const saved = buildPersistedEditorState({
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
  const loaded = normalizeLoadedEditorState(saved)
  const restored = deriveRestoredEditorRuntimeState({
    state: loaded,
    isContextCandidatePath,
  })

  assert.equal(restored.paneTree.type, 'leaf')
  assert.equal(restored.activePaneId, 'pane-source')
  assert.equal(restored.paneTree.activeTab, sourcePath)
  assert.equal(restored.legacyPreviewPaths.size, 0)

  const reconciled = reconcileDocumentWorkflow({
    activeFile: restored.paneTree.activeTab,
    activePaneId: restored.activePaneId,
    paneTree: restored.paneTree,
    trigger: 'editor-restore',
    workflowStore: createWorkflowStore(),
    createWorkspacePreviewAction: createDocumentWorkspacePreviewAction,
    getDocumentWorkflowKind,
    getPreferredWorkflowPreviewKind,
    createWorkflowPreviewPath,
    force: true,
  })

  assert.equal(reconciled.type, 'workspace-preview')
  assert.equal(reconciled.sourcePath, sourcePath)
  assert.equal(reconciled.preserveOpenLegacy, false)
  assert.equal(reconciled.legacyPreviewPath, '')
})

test('document workspace persistence read-old keeps restored legacy preview tabs available for compatibility reconciliation', () => {
  const sourcePath = '/workspace/chapter.md'
  const previewPath = `preview:${sourcePath}`
  const loaded = normalizeLoadedEditorState({
    version: 1,
    activePaneId: 'pane-source',
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

  const restored = deriveRestoredEditorRuntimeState({
    state: loaded,
    isContextCandidatePath,
  })

  assert.deepEqual([...restored.legacyPreviewPaths], [previewPath])

  const reconciled = reconcileDocumentWorkflow({
    activeFile: sourcePath,
    activePaneId: restored.activePaneId,
    paneTree: restored.paneTree,
    trigger: 'editor-pane-sync',
    workflowStore: createWorkflowStore(),
    createWorkspacePreviewAction: createDocumentWorkspacePreviewAction,
    getDocumentWorkflowKind,
    getPreferredWorkflowPreviewKind,
    createWorkflowPreviewPath,
    force: true,
  })

  assert.equal(reconciled.type, 'workspace-preview')
  assert.equal(reconciled.preserveOpenLegacy, true)
  assert.equal(reconciled.legacyPreviewPath, previewPath)
  assert.equal(reconciled.legacyPreviewPaneId, 'pane-preview')
})
