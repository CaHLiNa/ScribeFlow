import { computed, watch } from 'vue'
import { getLanguage, isLatex, isRmdOrQmd, isTypst } from '../utils/fileTypes.js'
import { getDocumentAdapterForFile } from '../services/documentWorkflow/adapters/index.js'
import { getDocumentWorkflowStatusTone } from '../domains/document/documentWorkflowBuildRuntime.js'
import { shouldShowPdfToolbarTarget } from '../domains/document/documentWorkspacePreviewRuntime.js'

export function useEditorPaneWorkflow(options) {
  const {
    paneIdRef,
    activeTabRef,
    viewerTypeRef,
    editorStore,
    filesStore,
    workspace,
    latexStore,
    typstStore,
    toastStore,
    workflowStore,
    referencesStore,
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
      referencesStore,
      t,
      ...extra,
    }
  }

  async function ensureLanguageReady(language) {
    const { ensureLanguageExecutionReady } = await import('../services/environmentPreflight.js')
    return ensureLanguageExecutionReady(language)
  }

  async function sendCodeToRunner(code, language) {
    const { sendCode } = await import('../services/codeRunner.js')
    return sendCode(code, language)
  }

  async function runFileInRunner(filePath, language) {
    const { runFile } = await import('../services/codeRunner.js')
    return runFile(filePath, language)
  }

  async function renderDocumentInRunner(filePath) {
    const { renderDocument } = await import('../services/codeRunner.js')
    return renderDocument(filePath)
  }

  async function resolveChatStore() {
    const { useChatStore } = await import('../stores/chat.js')
    return useChatStore()
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
  const pdfToolbarTargetId = computed(() => (
    `pdf-toolbar-slot-${String(paneIdRef.value || 'pane').replace(/[^a-zA-Z0-9_-]/g, '-')}`
  ))
  const pdfToolbarTargetSelector = computed(() => (
    shouldShowPdfToolbarTarget(viewerTypeRef.value, documentPreviewState.value)
      ? `#${pdfToolbarTargetId.value}`
      : ''
  ))
  const showDocumentHeader = computed(() => (
    !!activeTabRef.value && (!!workflowUiState.value || !!pdfToolbarTargetSelector.value)
  ))
  const workflowStatusText = computed(() => {
    if (!activeTabRef.value || !workflowUiState.value) return ''
    return workflowStore.getStatusTextForFile(activeTabRef.value, buildWorkflowOptions({
      adapter: activeDocumentAdapter.value,
      workflowOnly: false,
    }))
  })
  const workflowStatusTone = computed(() => getDocumentWorkflowStatusTone(workflowUiState.value))

  async function handleRunCode() {
    if (!activeTabRef.value) return
    const lang = getLanguage(activeTabRef.value)
    if (!lang) return
    const editorView = editorStore.getEditorView(paneIdRef.value, activeTabRef.value)
    if (!editorView) return

    const state = editorView.state
    const selection = state.selection.main

    if (isRmdOrQmd(activeTabRef.value)) {
      if (!(await ensureLanguageReady(lang))) return
      import('../editor/codeChunks').then(({ chunkField, chunkAtPosition }) => {
        const chunks = state.field(chunkField)
        const chunk = chunkAtPosition(chunks, state.doc, selection.head)
        if (!chunk) return
        const chunkIndex = chunks.indexOf(chunk)
        if (chunkIndex >= 0) {
          editorView.dom.dispatchEvent(new CustomEvent('chunk-execute', {
            bubbles: true,
            detail: { chunkIdx: chunkIndex },
          }))
        }
      })
      return
    }

    let code
    if (selection.from !== selection.to) {
      code = state.sliceDoc(selection.from, selection.to)
    } else {
      const line = state.doc.lineAt(selection.head)
      code = line.text
      if (line.number < state.doc.lines) {
        const nextLine = state.doc.line(line.number + 1)
        editorView.dispatch({
          selection: { anchor: nextLine.from },
          scrollIntoView: true,
        })
      }
    }
    if (code) await sendCodeToRunner(code, lang)
  }

  async function handleRunFile() {
    if (!activeTabRef.value) return
    const lang = getLanguage(activeTabRef.value)
    if (!lang) return

    if (isRmdOrQmd(activeTabRef.value)) {
      if (!(await ensureLanguageReady(lang))) return
      const editorView = editorStore.getEditorView(paneIdRef.value, activeTabRef.value)
      if (!editorView) return
      editorView.dom.dispatchEvent(new CustomEvent('chunk-execute-all', { bubbles: true }))
      return
    }

    await runFileInRunner(activeTabRef.value, lang)
  }

  async function handleRenderDocument() {
    if (!activeTabRef.value) return
    await renderDocumentInRunner(activeTabRef.value)
  }

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

  async function handleWorkflowFixWithAi() {
    if (!activeTabRef.value) return
    workspace.setRightSidebarPanel('document-run')
    workspace.openRightSidebar()
    const chatStore = await resolveChatStore()
    await workflowStore.launchWorkflowFixWithAiForFile(activeTabRef.value, {
      editorStore,
      chatStore,
      paneId: paneIdRef.value || null,
      beside: true,
      source: 'document-run-inspector',
      entryContext: 'document-run-inspector',
    })
  }

  async function handleWorkflowDiagnoseWithAi() {
    if (!activeTabRef.value) return
    workspace.setRightSidebarPanel('document-run')
    workspace.openRightSidebar()
    const chatStore = await resolveChatStore()
    await workflowStore.launchWorkflowDiagnoseWithAiForFile(activeTabRef.value, {
      editorStore,
      chatStore,
      paneId: paneIdRef.value || null,
      beside: true,
      source: 'document-run-inspector',
      entryContext: 'document-run-inspector',
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
    if (!workflowUiState.value || workflowUiState.value.kind !== 'typst' || !activeTabRef.value) return
    workflowStore.revealWorkflowPdfForFile(activeTabRef.value, {
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
    pdfToolbarTargetId,
    pdfToolbarTargetSelector,
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
    handleWorkflowDiagnoseWithAi,
    handleWorkflowFixWithAi,
  }
}
