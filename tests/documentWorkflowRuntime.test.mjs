import test from 'node:test'
import assert from 'node:assert/strict'

import { createDocumentWorkflowRuntime } from '../src/domains/document/documentWorkflowRuntime.js'
import { createDocumentWorkspacePreviewAction } from '../src/domains/document/documentWorkspacePreviewRuntime.js'
import {
  createWorkflowPreviewPath,
  getPreferredWorkflowPreviewKind,
} from '../src/services/documentWorkflow/policy.js'

function createEditorStore(overrides = {}) {
  const editorStore = {
    activeTab: '/workspace/chapter.md',
    activePaneId: 'pane-source',
    paneTree: { type: 'split' },
    openCalls: [],
    splitCalls: [],
    closeCalls: [],
    setActiveTabCalls: [],
    openFileInPane(path, paneId, options = {}) {
      this.openCalls.push({ path, paneId, options })
      if (options.activatePane) {
        this.activePaneId = paneId
        this.activeTab = path
      }
      return paneId
    },
    splitPaneWith(sourcePaneId, direction, previewPath) {
      this.splitCalls.push({ sourcePaneId, direction, previewPath })
      return 'pane-split'
    },
    closeFileFromAllPanes(path) {
      this.closeCalls.push(path)
    },
    setActiveTab(paneId, path) {
      this.setActiveTabCalls.push({ paneId, path })
      this.activePaneId = paneId
      this.activeTab = path
    },
    ...overrides,
  }

  return editorStore
}

function createRuntime({
  sessionOverrides = {},
  editorOverrides = {},
  runtimeOverrides = {},
} = {}) {
  const state = {
    previewPrefs: {
      markdown: { preferredPreview: 'html' },
      latex: { preferredPreview: 'pdf' },
      typst: { preferredPreview: 'pdf' },
    },
    session: {
      activeFile: null,
      activeKind: null,
      sourcePaneId: null,
      previewPaneId: null,
      previewKind: null,
      previewSourcePath: null,
      state: 'inactive',
      detachedSources: {},
      ...sessionOverrides,
    },
    previewBindings: {},
    isReconciling: false,
    lastTrigger: null,
    closedPreviews: [],
    clearedDetached: [],
    boundPreviews: [],
    jumps: [],
  }

  const editorStore = createEditorStore(editorOverrides)

  const runtime = createDocumentWorkflowRuntime({
    getSession: () => state.session,
    getPreviewPrefs: () => state.previewPrefs,
    getPreviewBinding: (previewPath) => state.previewBindings[previewPath] || null,
    inferPreviewKind: (sourcePath, previewPath) => (
      previewPath === `preview:${sourcePath}` ? 'html' : null
    ),
    bindPreview: (binding) => {
      state.previewBindings[binding.previewPath] = binding
      state.boundPreviews.push(binding)
    },
    getOpenPreviewPathForSource: (sourcePath, previewKind) => {
      const binding = Object.values(state.previewBindings).find((entry) => (
        entry.sourcePath === sourcePath
        && (!previewKind || entry.previewKind === previewKind)
      ))
      return binding?.previewPath || null
    },
    getPreferredPreviewKind: (kind) => state.previewPrefs[kind]?.preferredPreview || null,
    clearDetached: (sourcePath) => {
      state.clearedDetached.push(sourcePath)
      const next = { ...state.session.detachedSources }
      delete next[sourcePath]
      state.session = {
        ...state.session,
        detachedSources: next,
      }
    },
    handlePreviewClosed: (previewPath) => {
      state.closedPreviews.push(previewPath)
      const next = { ...state.previewBindings }
      delete next[previewPath]
      state.previewBindings = next
    },
    setSessionState: (payload) => {
      state.session = {
        ...state.session,
        ...payload,
      }
    },
    getIsReconciling: () => state.isReconciling,
    setIsReconciling: (value) => {
      state.isReconciling = value
    },
    setLastTrigger: (value) => {
      state.lastTrigger = value
    },
    getEditorStore: () => editorStore,
    getDocumentWorkflowKindImpl: (sourcePath) => {
      if (sourcePath.endsWith('.md')) return 'markdown'
      if (sourcePath.endsWith('.tex')) return 'latex'
      if (sourcePath.endsWith('.typ')) return 'typst'
      return null
    },
    createWorkspacePreviewAction: createDocumentWorkspacePreviewAction,
    getPreferredWorkflowPreviewKind,
    createWorkflowPreviewPath,
    reconcileDocumentWorkflowImpl: () => ({
      type: 'inactive',
      trigger: 'manual',
      sourcePath: null,
      previewPath: null,
      previewKind: null,
      sourcePaneId: editorStore.activePaneId,
      previewPaneId: null,
      state: 'inactive',
      kind: null,
    }),
    findWorkflowPreviewPaneImpl: (_paneTree, previewPath) => {
      const binding = state.previewBindings[previewPath]
      return binding?.paneId ? { id: binding.paneId } : null
    },
    jumpPreviewToCursor: (payload) => {
      state.jumps.push(payload)
    },
    ...runtimeOverrides,
  })

  return { runtime, state, editorStore }
}

