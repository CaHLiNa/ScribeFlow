import { computed, ref, watch } from 'vue'
import { isLatex } from '../utils/fileTypes.js'
import { getDocumentAdapterForFile } from '../services/documentWorkflow/adapters/index.js'

let pdfPreviewPreloadPromise = null

function scheduleIdleTask(task) {
  if (typeof window === 'undefined') return

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(task, { timeout: 1200 })
    return
  }

  window.setTimeout(task, 0)
}

function preloadPdfPreviewSurface() {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (pdfPreviewPreloadPromise) return pdfPreviewPreloadPromise

  pdfPreviewPreloadPromise = new Promise((resolve) => {
    scheduleIdleTask(() => {
      import('../components/editor/PdfArtifactPreview.vue')
        .then(resolve)
        .catch((error) => {
          pdfPreviewPreloadPromise = null
          resolve(null)
        })
    })
  })

  return pdfPreviewPreloadPromise
}

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

  const resolvedWorkflowUiState = computed(() => (
    activeTabRef.value && !activeTabRef.value.startsWith('draft:')
      ? workflowStore.getUiStateForFile(activeTabRef.value, buildWorkflowOptions())
      : null
  ))
  const stableWorkflowUiState = ref(null)
  const stableWorkflowPath = ref('')

  watch(
    [activeTabRef, resolvedWorkflowUiState],
    ([activePath, nextState]) => {
      const nextPath = activePath && !activePath.startsWith('draft:') ? activePath : ''
      if (nextPath !== stableWorkflowPath.value) {
        stableWorkflowPath.value = nextPath
        stableWorkflowUiState.value = nextState || null
        return
      }

      if (nextState) {
        stableWorkflowUiState.value = nextState
      } else if (!nextPath) {
        stableWorkflowUiState.value = null
      }
    },
    { immediate: true },
  )

  const workflowUiState = computed(() => stableWorkflowUiState.value)

  watch(
    workflowUiState,
    (nextState) => {
      if (nextState?.kind === 'latex') {
        preloadPdfPreviewSurface()
      }
    },
    { immediate: true },
  )

  const activeDocumentAdapter = computed(() => (
    activeTabRef.value && !activeTabRef.value.startsWith('draft:') ? getDocumentAdapterForFile(activeTabRef.value) : null
  ))
  const documentBuildContext = computed(() => (
    activeTabRef.value && !activeTabRef.value.startsWith('draft:')
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
  const workflowStatusTone = computed(() => workflowUiState.value?.statusTone || 'muted')

  async function handleCompileTex() {
    if (!activeTabRef.value || !(await isLatex(activeTabRef.value))) return
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
