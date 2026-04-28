import { computed, watch } from 'vue'
import { isDraftPath, isLatex } from '../utils/fileTypes.js'
import { getDocumentAdapterForFile } from '../services/documentWorkflow/adapters/index.js'

export function useEditorPaneWorkflow(options) {
  const {
    paneIdRef,
    activeTabRef,
    editorStore,
    filesStore,
    workspace,
    latexStore,
    toastStore,
    workflowStore,
    t,
  } = options

  function buildWorkflowOptions(extra = {}) {
    return {
      editorStore,
      filesStore,
      workspace,
      latexStore,
      toastStore,
      t,
      ...extra,
    }
  }

  function buildFallbackWorkflowUiState(adapter) {
    const kind = adapter?.kind || ''
    if (kind === 'markdown') {
      return {
        kind: 'markdown',
        previewKind: 'html',
        phase: 'idle',
        errorCount: 0,
        warningCount: 0,
        canShowProblems: false,
        canRevealPreview: true,
        canOpenPdf: false,
        forwardSync: 'precise',
        backwardSync: true,
        primaryAction: 'refresh',
      }
    }
    if (kind === 'latex') {
      return {
        kind: 'latex',
        previewKind: 'pdf',
        phase: 'idle',
        errorCount: 0,
        warningCount: 0,
        canShowProblems: false,
        canRevealPreview: false,
        canOpenPdf: false,
        backwardSync: true,
        primaryAction: 'compile',
      }
    }
    if (kind === 'python') {
      return {
        kind: 'python',
        previewKind: 'terminal',
        phase: 'idle',
        errorCount: 0,
        warningCount: 0,
        canShowProblems: false,
        canRevealPreview: true,
        canOpenPdf: false,
        backwardSync: false,
        primaryAction: 'run',
      }
    }
    return null
  }

  const activeDocumentAdapter = computed(() => (
    activeTabRef.value && !isDraftPath(activeTabRef.value) ? getDocumentAdapterForFile(activeTabRef.value) : null
  ))
  const fallbackWorkflowUiState = computed(() => buildFallbackWorkflowUiState(activeDocumentAdapter.value))

  const documentBuildContext = computed(() => (
    activeTabRef.value && !isDraftPath(activeTabRef.value)
      ? workflowStore.buildAdapterContext(activeTabRef.value, buildWorkflowOptions({
        adapter: activeDocumentAdapter.value,
        workflowOnly: false,
      }))
      : null
  ))
  const workflowUiState = computed(() => documentBuildContext.value?.workflowUiState || fallbackWorkflowUiState.value)
  const documentPreviewState = computed(() => documentBuildContext.value?.previewState || null)
  const workspacePreviewState = computed(() => (
    documentBuildContext.value?.workspacePreviewState || documentPreviewState.value || null
  ))
  const showDocumentHeader = computed(() => !!activeTabRef.value && !!workflowUiState.value)
  const workflowStatusText = computed(() => documentBuildContext.value?.statusText || '')
  const workflowStatusTone = computed(() => documentBuildContext.value?.statusTone || 'muted')

  async function handleCompileTex() {
    if (!activeTabRef.value || !isLatex(activeTabRef.value)) return
    await workflowStore.runBuildForFile(activeTabRef.value, buildWorkflowOptions({
      adapter: activeDocumentAdapter.value,
      workflowOnly: false,
      sourcePaneId: paneIdRef.value,
      trigger: 'latex-compile-button',
    }))
  }

  function handlePreviewPdf() {
    if (!activeTabRef.value) return
    workflowStore.toggleWorkflowPdfPreviewForFile(activeTabRef.value, {
      sourcePaneId: paneIdRef.value,
      adapterKind: activeDocumentAdapter.value?.kind || 'document',
      uiState: workflowUiState.value,
      buildOptions: buildWorkflowOptions({
        adapter: activeDocumentAdapter.value,
        workflowOnly: false,
      }),
    })
  }

  async function handlePreviewMarkdown() {
    if (!activeTabRef.value) return
    await workflowStore.toggleWorkflowMarkdownPreviewForFile(activeTabRef.value, {
      sourcePaneId: paneIdRef.value,
    })
  }

  async function handleWorkflowPrimaryAction() {
    if (!workflowUiState.value || !activeTabRef.value || !activeDocumentAdapter.value) return
    await workflowStore.runWorkflowPrimaryActionForFile(activeTabRef.value, {
      uiState: workflowUiState.value,
      sourcePaneId: paneIdRef.value,
      buildOptions: buildWorkflowOptions({
        adapter: activeDocumentAdapter.value,
        workflowOnly: false,
      }),
    })
  }

  async function handleWorkflowRevealPreview() {
    if (!workflowUiState.value || !activeTabRef.value) return
    await workflowStore.revealWorkflowPreviewForFile(activeTabRef.value, {
      uiState: workflowUiState.value,
      sourcePaneId: paneIdRef.value,
      buildOptions: buildWorkflowOptions({
        adapter: activeDocumentAdapter.value,
        workflowOnly: false,
      }),
    })
  }

  function handleWorkflowRevealPdf() {
    if (!workflowUiState.value || !activeTabRef.value) return
    workflowStore.revealWorkflowPdfForFile(activeTabRef.value, {
      uiState: workflowUiState.value,
      sourcePaneId: paneIdRef.value,
      buildOptions: buildWorkflowOptions({
        adapter: activeDocumentAdapter.value,
        workflowOnly: false,
      }),
    })
  }

  function handleWorkflowOpenExternalPdf() {
    if (!activeTabRef.value) return
    workflowStore.openWorkflowOutputForFile(activeTabRef.value, {
      uiState: workflowUiState.value,
      sourcePaneId: paneIdRef.value,
      buildOptions: buildWorkflowOptions({
        adapter: activeDocumentAdapter.value,
        workflowOnly: false,
      }),
    })
  }

  watch(
    [activeTabRef, () => editorStore.activePaneId],
    () => {
      workflowStore.reconcile({ trigger: 'editor-pane-sync' })
    },
    { immediate: true },
  )

  return {
    documentPreviewState,
    showDocumentHeader,
    workflowUiState,
    workspacePreviewState,
    workflowStatusText,
    workflowStatusTone,
    handleCompileTex,
    handlePreviewPdf,
    handlePreviewMarkdown,
    handleWorkflowPrimaryAction,
    handleWorkflowRevealPreview,
    handleWorkflowRevealPdf,
    handleWorkflowOpenExternalPdf,
  }
}