test('document workflow runtime reconcile opens a reusable neighbor preview pane and records session state', () => {
  const { runtime, state, editorStore } = createRuntime({
    runtimeOverrides: {
      reconcileDocumentWorkflowImpl: () => ({
        type: 'open-neighbor',
        trigger: 'manual-open-preview',
        kind: 'markdown',
        sourcePath: '/workspace/chapter.md',
        previewKind: 'html',
        previewPath: 'preview:/workspace/chapter.md',
        sourcePaneId: 'pane-source',
        previewPaneId: 'pane-preview',
        state: 'needs-preview',
      }),
      findWorkflowPreviewPaneImpl: () => ({ id: 'pane-preview' }),
    },
  })

  const result = runtime.reconcile({
    trigger: 'manual-open-preview',
    force: true,
    previewKindOverride: 'html',
  })

  assert.equal(result.previewPaneId, 'pane-preview')
  assert.deepEqual(editorStore.openCalls, [{
    path: 'preview:/workspace/chapter.md',
    paneId: 'pane-preview',
    options: { activatePane: false },
  }])
  assert.deepEqual(state.boundPreviews, [{
    previewPath: 'preview:/workspace/chapter.md',
    sourcePath: '/workspace/chapter.md',
    previewKind: 'html',
    kind: 'markdown',
    paneId: 'pane-preview',
  }])
  assert.equal(state.session.state, 'ready')
  assert.equal(state.session.previewPaneId, 'pane-preview')
  assert.equal(state.lastTrigger, 'manual-open-preview')
})

test('document workflow runtime reconcile splits the source pane when no reusable preview pane exists', () => {
  const { runtime, state, editorStore } = createRuntime({
    runtimeOverrides: {
      reconcileDocumentWorkflowImpl: () => ({
        type: 'split-right',
        trigger: 'manual-open-preview',
        kind: 'markdown',
        sourcePath: '/workspace/chapter.md',
        previewKind: 'html',
        previewPath: 'preview:/workspace/chapter.md',
        sourcePaneId: 'pane-source',
        previewPaneId: null,
        state: 'needs-preview',
      }),
      findWorkflowPreviewPaneImpl: () => ({ id: 'pane-split' }),
    },
  })

  const result = runtime.reconcile({
    trigger: 'manual-open-preview',
    force: true,
    previewKindOverride: 'html',
  })

  assert.equal(result.previewPaneId, 'pane-split')
  assert.deepEqual(editorStore.splitCalls, [{
    sourcePaneId: 'pane-source',
    direction: 'vertical',
    previewPath: 'preview:/workspace/chapter.md',
  }])
  assert.equal(state.session.previewPaneId, 'pane-split')
  assert.equal(state.session.state, 'ready')
})

