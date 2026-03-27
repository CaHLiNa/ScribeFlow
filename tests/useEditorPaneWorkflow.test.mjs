import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'

import { useEditorPaneWorkflow } from '../src/composables/useEditorPaneWorkflow.js'

function createWorkflowStore({
  uiState = { kind: 'latex', previewKind: 'pdf' },
  previewState = null,
  statusText = '',
} = {}) {
  return {
    reconcileCalls: [],
    buildAdapterContext() {
      return {
        previewState,
      }
    },
    getUiStateForFile() {
      return uiState
    },
    getStatusTextForFile() {
      return statusText
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
  uiState = { kind: 'latex', previewKind: 'pdf' },
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

test('useEditorPaneWorkflow shows the pdf toolbar target for direct pdf viewers', () => {
  const { workflow, workflowStore } = createComposable({
    viewerType: 'pdf',
    previewState: null,
  })

  assert.equal(workflow.pdfToolbarTargetSelector.value, '#pdf-toolbar-slot-pane-source')
  assert.equal(workflow.documentPreviewState.value, null)
  assert.deepEqual(workflowStore.reconcileCalls, [{ trigger: 'editor-pane-sync' }])
})

test('useEditorPaneWorkflow shows the pdf toolbar target for workspace embedded pdf previews', () => {
  const previewState = {
    useWorkspace: true,
    previewVisible: true,
    previewKind: 'pdf',
    previewMode: 'pdf',
    previewTargetPath: '/workspace/main.pdf',
  }
  const { workflow } = createComposable({
    viewerType: 'text',
    previewState,
  })

  assert.equal(workflow.pdfToolbarTargetSelector.value, '#pdf-toolbar-slot-pane-source')
  assert.deepEqual(workflow.documentPreviewState.value, previewState)
})

test('useEditorPaneWorkflow hides the pdf toolbar target for normal text pages', () => {
  const { workflow } = createComposable({
    activeTab: '/workspace/notes.txt',
    viewerType: 'text',
    previewState: null,
    uiState: null,
  })

  assert.equal(workflow.pdfToolbarTargetSelector.value, '')
  assert.equal(workflow.documentPreviewState.value, null)
})

test('useEditorPaneWorkflow hides the pdf toolbar target for non-pdf workspace previews', () => {
  const previewState = {
    useWorkspace: true,
    previewVisible: true,
    previewKind: 'native',
    previewMode: 'typst-native',
    previewTargetPath: '',
  }
  const { workflow } = createComposable({
    activeTab: '/workspace/main.typ',
    viewerType: 'text',
    previewState,
    uiState: { kind: 'typst', previewKind: 'native' },
  })

  assert.equal(workflow.pdfToolbarTargetSelector.value, '')
  assert.deepEqual(workflow.documentPreviewState.value, previewState)
})
