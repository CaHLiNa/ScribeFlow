import test from 'node:test'
import assert from 'node:assert/strict'

import { createDocumentWorkflowTypstPaneRuntime } from '../src/domains/document/documentWorkflowTypstPaneRuntime.js'

function createEditorStore({
  panes = {},
  neighborByPane = {},
  splitTargetId = 'pane-split',
} = {}) {
  const store = {
    paneTree: { type: 'split' },
    activePaneId: 'pane-source',
    openCalls: [],
    closeCalls: [],
    splitCalls: [],
    setActivePaneCalls: [],
    panes: Object.fromEntries(
      Object.entries(panes).map(([id, pane]) => [id, {
        id,
        tabs: [...(pane.tabs || [])],
        activeTab: pane.activeTab || '',
      }]),
    ),
    findPane(_paneTree, paneId) {
      return this.panes[paneId] || null
    },
    findPaneWithTab(tabPath) {
      return Object.values(this.panes).find(pane => pane.tabs.includes(tabPath)) || null
    },
    findRightNeighborLeaf(paneId) {
      const neighborId = neighborByPane[paneId]
      return neighborId ? this.panes[neighborId] || null : null
    },
    openFileInPane(path, paneId, options = {}) {
      const pane = this.panes[paneId]
      if (!pane) return null
      if (!pane.tabs.includes(path)) {
        pane.tabs.push(path)
      }
      pane.activeTab = path
      if (options.activatePane) {
        this.activePaneId = paneId
      }
      this.openCalls.push({ path, paneId, options })
      return paneId
    },
    closeTab(paneId, path) {
      const pane = this.panes[paneId]
      if (!pane) return
      pane.tabs = pane.tabs.filter(tab => tab !== path)
      if (pane.activeTab === path) {
        pane.activeTab = pane.tabs.at(-1) || ''
      }
      this.closeCalls.push({ paneId, path })
    },
    closeFileFromAllPanes(path) {
      Object.values(this.panes).forEach((pane) => {
        if (pane.tabs.includes(path)) {
          this.closeTab(pane.id, path)
        }
      })
    },
    splitPaneWith(sourcePaneId, direction, tabPath) {
      this.splitCalls.push({ sourcePaneId, direction, tabPath })
      this.panes[splitTargetId] = {
        id: splitTargetId,
        tabs: [tabPath],
        activeTab: tabPath,
      }
      return splitTargetId
    },
    setActivePane(paneId) {
      this.activePaneId = paneId
      this.setActivePaneCalls.push(paneId)
    },
  }

  return store
}

function createWorkflowStore({
  previewBinding = null,
  session = {},
  previewPath = 'typst-preview:/workspace/main.typ',
  artifactPath = '/workspace/main.pdf',
  ensureResult = null,
} = {}) {
  return {
    session: {
      previewSourcePath: null,
      previewKind: null,
      previewPaneId: null,
      ...session,
    },
    getArtifactCalls: [],
    closePreviewCalls: [],
    reconcileCalls: [],
    ensureCalls: [],
    toggleCalls: [],
    findPreviewBindingForSource(sourcePath, previewKind) {
      if (
        previewBinding
        && previewBinding.sourcePath === sourcePath
        && (!previewKind || previewBinding.previewKind === previewKind)
      ) {
        return previewBinding
      }
      return null
    },
    getPreviewPathForSource(sourcePath, previewKind) {
      return sourcePath && previewKind === 'native' ? previewPath : ''
    },
    getArtifactPathForFile(sourcePath, options = {}) {
      this.getArtifactCalls.push({ sourcePath, options })
      return artifactPath
    },
    closePreviewForSource(sourcePath, options = {}) {
      this.closePreviewCalls.push({ sourcePath, options })
      return null
    },
    reconcile(options = {}) {
      this.reconcileCalls.push(options)
      return null
    },
    ensurePreviewForSource(sourcePath, options = {}) {
      this.ensureCalls.push({ sourcePath, options })
      return ensureResult
    },
    async togglePreviewForSource(sourcePath, options = {}) {
      this.toggleCalls.push({ sourcePath, options })
      return {
        type: 'ready-existing',
        previewPaneId: previewBinding?.paneId || 'pane-preview',
        previewPath,
      }
    },
  }
}

function createRuntime({
  editorStore,
  workflowStore,
} = {}) {
  return createDocumentWorkflowTypstPaneRuntime({
    getEditorStore: () => editorStore,
    getWorkflowStore: () => workflowStore,
  })
}

