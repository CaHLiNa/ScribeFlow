import test from 'node:test'
import assert from 'node:assert/strict'

import { createDocumentWorkspacePreviewAction, resolveDocumentPreviewCloseEffect } from '../src/domains/document/documentWorkspacePreviewRuntime.js'
import { reconcileDocumentWorkflow } from '../src/services/documentWorkflow/reconcile.js'
import {
  createWorkflowPreviewPath,
  getDocumentWorkflowKind,
  getPreferredWorkflowPreviewKind,
} from '../src/services/documentWorkflow/policy.js'

function createWorkflowStore({ previewBinding = null, detachedSources = {} } = {}) {
  return {
    previewPrefs: {
      markdown: { preferredPreview: 'html' },
      latex: { preferredPreview: 'pdf' },
      typst: { preferredPreview: 'native' },
    },
    session: {
      detachedSources,
    },
    getPreviewBinding(previewPath) {
      return previewBinding?.previewPath === previewPath ? previewBinding : null
    },
    inferPreviewKind(sourcePath, previewPath) {
      if (previewPath === `preview:${sourcePath}`) return 'html'
      if (previewPath === `typst-preview:${sourcePath}`) return 'native'
      return null
    },
  }
}

test('document workflow reconcile prefers workspace preview semantics for new source paths', () => {
  const result = reconcileDocumentWorkflow({
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
    type: 'workspace-preview',
    kind: 'latex',
    filePath: '/workspace/main.tex',
    sourcePath: '/workspace/main.tex',
    sourcePaneId: 'pane-source',
    previewKind: 'pdf',
    previewMode: 'pdf',
    previewTargetPath: '',
    targetResolution: 'unresolved',
    trigger: 'manual-open-preview',
    state: 'workspace-preview',
    preserveOpenLegacy: false,
    legacyReadOnly: false,
    legacyPreviewPath: '',
    legacyPreviewPaneId: null,
  })
})

test('document workflow reconcile preserves open legacy previews without making them the primary default', () => {
  const sourcePath = '/workspace/chapter.md'
  const previewPath = `preview:${sourcePath}`
  const result = reconcileDocumentWorkflow({
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

test('closing a preserved legacy preview does not detach the source or mislead later workspace reconciliation', () => {
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

  const result = reconcileDocumentWorkflow({
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

test('document workflow reconcile still supports explicit legacy pane compatibility paths', () => {
  const sourcePath = '/workspace/chapter.md'
  const previewPath = `preview:${sourcePath}`
  const result = reconcileDocumentWorkflow({
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
