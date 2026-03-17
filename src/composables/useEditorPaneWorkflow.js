import { computed, watch } from 'vue'
import { getLanguage, isLatex, isRmdOrQmd, isTypst } from '../utils/fileTypes'
import { sendCode, runFile, renderDocument } from '../services/codeRunner'
import {
  ensureLanguageExecutionReady,
} from '../services/environmentPreflight'
import { getDocumentAdapterForFile } from '../services/documentWorkflow/adapters/index.js'

export function useEditorPaneWorkflow(options) {
  const {
    paneIdRef,
    activeTabRef,
    viewerTypeRef,
    editorStore,
    filesStore,
    chatStore,
    workspace,
    latexStore,
    typstStore,
    toastStore,
    workflowStore,
    referencesStore,
    t,
  } = options

  const workflowUiState = computed(() => (
    activeTabRef.value ? workflowStore.getUiStateForFile(activeTabRef.value) : null
  ))
  const activeDocumentAdapter = computed(() => (
    activeTabRef.value ? getDocumentAdapterForFile(activeTabRef.value) : null
  ))
  const activeCompileAdapter = computed(() => activeDocumentAdapter.value?.compile || null)
  const pdfToolbarTargetId = computed(() => (
    `pdf-toolbar-slot-${String(paneIdRef.value || 'pane').replace(/[^a-zA-Z0-9_-]/g, '-')}`
  ))
  // PDF viewer now renders its own in-frame toolbar, so the outer subbar slot should stay disabled.
  const pdfToolbarTargetSelector = computed(() => '')
  const showDocumentHeader = computed(() => (
    !!activeTabRef.value && (!!workflowUiState.value || !!pdfToolbarTargetSelector.value)
  ))
  const workflowCanViewLog = computed(() => {
    return !!workflowUiState.value && !!activeCompileAdapter.value?.openLog
  })
  const workflowStatusText = computed(() => {
    if (!activeTabRef.value || !workflowUiState.value) return ''

    if (workflowUiState.value.kind === 'markdown' && workflowUiState.value.phase === 'rendering') {
      return t('Rendering...')
    }

    return activeCompileAdapter.value?.getStatusText?.(activeTabRef.value, buildAdapterContext()) || ''
  })
  const workflowStatusTone = computed(() => {
    if (!workflowUiState.value) return 'muted'
    if (workflowUiState.value.phase === 'compiling' || workflowUiState.value.phase === 'rendering') return 'running'
    if (workflowUiState.value.phase === 'ready') return 'success'
    return 'muted'
  })

  function buildAdapterContext(extra = {}) {
    return {
      editorStore,
      filesStore,
      chatStore,
      workspace,
      latexStore,
      typstStore,
      toastStore,
      workflowStore,
      referencesStore,
      t,
      ...extra,
    }
  }

  async function handleRunCode() {
    if (!activeTabRef.value) return
    const lang = getLanguage(activeTabRef.value)
    if (!lang) return
    const editorView = editorStore.getEditorView(paneIdRef.value, activeTabRef.value)
    if (!editorView) return

    const state = editorView.state
    const selection = state.selection.main

    if (isRmdOrQmd(activeTabRef.value)) {
      if (!(await ensureLanguageExecutionReady(lang))) return
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
    if (code) await sendCode(code, lang)
  }

  async function handleRunFile() {
    if (!activeTabRef.value) return
    const lang = getLanguage(activeTabRef.value)
    if (!lang) return

    if (isRmdOrQmd(activeTabRef.value)) {
      if (!(await ensureLanguageExecutionReady(lang))) return
      const editorView = editorStore.getEditorView(paneIdRef.value, activeTabRef.value)
      if (!editorView) return
      editorView.dom.dispatchEvent(new CustomEvent('chunk-execute-all', { bubbles: true }))
      return
    }

    await runFile(activeTabRef.value, lang)
  }

  async function handleRenderDocument() {
    if (!activeTabRef.value) return
    await renderDocument(activeTabRef.value)
  }

  async function handleCompileTex() {
    if (!activeTabRef.value || !isLatex(activeTabRef.value)) return
    await activeCompileAdapter.value?.compile?.(activeTabRef.value, buildAdapterContext(), {
      sourcePaneId: paneIdRef.value,
      trigger: 'latex-compile-button',
    })
  }

  async function handleCompileTypst() {
    if (!activeTabRef.value || !isTypst(activeTabRef.value)) return
    await activeCompileAdapter.value?.compile?.(activeTabRef.value, buildAdapterContext(), {
      sourcePaneId: paneIdRef.value,
      trigger: 'typst-compile-button',
    })
  }

  function handlePreviewPdf() {
    if (!activeTabRef.value) return
    workflowStore.togglePreviewForSource(activeTabRef.value, {
      previewKind: 'pdf',
      activatePreview: true,
      sourcePaneId: paneIdRef.value,
      trigger: `${activeDocumentAdapter.value?.kind || 'document'}-preview-toggle`,
    })
  }

  function handlePreviewMarkdown() {
    if (!activeTabRef.value) return
    workflowStore.togglePreviewForSource(activeTabRef.value, {
      previewKind: 'html',
      activatePreview: true,
      sourcePaneId: paneIdRef.value,
      trigger: 'markdown-preview-toggle',
    })
  }

  async function handleWorkflowPrimaryAction() {
    if (!workflowUiState.value || !activeTabRef.value || !activeDocumentAdapter.value) return

    if (workflowUiState.value.kind === 'latex') {
      await handleCompileTex()
      return
    }
    if (workflowUiState.value.kind === 'typst') {
      await handleCompileTypst()
      return
    }
    handlePreviewMarkdown()
  }

  async function handleWorkflowRevealPreview() {
    if (!workflowUiState.value || !activeTabRef.value) return
    await workflowStore.togglePreviewForSource(activeTabRef.value, {
      previewKind: workflowUiState.value.previewKind,
      activatePreview: true,
      sourcePaneId: paneIdRef.value,
      trigger: 'workflow-toggle-preview',
    })
  }

  function handleWorkflowViewLog() {
    if (!activeTabRef.value) return
    activeCompileAdapter.value?.openLog?.(activeTabRef.value, buildAdapterContext())
  }

  async function handleExportPdf(settingsOverride) {
    if (!activeTabRef.value || activeDocumentAdapter.value?.kind !== 'markdown') return
    await activeCompileAdapter.value?.compile?.(activeTabRef.value, buildAdapterContext(), {
      settingsOverride,
      sourcePaneId: paneIdRef.value,
      trigger: 'markdown-export-pdf',
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
    showDocumentHeader,
    workflowUiState,
    workflowCanViewLog,
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
    handleWorkflowViewLog,
    handleExportPdf,
  }
}
