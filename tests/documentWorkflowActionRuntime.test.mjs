import test from 'node:test'
import assert from 'node:assert/strict'

import { createDocumentWorkflowActionRuntime } from '../src/domains/document/documentWorkflowActionRuntime.js'

function createRuntime({
  workflowStore = {},
  buildOperationRuntime = {},
  typstPaneRuntime = {},
} = {}) {
  return createDocumentWorkflowActionRuntime({
    getWorkflowStore: () => workflowStore,
    getBuildOperationRuntime: () => buildOperationRuntime,
    getTypstPaneRuntime: () => typstPaneRuntime,
  })
}

test('document workflow action runtime returns workspace preview actions for markdown primary reveal paths', async () => {
  const runtime = createRuntime({
    workflowStore: {
      togglePreviewForSource(filePath, options = {}) {
        return { type: 'ready-existing' }
      },
    },
  })

  const result = await runtime.runPrimaryActionForFile('/workspace/chapter.md', {
    uiState: { kind: 'markdown', previewKind: 'html' },
    sourcePaneId: 'pane-source',
  })

  assert.deepEqual(result, {
    type: 'workspace-preview',
    kind: 'markdown',
    filePath: '/workspace/chapter.md',
    sourcePath: '/workspace/chapter.md',
    sourcePaneId: 'pane-source',
    previewKind: 'html',
    previewMode: 'markdown',
    previewTargetPath: '',
    targetResolution: 'not-needed',
    trigger: 'markdown-preview-toggle',
    state: 'workspace-preview',
    preserveOpenLegacy: false,
    legacyReadOnly: false,
    legacyPreviewPath: '',
    legacyPreviewPaneId: null,
  })
})

test('document workflow action runtime routes compile primary actions through the build operation runtime', async () => {
  const buildCalls = []
  const runtime = createRuntime({
    buildOperationRuntime: {
      async runBuildForFile(filePath, options = {}) {
        buildCalls.push({ filePath, options })
        return { ok: true }
      },
    },
  })

  const result = await runtime.runPrimaryActionForFile('/workspace/main.typ', {
    uiState: { kind: 'typst' },
    sourcePaneId: 'pane-source',
    buildOptions: {
      adapter: { kind: 'typst' },
      workflowOnly: false,
    },
  })

  assert.deepEqual(buildCalls, [{
    filePath: '/workspace/main.typ',
    options: {
      adapter: { kind: 'typst' },
      workflowOnly: false,
      sourcePaneId: 'pane-source',
      trigger: 'typst-compile-button',
    },
  }])
  assert.deepEqual(result, { ok: true })
})

test('document workflow action runtime keeps preview reveals separate from compile operations', async () => {
  const buildCalls = []
  const typstCalls = []
  const runtime = createRuntime({
    buildOperationRuntime: {
      async runBuildForFile(filePath, options = {}) {
        buildCalls.push({ filePath, options })
        return { ok: true }
      },
    },
    typstPaneRuntime: {
      async revealPreviewForFile(filePath, options = {}) {
        typstCalls.push({ filePath, options })
        return { type: 'workspace-preview', previewMode: 'typst-native' }
      },
      revealPdfForFile(filePath, options = {}) {
        typstCalls.push({ filePath, options, pdf: true })
        return { type: 'workspace-preview', previewMode: 'pdf' }
      },
    },
  })

  const previewResult = await runtime.revealPreviewForFile('/workspace/main.typ', {
    uiState: { kind: 'typst', previewKind: 'native' },
    sourcePaneId: 'pane-source',
    buildOptions: { adapter: { kind: 'typst' } },
  })
  const pdfResult = runtime.revealPdfForFile('/workspace/main.typ', {
    uiState: { kind: 'typst' },
    sourcePaneId: 'pane-source',
    buildOptions: { adapter: { kind: 'typst' } },
  })

  assert.equal(buildCalls.length, 0)
  assert.deepEqual(typstCalls, [{
    filePath: '/workspace/main.typ',
    options: {
      sourcePaneId: 'pane-source',
      buildOptions: { adapter: { kind: 'typst' } },
      allowLegacyPaneResult: false,
    },
  }, {
    filePath: '/workspace/main.typ',
    options: {
      sourcePaneId: 'pane-source',
      buildOptions: { adapter: { kind: 'typst' } },
      allowLegacyPaneResult: false,
    },
    pdf: true,
  }])
  assert.deepEqual(previewResult, { type: 'workspace-preview', previewMode: 'typst-native' })
  assert.deepEqual(pdfResult, { type: 'workspace-preview', previewMode: 'pdf' })
})