test('document workflow typst pane runtime returns workspace preview actions by default', async () => {
  const sourcePath = '/workspace/main.typ'
  const runtime = createRuntime({
    editorStore: createEditorStore({
      panes: {
        'pane-source': { tabs: [sourcePath], activeTab: sourcePath },
      },
    }),
    workflowStore: createWorkflowStore(),
  })

  const previewResult = await runtime.revealPreviewForFile(sourcePath, {
    sourcePaneId: 'pane-source',
    buildOptions: { adapter: { kind: 'typst' } },
  })
  const pdfResult = runtime.revealPdfForFile(sourcePath, {
    sourcePaneId: 'pane-source',
    buildOptions: { adapter: { kind: 'typst' } },
  })

  assert.deepEqual(previewResult, {
    type: 'workspace-preview',
    kind: 'typst',
    filePath: sourcePath,
    sourcePath,
    sourcePaneId: 'pane-source',
    previewKind: 'native',
    previewMode: 'typst-native',
    previewTargetPath: '',
    targetResolution: 'not-needed',
    trigger: 'workflow-toggle-preview',
    state: 'workspace-preview',
    preserveOpenLegacy: false,
    legacyReadOnly: false,
    legacyPreviewPath: '',
    legacyPreviewPaneId: null,
  })
  assert.deepEqual(pdfResult, {
    type: 'workspace-preview',
    kind: 'typst',
    filePath: sourcePath,
    sourcePath,
    sourcePaneId: 'pane-source',
    previewKind: 'pdf',
    previewMode: 'pdf',
    previewTargetPath: '',
    targetResolution: 'unresolved',
    trigger: 'typst-pdf-reveal',
    state: 'workspace-preview',
    preserveOpenLegacy: false,
    legacyReadOnly: false,
    legacyPreviewPath: '',
    legacyPreviewPaneId: null,
  })
})

test('document workflow typst pane runtime overlays PDF in an existing preview pane for explicit legacy compatibility', async () => {
  const sourcePath = '/workspace/main.typ'
  const previewPath = 'typst-preview:/workspace/main.typ'
  const artifactPath = '/workspace/main.pdf'
  const editorStore = createEditorStore({
    panes: {
      'pane-source': { tabs: [sourcePath], activeTab: sourcePath },
      'pane-preview': { tabs: [previewPath], activeTab: previewPath },
    },
  })
  const workflowStore = createWorkflowStore({
    previewBinding: {
      sourcePath,
      previewKind: 'native',
      paneId: 'pane-preview',
      previewPath,
    },
    previewPath,
    artifactPath,
  })
  const runtime = createRuntime({ editorStore, workflowStore })

  runtime.revealPdfForFile(sourcePath, {
    sourcePaneId: 'pane-source',
    buildOptions: { adapter: { kind: 'typst' } },
    allowLegacyPaneResult: true,
  })

  assert.deepEqual(editorStore.openCalls, [{
    path: artifactPath,
    paneId: 'pane-preview',
    options: { activatePane: true },
  }])
  assert.equal(editorStore.panes['pane-preview'].activeTab, artifactPath)

  runtime.revealPdfForFile(sourcePath, {
    sourcePaneId: 'pane-source',
    buildOptions: { adapter: { kind: 'typst' } },
    allowLegacyPaneResult: true,
  })

  assert.deepEqual(editorStore.openCalls.at(-1), {
    path: previewPath,
    paneId: 'pane-preview',
    options: { activatePane: true },
  })
  assert.equal(editorStore.panes['pane-preview'].activeTab, previewPath)
  assert.equal(workflowStore.getArtifactCalls.length, 2)
})

test('document workflow typst pane runtime reuses an owned PDF pane when switching back to preview in legacy compatibility mode', async () => {
  const sourcePath = '/workspace/main.typ'
  const previewPath = 'typst-preview:/workspace/main.typ'
  const artifactPath = '/workspace/main.pdf'
  const editorStore = createEditorStore({
    panes: {
      'pane-source': { tabs: [sourcePath], activeTab: sourcePath },
    },
  })
  const workflowStore = createWorkflowStore({
    previewPath,
    artifactPath,
    ensureResult: {
      previewPaneId: 'pane-split',
      previewPath,
    },
  })
  const runtime = createRuntime({ editorStore, workflowStore })

  runtime.revealPdfForFile(sourcePath, {
    sourcePaneId: 'pane-source',
    buildOptions: { adapter: { kind: 'typst' } },
    allowLegacyPaneResult: true,
  })

  assert.deepEqual(editorStore.splitCalls, [{
    sourcePaneId: 'pane-source',
    direction: 'vertical',
    tabPath: artifactPath,
  }])
  assert.deepEqual(editorStore.setActivePaneCalls, ['pane-split'])
  assert.equal(editorStore.panes['pane-split'].activeTab, artifactPath)

  await runtime.revealPreviewForFile(sourcePath, {
    sourcePaneId: 'pane-source',
    buildOptions: { adapter: { kind: 'typst' } },
    allowLegacyPaneResult: true,
  })

  assert.deepEqual(workflowStore.ensureCalls, [{
    sourcePath,
    options: {
      previewKind: 'native',
      activatePreview: false,
      sourcePaneId: 'pane-source',
      trigger: 'typst-preview-toggle-switch',
    },
  }])
  assert.deepEqual(editorStore.openCalls, [{
    path: previewPath,
    paneId: 'pane-split',
    options: { activatePane: true },
  }])
  assert.deepEqual(editorStore.closeCalls, [{
    paneId: 'pane-split',
    path: artifactPath,
  }])
})

