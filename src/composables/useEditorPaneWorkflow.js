import { computed, watch } from 'vue'
import { isLatex, isTypst } from '../utils/fileTypes.js'
import { getDocumentAdapterForFile } from '../services/documentWorkflow/adapters/index.js'
import { getDocumentWorkflowStatusTone } from '../domains/document/documentWorkflowBuildRuntime.js'
import { pathExists } from '../services/pathExists.js'

export function useEditorPaneWorkflow(options) {
  const {
    paneIdRef,
    activeTabRef,
    editorStore,
    filesStore,
    workspace,
    latexStore,
    typstStore,
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
      typstStore,
      toastStore,
      t,
      ...extra,
    }
  }

  const workflowUiState = computed(() => (
    activeTabRef.value
      ? workflowStore.getUiStateForFile(activeTabRef.value, buildWorkflowOptions())
      : null
  ))
  const activeDocumentAdapter = computed(() => (
    activeTabRef.value ? getDocumentAdapterForFile(activeTabRef.value) : null
  ))
  const documentBuildContext = computed(() => (
    activeTabRef.value
      ? workflowStore.buildAdapterContext(activeTabRef.value, buildWorkflowOptions({
        adapter: activeDocumentAdapter.value,
        workflowOnly: false,
      }))
      : null
  ))
  const documentPreviewState = computed(() => documentBuildContext.value?.previewState || null)
  const workspacePreviewState = computed(() => (
    documentBuildContext.value?.workspacePreviewState || documentPreviewState.value || null
  ))
  const showDocumentHeader = computed(() => !!activeTabRef.value && !!workflowUiState.value)
  const workflowStatusText = computed(() => {
    if (!activeTabRef.value || !workflowUiState.value) return ''
    return workflowStore.getStatusTextForFile(activeTabRef.value, buildWorkflowOptions({
      adapter: activeDocumentAdapter.value,
      workflowOnly: false,
    }))
  })
  const workflowStatusTone = computed(() => getDocumentWorkflowStatusTone(workflowUiState.value))

  async function handleRunCode() {}

  async function handleRunFile() {}

  async function handleRenderDocument() {}

  async function handleCompileTex() {
    if (!activeTabRef.value || !isLatex(activeTabRef.value)) return
    await workflowStore.runBuildForFile(activeTabRef.value, buildWorkflowOptions({
      adapter: activeDocumentAdapter.value,
      workflowOnly: false,
      sourcePaneId: paneIdRef.value,
      trigger: 'latex-compile-button',
    }))
  }

  async function handleCompileTypst() {
    if (!activeTabRef.value || !isTypst(activeTabRef.value)) return
    await workflowStore.runBuildForFile(activeTabRef.value, buildWorkflowOptions({
      adapter: activeDocumentAdapter.value,
      workflowOnly: false,
      sourcePaneId: paneIdRef.value,
      trigger: 'typst-compile-button',
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

  watch(
    [activeTabRef, activeDocumentAdapter],
    async ([filePath, adapter]) => {
      if (!filePath || !adapter || (adapter.kind !== 'latex' && adapter.kind !== 'typst')) return
      const uiState = workflowStore.getUiStateForFile(filePath, buildWorkflowOptions({
        adapter,
        workflowOnly: false,
      }))
      if (uiState?.canOpenPdf === true) return

      const artifactPath = adapter.compile?.getArtifactPath?.(filePath, buildWorkflowOptions({
        adapter,
        workflowOnly: false,
      })) || ''
      if (!artifactPath || !(await pathExists(artifactPath))) return

      if (adapter.kind === 'latex') {
        latexStore.registerExistingArtifact?.(filePath, artifactPath)
      } else if (adapter.kind === 'typst') {
        typstStore.registerExistingArtifact?.(filePath, artifactPath)
      }
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
    handleRunCode,
    handleRunFile,
    handleRenderDocument,
    handleCompileTex,
    handleCompileTypst,
    handlePreviewPdf,
    handlePreviewMarkdown,
    handleWorkflowPrimaryAction,
    handleWorkflowRevealPreview,
    handleWorkflowRevealPdf,
    handleWorkflowOpenExternalPdf,
  }
}