test('document workflow action runtime accepts explicit legacy pane preview delivery mode', async () => {
  const toggleCalls = []
  const runtime = createRuntime({
    workflowStore: {
      togglePreviewForSource(filePath, options = {}) {
        toggleCalls.push({ filePath, options })
        return { type: 'ready-existing' }
      },
    },
  })

  const result = await runtime.revealPreviewForFile('/workspace/main.tex', {
    uiState: { kind: 'latex', previewKind: 'pdf' },
    sourcePaneId: 'pane-source',
    previewDelivery: 'legacy-pane',
  })

  assert.deepEqual(toggleCalls, [{
    filePath: '/workspace/main.tex',
    options: {
      previewKind: 'pdf',
      activatePreview: true,
      jump: true,
      sourcePaneId: 'pane-source',
      trigger: 'workflow-toggle-preview',
    },
  }])
  assert.deepEqual(result, { type: 'ready-existing' })
})

test('document workflow action runtime delegates typst preview reveal to the typst pane runtime', async () => {
  const typstCalls = []
  const runtime = createRuntime({
    typstPaneRuntime: {
      async revealPreviewForFile(filePath, options = {}) {
        typstCalls.push({ filePath, options })
        return { type: 'workspace-preview', previewMode: 'typst-native' }
      },
    },
  })

  const result = await runtime.revealPreviewForFile('/workspace/main.typ', {
    uiState: { kind: 'typst', previewKind: 'native' },
    sourcePaneId: 'pane-source',
    buildOptions: { adapter: { kind: 'typst' } },
  })

  assert.deepEqual(typstCalls, [{
    filePath: '/workspace/main.typ',
    options: {
      sourcePaneId: 'pane-source',
      buildOptions: { adapter: { kind: 'typst' } },
      allowLegacyPaneResult: false,
    },
  }])
  assert.deepEqual(result, { type: 'workspace-preview', previewMode: 'typst-native' })
})

test('document workflow action runtime reveals non-typst previews as workspace-local actions', async () => {
  const runtime = createRuntime()

  const result = await runtime.revealPreviewForFile('/workspace/main.tex', {
    uiState: { kind: 'latex', previewKind: 'pdf' },
    sourcePaneId: 'pane-source',
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
    trigger: 'workflow-toggle-preview',
    state: 'workspace-preview',
    preserveOpenLegacy: false,
    legacyReadOnly: false,
    legacyPreviewPath: '',
    legacyPreviewPaneId: null,
  })
})

test('document workflow action runtime returns workspace-local PDF preview actions by default', () => {
  const typstCalls = []
  const runtime = createRuntime({
    typstPaneRuntime: {
      revealPdfForFile(filePath, options = {}) {
        typstCalls.push({ filePath, options })
        return { type: 'workspace-preview', previewMode: 'pdf' }
      },
    },
  })

  const previewResult = runtime.togglePdfPreviewForFile('/workspace/main.tex', {
    sourcePaneId: 'pane-source',
    adapterKind: 'latex',
  })
  const typstResult = runtime.revealPdfForFile('/workspace/main.typ', {
    uiState: { kind: 'typst' },
    sourcePaneId: 'pane-source',
    buildOptions: { adapter: { kind: 'typst' } },
  })

  assert.deepEqual(previewResult, {
    type: 'workspace-preview',
    kind: 'latex',
    filePath: '/workspace/main.tex',
    sourcePath: '/workspace/main.tex',
    sourcePaneId: 'pane-source',
    previewKind: 'pdf',
    previewMode: 'pdf',
    previewTargetPath: '',
    targetResolution: 'unresolved',
    trigger: 'latex-preview-toggle',
    state: 'workspace-preview',
    preserveOpenLegacy: false,
    legacyReadOnly: false,
    legacyPreviewPath: '',
    legacyPreviewPaneId: null,
  })
  assert.deepEqual(typstCalls, [{
    filePath: '/workspace/main.typ',
    options: {
      sourcePaneId: 'pane-source',
      buildOptions: { adapter: { kind: 'typst' } },
      allowLegacyPaneResult: false,
    },
  }])
  assert.deepEqual(typstResult, { type: 'workspace-preview', previewMode: 'pdf' })
})

test('document workflow action runtime still supports explicit legacy pane compatibility for markdown toggles', () => {
  const toggleCalls = []
  const runtime = createRuntime({
    workflowStore: {
      togglePreviewForSource(filePath, options = {}) {
        toggleCalls.push({ filePath, options })
        return { type: 'ready-existing' }
      },
    },
  })

  const result = runtime.toggleMarkdownPreviewForFile('/workspace/chapter.md', {
    sourcePaneId: 'pane-source',
    previewDelivery: 'legacy-pane',
  })

  assert.deepEqual(toggleCalls, [{
    filePath: '/workspace/chapter.md',
    options: {
      previewKind: 'html',
      activatePreview: true,
      sourcePaneId: 'pane-source',
      trigger: 'markdown-preview-toggle',
    },
  }])
  assert.deepEqual(result, { type: 'ready-existing' })
})