test('document workflow typst pane runtime clears stale tracked pane state after external pane reuse', async () => {
  const sourcePath = '/workspace/main.typ'
  const previewPath = 'typst-preview:/workspace/main.typ'
  const artifactPath = '/workspace/main.pdf'
  const editorStore = createEditorStore({
    panes: {
      'pane-source': { tabs: [sourcePath], activeTab: sourcePath },
    },
  })
  const workflowStore = createWorkflowStore({
    previewPath,
    artifactPath,
  })
  const runtime = createRuntime({ editorStore, workflowStore })

  runtime.revealPdfForFile(sourcePath, {
    sourcePaneId: 'pane-source',
    buildOptions: { adapter: { kind: 'typst' } },
    allowLegacyPaneResult: true,
  })

  editorStore.panes['pane-split'].tabs = ['/workspace/other.md']
  editorStore.panes['pane-split'].activeTab = '/workspace/other.md'

  await runtime.revealPreviewForFile(sourcePath, {
    sourcePaneId: 'pane-source',
    buildOptions: { adapter: { kind: 'typst' } },
    allowLegacyPaneResult: true,
  })

  assert.deepEqual(workflowStore.ensureCalls, [])
  assert.deepEqual(workflowStore.toggleCalls, [{
    sourcePath,
    options: {
      previewKind: 'native',
      activatePreview: true,
      jump: true,
      sourcePaneId: 'pane-source',
      trigger: 'workflow-toggle-preview',
    },
  }])
})

test('document workflow typst pane runtime drops tracked pane ownership when another source reuses the pane', async () => {
  const sourcePath = '/workspace/main.typ'
  const previewPath = 'typst-preview:/workspace/main.typ'
  const artifactPath = '/workspace/main.pdf'
  const editorStore = createEditorStore({
    panes: {
      'pane-source': { tabs: [sourcePath], activeTab: sourcePath },
    },
  })
  const workflowStore = createWorkflowStore({
    previewPath,
    artifactPath,
  })
  const runtime = createRuntime({ editorStore, workflowStore })

  runtime.revealPdfForFile(sourcePath, {
    sourcePaneId: 'pane-source',
    buildOptions: { adapter: { kind: 'typst' } },
    allowLegacyPaneResult: true,
  })

  editorStore.panes['pane-split'].tabs = [
    artifactPath,
    'typst-preview:/workspace/other.typ',
    '/workspace/other.pdf',
  ]
  editorStore.panes['pane-split'].activeTab = 'typst-preview:/workspace/other.typ'

  await runtime.revealPreviewForFile(sourcePath, {
    sourcePaneId: 'pane-source',
    buildOptions: { adapter: { kind: 'typst' } },
    allowLegacyPaneResult: true,
  })

  assert.deepEqual(workflowStore.ensureCalls, [])
  assert.deepEqual(workflowStore.toggleCalls, [{
    sourcePath,
    options: {
      previewKind: 'native',
      activatePreview: true,
      jump: true,
      sourcePaneId: 'pane-source',
      trigger: 'workflow-toggle-preview',
    },
  }])
})

