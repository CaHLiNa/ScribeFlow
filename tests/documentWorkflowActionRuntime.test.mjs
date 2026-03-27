import test from 'node:test'
import assert from 'node:assert/strict'

import { createDocumentWorkflowActionRuntime } from '../src/domains/document/documentWorkflowActionRuntime.js'

function createWorkflowStore(overrides = {}) {
  return {
    getWorkspacePreviewStateForFile() {
      return null
    },
    showWorkspacePreviewForFile(filePath, options = {}) {
      return { type: 'workspace-preview', filePath, ...options }
    },
    switchWorkspacePreviewModeForFile(filePath, options = {}) {
      return { type: 'workspace-preview', filePath, ...options }
    },
    hideWorkspacePreviewForFile(filePath) {
      return { type: 'workspace-preview-hidden', filePath }
    },
    togglePreviewForSource(filePath, options = {}) {
      return { type: 'legacy-preview', filePath, ...options }
    },
    ...overrides,
  }
}

test('workspace markdown toggle hides an already visible inline preview', () => {
  const calls = []
  const workflowStore = createWorkflowStore({
    getWorkspacePreviewStateForFile() {
      return { previewVisible: true, previewMode: 'markdown' }
    },
    hideWorkspacePreviewForFile(filePath) {
      calls.push(['hide', filePath])
      return { type: 'workspace-preview-hidden', filePath }
    },
  })

  const runtime = createDocumentWorkflowActionRuntime({
    getWorkflowStore: () => workflowStore,
  })

  const result = runtime.toggleMarkdownPreviewForFile('/workspace/note.md', {
    sourcePaneId: 'pane-source',
  })

  assert.deepEqual(result, { type: 'workspace-preview-hidden', filePath: '/workspace/note.md' })
  assert.deepEqual(calls, [['hide', '/workspace/note.md']])
})

test('workspace markdown toggle shows the split preview when it is hidden', () => {
  const calls = []
  const workflowStore = createWorkflowStore({
    showWorkspacePreviewForFile(filePath, options = {}) {
      calls.push(['show', filePath, options])
      return { type: 'workspace-preview', filePath, ...options }
    },
  })

  const runtime = createDocumentWorkflowActionRuntime({
    getWorkflowStore: () => workflowStore,
  })

  const result = runtime.toggleMarkdownPreviewForFile('/workspace/note.md', {
    sourcePaneId: 'pane-source',
  })

  assert.equal(result.type, 'workspace-preview')
  assert.equal(result.filePath, '/workspace/note.md')
  assert.equal(result.previewKind, 'html')
  assert.deepEqual(calls, [[
    'show',
    '/workspace/note.md',
    {
      previewKind: 'html',
      sourcePaneId: 'pane-source',
      trigger: 'markdown-preview-toggle',
    },
  ]])
})

test('workspace pdf toggle hides the current inline pdf preview before reopening', () => {
  const calls = []
  const workflowStore = createWorkflowStore({
    getWorkspacePreviewStateForFile() {
      return { previewVisible: true, previewMode: 'pdf' }
    },
    hideWorkspacePreviewForFile(filePath) {
      calls.push(['hide', filePath])
      return { type: 'workspace-preview-hidden', filePath }
    },
  })

  const runtime = createDocumentWorkflowActionRuntime({
    getWorkflowStore: () => workflowStore,
  })

  const result = runtime.togglePdfPreviewForFile('/workspace/paper.tex', {
    adapterKind: 'latex',
    sourcePaneId: 'pane-source',
  })

  assert.deepEqual(result, { type: 'workspace-preview-hidden', filePath: '/workspace/paper.tex' })
  assert.deepEqual(calls, [['hide', '/workspace/paper.tex']])
})

test('workspace reveal preview reopens the requested mode when it is not already visible', async () => {
  const calls = []
  const workflowStore = createWorkflowStore({
    showWorkspacePreviewForFile(filePath, options = {}) {
      calls.push(['show', filePath, options])
      return { type: 'workspace-preview', filePath, ...options }
    },
  })

  const runtime = createDocumentWorkflowActionRuntime({
    getWorkflowStore: () => workflowStore,
  })

  const result = await runtime.revealPreviewForFile('/workspace/paper.typ', {
    uiState: { kind: 'typst', previewKind: 'native' },
    sourcePaneId: 'pane-source',
    buildOptions: { requestId: 'build-1' },
  })

  assert.equal(result.type, 'workspace-preview')
  assert.equal(result.previewKind, 'native')
  assert.deepEqual(calls, [[
    'show',
    '/workspace/paper.typ',
    {
      previewKind: 'native',
      sourcePaneId: 'pane-source',
      trigger: 'workflow-toggle-preview',
    },
  ]])
})

test('legacy typst reveal delegates to the dedicated pane runtime', async () => {
  const calls = []
  const typstPaneRuntime = {
    revealPreviewForFile(filePath, options = {}) {
      calls.push(['preview', filePath, options])
      return { type: 'legacy-typst-preview', filePath, ...options }
    },
    revealPdfForFile(filePath, options = {}) {
      calls.push(['pdf', filePath, options])
      return { type: 'legacy-typst-pdf', filePath, ...options }
    },
  }

  const runtime = createDocumentWorkflowActionRuntime({
    getWorkflowStore: () => createWorkflowStore(),
    getTypstPaneRuntime: () => typstPaneRuntime,
  })

  const previewResult = await runtime.revealPreviewForFile('/workspace/paper.typ', {
    uiState: { kind: 'typst', previewKind: 'native' },
    sourcePaneId: 'pane-source',
    buildOptions: { ticket: 'preview' },
    allowLegacyPaneResult: true,
  })
  const pdfResult = runtime.revealPdfForFile('/workspace/paper.typ', {
    uiState: { kind: 'typst', previewKind: 'pdf' },
    sourcePaneId: 'pane-source',
    buildOptions: { ticket: 'pdf' },
    allowLegacyPaneResult: true,
  })

  assert.equal(previewResult.type, 'legacy-typst-preview')
  assert.equal(pdfResult.type, 'legacy-typst-pdf')
  assert.deepEqual(calls, [
    ['preview', '/workspace/paper.typ', {
      sourcePaneId: 'pane-source',
      buildOptions: { ticket: 'preview' },
      allowLegacyPaneResult: true,
    }],
    ['pdf', '/workspace/paper.typ', {
      sourcePaneId: 'pane-source',
      buildOptions: { ticket: 'pdf' },
      allowLegacyPaneResult: true,
    }],
  ])
})

test('primary document actions still route compile intents through the build runtime', async () => {
  const calls = []
  const buildOperationRuntime = {
    runBuildForFile(filePath, options = {}) {
      calls.push([filePath, options])
      return { type: 'compile', filePath, ...options }
    },
  }

  const runtime = createDocumentWorkflowActionRuntime({
    getWorkflowStore: () => createWorkflowStore(),
    getBuildOperationRuntime: () => buildOperationRuntime,
  })

  const result = await runtime.runPrimaryActionForFile('/workspace/paper.tex', {
    uiState: { kind: 'latex' },
    sourcePaneId: 'pane-source',
    buildOptions: { from: 'toolbar' },
  })

  assert.equal(result.type, 'compile')
  assert.deepEqual(calls, [[
    '/workspace/paper.tex',
    {
      from: 'toolbar',
      sourcePaneId: 'pane-source',
      trigger: 'latex-compile-button',
    },
  ]])
})
