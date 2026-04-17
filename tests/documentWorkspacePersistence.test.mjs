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

globalThis.window = globalThis.window || {}
window.__TAURI_INTERNALS__ = {
  invoke: async (command, args = {}) => {
    if (command !== 'document_workflow_reconcile') {
      throw new Error(`Unexpected invoke command: ${command}`)
    }
    const params = args.params || {}
    const previewPath = `preview:${params.activeFile}`
    const hasLegacyPreview = Array.isArray(params.previewBindings)
      && params.previewBindings.some((binding) => binding.previewPath === previewPath)
    return {
      type: 'workspace-preview',
      kind: 'markdown',
      filePath: params.activeFile,
      sourcePath: params.activeFile,
      sourcePaneId: params.activePaneId,
      previewKind: 'html',
      previewMode: 'markdown',
      previewTargetPath: '',
      targetResolution: 'not-needed',
      trigger: params.trigger,
      state: 'workspace-preview',
      preserveOpenLegacy: hasLegacyPreview,
      legacyReadOnly: false,
      legacyPreviewPath: hasLegacyPreview ? previewPath : '',
      legacyPreviewPaneId: hasLegacyPreview ? 'pane-preview' : null,
    }
  },
}

function isContextCandidatePath(path) {
  return !!path && !path.startsWith('preview:')
}

function createWorkflowStore({ previewBindings = {} } = {}) {
  return {
    previewPrefs: {
      markdown: { preferredPreview: 'html' },
    },
    previewBindings,
    session: {
      detachedSources: {},
    },
    getPreviewBinding() {
      return null
    },
    inferPreviewKind(sourcePath, previewPath) {
      if (previewPath === `preview:${sourcePath}`) return 'html'
      return null
    },
  }
}

test('document workspace persistence round-trip restores source-first workspace semantics instead of pane-first preview tabs', async () => {
  const sourcePath = '/workspace/main.md'
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

  const reconciled = await reconcileDocumentWorkflow({
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

test('document workspace persistence read-old keeps restored legacy preview tabs available for compatibility reconciliation', async () => {
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

  const reconciled = await reconcileDocumentWorkflow({
    activeFile: sourcePath,
    activePaneId: restored.activePaneId,
    paneTree: restored.paneTree,
    trigger: 'editor-pane-sync',
    workflowStore: createWorkflowStore({
      previewBindings: {
        [previewPath]: {
          sourcePath,
          previewPath,
          previewKind: 'html',
          paneId: 'pane-preview',
        },
      },
    }),
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