test('document workflow typst pane runtime ignores stale preview binding panes that point at foreign content', async () => {
  const sourcePath = '/workspace/main.typ'
  const previewPath = 'typst-preview:/workspace/main.typ'
  const editorStore = createEditorStore({
    panes: {
      'pane-source': { tabs: [sourcePath], activeTab: sourcePath },
      'pane-foreign': {
        tabs: [previewPath, 'typst-preview:/workspace/other.typ'],
        activeTab: 'typst-preview:/workspace/other.typ',
      },
    },
  })
  const workflowStore = createWorkflowStore({
    previewBinding: {
      sourcePath,
      previewKind: 'native',
      paneId: 'pane-foreign',
      previewPath,
    },
    previewPath,
  })
  const runtime = createRuntime({ editorStore, workflowStore })

  await runtime.revealPreviewForFile(sourcePath, {
    sourcePaneId: 'pane-source',
    buildOptions: { adapter: { kind: 'typst' } },
    allowLegacyPaneResult: true,
  })

  assert.deepEqual(workflowStore.toggleCalls, [{
    sourcePath,
    options: {
      previewKind: 'native',
      activatePreview: true,
      jump: true,
      sourcePaneId: 'pane-source',
      trigger: 'workflow-toggle-preview',
    },
  }])
})

test('document workflow typst pane runtime ignores stale session preview panes that point at foreign content', async () => {
  const sourcePath = '/workspace/main.typ'
  const previewPath = 'typst-preview:/workspace/main.typ'
  const editorStore = createEditorStore({
    panes: {
      'pane-source': { tabs: [sourcePath], activeTab: sourcePath },
      'pane-foreign': {
        tabs: [previewPath, '/workspace/other.pdf'],
        activeTab: '/workspace/other.pdf',
      },
    },
  })
  const workflowStore = createWorkflowStore({
    session: {
      previewSourcePath: sourcePath,
      previewKind: 'native',
      previewPaneId: 'pane-foreign',
    },
    previewPath,
  })
  const runtime = createRuntime({ editorStore, workflowStore })

  await runtime.revealPreviewForFile(sourcePath, {
    sourcePaneId: 'pane-source',
    buildOptions: { adapter: { kind: 'typst' } },
    allowLegacyPaneResult: true,
  })

  assert.deepEqual(workflowStore.toggleCalls, [{
    sourcePath,
    options: {
      previewKind: 'native',
      activatePreview: true,
      jump: true,
      sourcePaneId: 'pane-source',
      trigger: 'workflow-toggle-preview',
    },
  }])
})

test('document workflow typst pane runtime does not reuse mixed artifact panes for pdf reveal', () => {
  const sourcePath = '/workspace/main.typ'
  const previewPath = 'typst-preview:/workspace/main.typ'
  const artifactPath = '/workspace/main.pdf'
  const editorStore = createEditorStore({
    panes: {
      'pane-source': { tabs: [sourcePath], activeTab: sourcePath },
      'pane-foreign': {
        tabs: [artifactPath, 'typst-preview:/workspace/other.typ', '/workspace/other.pdf'],
        activeTab: '/workspace/other.pdf',
      },
    },
  })
  const workflowStore = createWorkflowStore({
    previewPath,
    artifactPath,
  })
  const runtime = createRuntime({ editorStore, workflowStore })

  runtime.revealPdfForFile(sourcePath, {
    sourcePaneId: 'pane-source',
    buildOptions: { adapter: { kind: 'typst' } },
    allowLegacyPaneResult: true,
  })

  assert.deepEqual(editorStore.splitCalls, [{
    sourcePaneId: 'pane-source',
    direction: 'vertical',
    tabPath: artifactPath,
  }])
})

test('document workflow typst pane runtime closes the shared pane when preview is already active in legacy compatibility mode', async () => {
  const sourcePath = '/workspace/main.typ'
  const previewPath = 'typst-preview:/workspace/main.typ'
  const artifactPath = '/workspace/main.pdf'
  const editorStore = createEditorStore({
    panes: {
      'pane-source': { tabs: [sourcePath], activeTab: sourcePath },
      'pane-preview': { tabs: [previewPath, artifactPath], activeTab: previewPath },
    },
  })
  const workflowStore = createWorkflowStore({
    previewBinding: {
      sourcePath,
      previewKind: 'native',
      paneId: 'pane-preview',
      previewPath,
    },
    previewPath,
    artifactPath,
  })
  const runtime = createRuntime({ editorStore, workflowStore })

  await runtime.revealPreviewForFile(sourcePath, {
    sourcePaneId: 'pane-source',
    buildOptions: { adapter: { kind: 'typst' } },
    allowLegacyPaneResult: true,
  })

  assert.deepEqual(workflowStore.closePreviewCalls, [{
    sourcePath,
    options: {
      previewKind: 'native',
      trigger: 'typst-preview-toggle-close',
      reconcile: false,
    },
  }])
  assert.deepEqual(editorStore.closeCalls, [{
    paneId: 'pane-preview',
    path: artifactPath,
  }])
  assert.deepEqual(workflowStore.reconcileCalls, [{
    trigger: 'typst-preview-toggle-close',
  }])
})