test('document workflow runtime ensurePreviewForSource restores focus when preview is not activated', () => {
  const { runtime, state, editorStore } = createRuntime({
    editorOverrides: {
      activeTab: '/workspace/notes.md',
      activePaneId: 'pane-notes',
    },
    sessionOverrides: {
      detachedSources: {
        '/workspace/chapter.md': true,
      },
    },
    runtimeOverrides: {
      reconcileDocumentWorkflowImpl: () => ({
        type: 'ready-existing',
        trigger: 'manual-open-preview',
        kind: 'markdown',
        sourcePath: '/workspace/chapter.md',
        previewKind: 'html',
        previewPath: 'preview:/workspace/chapter.md',
        sourcePaneId: 'pane-source',
        previewPaneId: 'pane-preview',
        state: 'ready',
      }),
      findWorkflowPreviewPaneImpl: () => ({ id: 'pane-preview' }),
    },
  })

  const result = runtime.ensurePreviewForSource('/workspace/chapter.md', {
    sourcePaneId: 'pane-source',
  })

  assert.equal(result.previewPaneId, 'pane-preview')
  assert.deepEqual(state.clearedDetached, ['/workspace/chapter.md'])
  assert.equal(editorStore.activePaneId, 'pane-notes')
  assert.equal(editorStore.activeTab, '/workspace/notes.md')
  assert.deepEqual(editorStore.setActiveTabCalls, [{
    paneId: 'pane-notes',
    path: '/workspace/notes.md',
  }])
  assert.equal(editorStore.openCalls.length, 1)
  assert.deepEqual(editorStore.openCalls[0], {
    path: 'preview:/workspace/chapter.md',
    paneId: 'pane-preview',
    options: { activatePane: false },
  })
})

test('document workflow runtime revealPreview activates the preview pane and emits jump metadata', () => {
  const { runtime, state, editorStore } = createRuntime({
    runtimeOverrides: {
      reconcileDocumentWorkflowImpl: () => ({
        type: 'ready-existing',
        trigger: 'reveal-preview',
        kind: 'markdown',
        sourcePath: '/workspace/chapter.md',
        previewKind: 'html',
        previewPath: 'preview:/workspace/chapter.md',
        sourcePaneId: 'pane-source',
        previewPaneId: 'pane-preview',
        state: 'ready',
      }),
      findWorkflowPreviewPaneImpl: () => ({ id: 'pane-preview' }),
    },
  })

  const result = runtime.revealPreview('/workspace/chapter.md', {
    previewKind: 'html',
    jump: true,
  })

  assert.equal(result.previewPaneId, 'pane-preview')
  assert.ok(editorStore.openCalls.some((call) => (
    call.path === 'preview:/workspace/chapter.md'
    && call.paneId === 'pane-preview'
    && call.options.activatePane === true
  )))
  assert.deepEqual(state.jumps, [{
    kind: 'markdown',
    previewKind: 'html',
    sourcePath: '/workspace/chapter.md',
  }])
})

test('document workflow runtime reconcile records workspace preview state without opening legacy panes', () => {
  const { runtime, state, editorStore } = createRuntime({
    runtimeOverrides: {
      reconcileDocumentWorkflowImpl: () => ({
        type: 'workspace-preview',
        trigger: 'manual-open-preview',
        kind: 'latex',
        filePath: '/workspace/main.tex',
        sourcePath: '/workspace/main.tex',
        sourcePaneId: 'pane-source',
        previewKind: 'pdf',
        previewMode: 'pdf',
        state: 'workspace-preview',
        preserveOpenLegacy: false,
        legacyReadOnly: false,
        legacyPreviewPath: '',
        legacyPreviewPaneId: null,
      }),
    },
  })

  const result = runtime.reconcile({
    trigger: 'manual-open-preview',
    force: true,
    previewKindOverride: 'pdf',
  })

  assert.equal(result.type, 'workspace-preview')
  assert.equal(result.previewPaneId, null)
  assert.equal(result.previewPath, null)
  assert.deepEqual(editorStore.openCalls, [])
  assert.deepEqual(editorStore.splitCalls, [])
  assert.equal(state.session.state, 'workspace-preview')
  assert.equal(state.session.previewKind, 'pdf')
  assert.equal(state.session.previewSourcePath, '/workspace/main.tex')
})

