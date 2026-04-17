import test from 'node:test'
import assert from 'node:assert/strict'

import { createDocumentWorkspacePreviewAction, resolveDocumentPreviewCloseEffect } from '../src/domains/document/documentWorkspacePreviewRuntime.js'
import { reconcileDocumentWorkflow } from '../src/services/documentWorkflow/reconcile.js'
import {
  createWorkflowPreviewPath,
  getDocumentWorkflowKind,
  getPreferredWorkflowPreviewKind,
} from '../src/services/documentWorkflow/policy.js'

globalThis.window = globalThis.window || {}
window.__TAURI_INTERNALS__ = {
  invoke: async (command, args = {}) => {
    if (command !== 'document_workflow_reconcile') {
      throw new Error(`Unexpected invoke command: ${command}`)
    }
    const params = args.params || {}
    const sourcePath = params.activeFile
    const previewPath = `preview:${sourcePath}`
    const hasLegacyPreview = Array.isArray(params.previewBindings)
      && params.previewBindings.some((binding) => binding.previewPath === previewPath)
    const isMarkdown = sourcePath.endsWith('.md')
    const isLatex = sourcePath.endsWith('.tex')
    if (!isMarkdown && !isLatex) {
      return {
        type: 'inactive',
        trigger: params.trigger,
        kind: null,
        sourcePath: null,
        previewPath: null,
        previewKind: null,
        sourcePaneId: params.activePaneId || null,
        previewPaneId: null,
        state: 'inactive',
      }
    }
    if (isMarkdown && !params.allowLegacyPaneResult) {
      return {
        type: 'workspace-preview',
        kind: 'markdown',
        filePath: sourcePath,
        sourcePath,
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
    }
    if (isLatex) {
      return {
        type: 'source-only',
        kind: 'latex',
        sourcePath,
        sourcePaneId: params.activePaneId,
        previewKind: null,
        previewPath: null,
        trigger: params.trigger,
        previewPaneId: null,
        state: 'source-only',
      }
    }
    return {
      type: hasLegacyPreview ? 'ready-existing' : 'source-only',
      kind: 'markdown',
      sourcePath,
      previewKind: 'html',
      previewPath: hasLegacyPreview ? previewPath : null,
      sourcePaneId: params.activePaneId,
      trigger: params.trigger,
      previewPaneId: hasLegacyPreview ? 'pane-preview' : null,
      state: hasLegacyPreview ? 'ready' : 'source-only',
    }
  },
}

function createWorkflowStore({ previewBinding = null, detachedSources = {} } = {}) {
  return {
    previewPrefs: {
      markdown: { preferredPreview: 'html' },
    },
    previewBindings: previewBinding ? { [previewBinding.previewPath]: previewBinding } : {},
    session: {
      detachedSources,
    },
    getPreviewBinding(previewPath) {
      return previewBinding?.previewPath === previewPath ? previewBinding : null
    },
    inferPreviewKind(sourcePath, previewPath) {
      if (previewPath === `preview:${sourcePath}`) return 'html'
      return null
    },
  }
}

test('document workflow reconcile keeps latex source tabs in workspace mode without opening a preview pane', async () => {
  const result = await reconcileDocumentWorkflow({
    activeFile: '/workspace/main.tex',
    activePaneId: 'pane-source',
    paneTree: {
      type: 'leaf',
      id: 'pane-source',
      tabs: ['/workspace/main.tex'],
      activeTab: '/workspace/main.tex',
    },
    trigger: 'manual-open-preview',
    workflowStore: createWorkflowStore(),
    createWorkspacePreviewAction: createDocumentWorkspacePreviewAction,
    getDocumentWorkflowKind,
    getPreferredWorkflowPreviewKind,
    createWorkflowPreviewPath,
    force: true,
  })

  assert.deepEqual(result, {
    type: 'source-only',
    kind: 'latex',
    sourcePath: '/workspace/main.tex',
    sourcePaneId: 'pane-source',
    previewKind: null,
    previewPath: null,
    trigger: 'manual-open-preview',
    previewPaneId: null,
    state: 'source-only',
  })
})

test('document workflow reconcile preserves open legacy previews without making them the primary default', async () => {
  const sourcePath = '/workspace/chapter.md'
  const previewPath = `preview:${sourcePath}`
  const result = await reconcileDocumentWorkflow({
    activeFile: sourcePath,
    activePaneId: 'pane-source',
    paneTree: {
      type: 'split',
      direction: 'vertical',
      children: [
        { type: 'leaf', id: 'pane-source', tabs: [sourcePath], activeTab: sourcePath },
        { type: 'leaf', id: 'pane-preview', tabs: [previewPath], activeTab: previewPath },
      ],
    },
    trigger: 'editor-pane-sync',
    workflowStore: createWorkflowStore({
      previewBinding: {
        sourcePath,
        previewKind: 'html',
        previewPath,
        paneId: 'pane-preview',
      },
    }),
    createWorkspacePreviewAction: createDocumentWorkspacePreviewAction,
    getDocumentWorkflowKind,
    getPreferredWorkflowPreviewKind,
    createWorkflowPreviewPath,
    force: true,
  })

  assert.equal(result.type, 'workspace-preview')
  assert.equal(result.preserveOpenLegacy, true)
  assert.equal(result.previewMode, 'markdown')
  assert.equal(result.legacyPreviewPath, previewPath)
  assert.equal(result.legacyPreviewPaneId, 'pane-preview')
})

test('closing a preserved legacy preview does not detach the source or mislead later workspace reconciliation', async () => {
  const sourcePath = '/workspace/chapter.md'
  const previewPath = `preview:${sourcePath}`
  const closeEffect = resolveDocumentPreviewCloseEffect(previewPath, {
    previewBinding: {
      sourcePath,
      detachOnClose: false,
    },
  })

  assert.deepEqual(closeEffect, {
    sourcePath,
    markDetached: false,
  })

  const result = await reconcileDocumentWorkflow({
    activeFile: sourcePath,
    activePaneId: 'pane-source',
    paneTree: {
      type: 'leaf',
      id: 'pane-source',
      tabs: [sourcePath],
      activeTab: sourcePath,
    },
    trigger: 'editor-pane-sync',
    workflowStore: createWorkflowStore({ detachedSources: {} }),
    createWorkspacePreviewAction: createDocumentWorkspacePreviewAction,
    getDocumentWorkflowKind,
    getPreferredWorkflowPreviewKind,
    createWorkflowPreviewPath,
    force: true,
  })

  assert.equal(result.type, 'workspace-preview')
  assert.equal(result.preserveOpenLegacy, false)
})

test('document workflow reconcile still supports explicit legacy pane compatibility paths', async () => {
  const sourcePath = '/workspace/chapter.md'
  const previewPath = `preview:${sourcePath}`
  const result = await reconcileDocumentWorkflow({
    activeFile: sourcePath,
    activePaneId: 'pane-source',
    paneTree: {
      type: 'split',
      direction: 'vertical',
      children: [
        { type: 'leaf', id: 'pane-source', tabs: [sourcePath], activeTab: sourcePath },
        { type: 'leaf', id: 'pane-preview', tabs: [previewPath], activeTab: previewPath },
      ],
    },
    trigger: 'manual-open-preview',
    workflowStore: createWorkflowStore({
      previewBinding: {
        sourcePath,
        previewKind: 'html',
        previewPath,
        paneId: 'pane-preview',
      },
      detachedSources: {
        [sourcePath]: true,
      },
    }),
    createWorkspacePreviewAction: createDocumentWorkspacePreviewAction,
    getDocumentWorkflowKind,
    getPreferredWorkflowPreviewKind,
    createWorkflowPreviewPath,
    force: true,
    allowLegacyPaneResult: true,
  })

  assert.deepEqual(result, {
    type: 'ready-existing',
    kind: 'markdown',
    sourcePath,
    previewKind: 'html',
    previewPath,
    sourcePaneId: 'pane-source',
    trigger: 'manual-open-preview',
    previewPaneId: 'pane-preview',
    state: 'ready',
  })
})
