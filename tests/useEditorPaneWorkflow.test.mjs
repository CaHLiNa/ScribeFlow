import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'

import { useEditorPaneWorkflow } from '../src/composables/useEditorPaneWorkflow.js'

function createWorkflowStore({
  uiState = { kind: 'latex', previewKind: null, canOpenPdf: true },
  previewState = null,
  statusText = '',
} = {}) {
  return {
    reconcileCalls: [],
    outputCalls: [],
    pdfToggleCalls: [],
    pdfRevealCalls: [],
    buildAdapterContext() {
      return {
        previewState,
        workspacePreviewState: previewState,
      }
    },
    getUiStateForFile() {
      return uiState
    },
    getStatusTextForFile() {
      return statusText
    },
    openWorkflowOutputForFile(filePath, options = {}) {
      this.outputCalls.push({ filePath, options })
      return { type: 'external-output-opened', filePath }
    },
    toggleWorkflowPdfPreviewForFile(filePath, options = {}) {
      this.pdfToggleCalls.push({ filePath, options })
      return { type: 'workspace-preview', filePath, previewKind: 'pdf' }
    },
    revealWorkflowPdfForFile(filePath, options = {}) {
      this.pdfRevealCalls.push({ filePath, options })
      return { type: 'workspace-preview', filePath, previewKind: 'pdf' }
    },
    reconcile(options = {}) {
      this.reconcileCalls.push(options)
      return null
    },
  }
}

function createComposable({
  activeTab = '/workspace/main.tex',
  viewerType = 'text',
  previewState = null,
  uiState = { kind: 'latex', previewKind: null, canOpenPdf: true },
} = {}) {
  const workflowStore = createWorkflowStore({ previewState, uiState })
  const paneIdRef = ref('pane-source')
  const activeTabRef = ref(activeTab)
  const viewerTypeRef = ref(viewerType)

  const workflow = useEditorPaneWorkflow({
    paneIdRef,
    activeTabRef,
    viewerTypeRef,
    editorStore: {
      activePaneId: 'pane-source',
      getEditorView() {
        return null
      },
    },
    filesStore: {},
    chatStore: {},
    workspace: {
      setRightSidebarPanel() {},
      openRightSidebar() {},
    },
    latexStore: {},
    typstStore: {},
    toastStore: {},
    workflowStore,
    referencesStore: {},
    t: value => value,
  })

  return {
    workflow,
    workflowStore,
  }
}

test('useEditorPaneWorkflow exposes workflow state without any pdf toolbar target', () => {
  const previewState = {
    useWorkspace: true,
    previewVisible: true,
    previewKind: 'native',
    previewMode: 'typst-native',
    previewTargetPath: '',
  }
  const { workflow, workflowStore } = createComposable({
    activeTab: '/workspace/main.typ',
    previewState,
    uiState: { kind: 'typst', previewKind: 'native', canRevealPreview: true, canOpenPdf: true },
  })

  assert.deepEqual(workflow.documentPreviewState.value, previewState)
  assert.deepEqual(workflow.workspacePreviewState.value, previewState)
  assert.equal(workflow.showDocumentHeader.value, true)
  assert.deepEqual(workflowStore.reconcileCalls, [{ trigger: 'editor-pane-sync' }])
})

test('useEditorPaneWorkflow routes pdf requests through the embedded preview workflow actions', () => {
  const { workflow, workflowStore } = createComposable({
    activeTab: '/workspace/main.tex',
    uiState: { kind: 'latex', previewKind: null, canOpenPdf: true },
  })

  workflow.handlePreviewPdf()
  workflow.handleWorkflowRevealPdf()

  assert.equal(workflowStore.pdfToggleCalls.length, 1)
  assert.equal(workflowStore.pdfRevealCalls.length, 1)
  assert.equal(workflowStore.pdfToggleCalls[0].filePath, '/workspace/main.tex')
  assert.equal(workflowStore.pdfRevealCalls[0].filePath, '/workspace/main.tex')
})

test('useEditorPaneWorkflow hides the document header for plain text pages with no workflow state', () => {
  const { workflow } = createComposable({
    activeTab: '/workspace/notes.txt',
    viewerType: 'text',
    previewState: null,
    uiState: null,
  })

  assert.equal(workflow.showDocumentHeader.value, false)
  assert.equal(workflow.documentPreviewState.value, null)
})
