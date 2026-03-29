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
    hideWorkspacePreviewForFile(filePath) {
      return { type: 'workspace-preview-hidden', filePath }
    },
    togglePreviewForSource(filePath, options = {}) {
      return { type: 'legacy-preview', filePath, ...options }
    },
    getArtifactPathForFile() {
      return '/workspace/build/output.pdf'
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

test('workflow output action opens compiled artifacts externally', async () => {
  const openCalls = []
  const runtime = createDocumentWorkflowActionRuntime({
    getWorkflowStore: () => createWorkflowStore(),
    openOutputPath: async (path) => {
      openCalls.push(path)
      return true
    },
  })

  const result = await runtime.openWorkflowOutputForFile('/workspace/paper.tex', {
    uiState: { kind: 'latex' },
    sourcePaneId: 'pane-source',
    trigger: 'toolbar-open-output',
  })

  assert.deepEqual(openCalls, ['/workspace/build/output.pdf'])
  assert.deepEqual(result, {
    type: 'external-output-opened',
    filePath: '/workspace/paper.tex',
    artifactPath: '/workspace/build/output.pdf',
    trigger: 'toolbar-open-output',
  })
})

test('workspace reveal preview reopens the requested typst native mode when it is not already visible', async () => {
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