test('document workflow runtime revealPreview keeps workspace-local previews in place and still emits jump metadata', () => {
  const { runtime, state, editorStore } = createRuntime({
    runtimeOverrides: {
      reconcileDocumentWorkflowImpl: () => ({
        type: 'workspace-preview',
        trigger: 'reveal-preview',
        kind: 'typst',
        filePath: '/workspace/main.typ',
        sourcePath: '/workspace/main.typ',
        sourcePaneId: 'pane-source',
        previewKind: 'native',
        previewMode: 'typst-native',
        state: 'workspace-preview',
        preserveOpenLegacy: false,
        legacyReadOnly: false,
        legacyPreviewPath: '',
        legacyPreviewPaneId: null,
      }),
    },
  })

  const result = runtime.revealPreview('/workspace/main.typ', {
    previewKind: 'native',
    jump: true,
  })

  assert.equal(result.type, 'workspace-preview')
  assert.deepEqual(editorStore.openCalls, [])
  assert.deepEqual(state.jumps, [{
    kind: 'typst',
    previewKind: 'native',
    sourcePath: '/workspace/main.typ',
  }])
})

test('document workflow runtime rebinds preserved legacy previews as non-detaching compatibility tabs', () => {
  const { runtime, state } = createRuntime({
    runtimeOverrides: {
      reconcileDocumentWorkflowImpl: () => ({
        type: 'workspace-preview',
        trigger: 'editor-pane-sync',
        kind: 'markdown',
        filePath: '/workspace/chapter.md',
        sourcePath: '/workspace/chapter.md',
        sourcePaneId: 'pane-source',
        previewKind: 'html',
        previewMode: 'markdown',
        state: 'workspace-preview',
        preserveOpenLegacy: true,
        legacyReadOnly: false,
        legacyPreviewPath: 'preview:/workspace/chapter.md',
        legacyPreviewPaneId: 'pane-preview',
      }),
    },
  })

  runtime.reconcile({
    trigger: 'editor-pane-sync',
    force: true,
  })

  assert.deepEqual(state.boundPreviews, [{
    previewPath: 'preview:/workspace/chapter.md',
    sourcePath: '/workspace/chapter.md',
    previewKind: 'html',
    kind: 'markdown',
    paneId: 'pane-preview',
    detachOnClose: false,
  }])
})

test('document workflow runtime closePreviewForSource dismisses the preview and reconciles session state', () => {
  const { runtime, state, editorStore } = createRuntime({
    runtimeOverrides: {
      reconcileDocumentWorkflowImpl: () => ({
        type: 'inactive',
        trigger: 'close-preview',
        sourcePath: null,
        previewPath: null,
        previewKind: null,
        sourcePaneId: 'pane-source',
        previewPaneId: null,
        state: 'inactive',
        kind: null,
      }),
    },
  })

  state.previewBindings['preview:/workspace/chapter.md'] = {
    previewPath: 'preview:/workspace/chapter.md',
    sourcePath: '/workspace/chapter.md',
    previewKind: 'html',
    kind: 'markdown',
    paneId: 'pane-preview',
  }

  const result = runtime.closePreviewForSource('/workspace/chapter.md')

  assert.deepEqual(result, {
    type: 'closed-preview',
    kind: 'markdown',
    sourcePath: '/workspace/chapter.md',
    previewKind: 'html',
    previewPath: 'preview:/workspace/chapter.md',
  })
  assert.deepEqual(state.closedPreviews, ['preview:/workspace/chapter.md'])
  assert.deepEqual(editorStore.closeCalls, ['preview:/workspace/chapter.md'])
  assert.equal(state.session.state, 'inactive')
  assert.equal(state.lastTrigger, 'close-preview')
})
