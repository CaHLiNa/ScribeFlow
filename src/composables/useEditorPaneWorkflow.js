import { computed, watch } from 'vue'
import { getLanguage, getViewerType, isLatex, isRmdOrQmd, isTypst } from '../utils/fileTypes'
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
  const pdfToolbarTargetSelector = computed(() => (
    viewerTypeRef.value === 'pdf' ? `#${pdfToolbarTargetId.value}` : ''
  ))
  const showDocumentHeader = computed(() => (
    !!activeTabRef.value && (!!workflowUiState.value || !!pdfToolbarTargetSelector.value)
  ))
  const workflowStatusText = computed(() => {
    if (!activeTabRef.value || !workflowUiState.value) return ''
    return activeCompileAdapter.value?.getStatusText?.(activeTabRef.value, buildAdapterContext()) || ''
  })
  const workflowStatusTone = computed(() => {
    if (!workflowUiState.value) return 'muted'
    if (workflowUiState.value.kind === 'markdown') {
      if (workflowUiState.value.exportPhase === 'exporting' || workflowUiState.value.phase === 'rendering') return 'running'
      if (workflowUiState.value.phase === 'error') return 'error'
      if (workflowUiState.value.exportPhase === 'error') return 'warning'
      if (workflowUiState.value.phase === 'ready' || workflowUiState.value.exportPhase === 'ready') return 'success'
      return 'muted'
    }
    if (workflowUiState.value.phase === 'compiling' || workflowUiState.value.phase === 'rendering') return 'running'
    if (workflowUiState.value.phase === 'queued') return 'warning'
    if (workflowUiState.value.phase === 'error') return 'error'
    if (workflowUiState.value.phase === 'ready') return 'success'
    return 'muted'
  })
  const typstPdfPaneState = new Map()

  function isPreviewHostPane(paneId) {
    const pane = editorStore.findPane(editorStore.paneTree, paneId)
    if (!pane) return false
    if (!pane.activeTab) return true
    const viewerType = getViewerType(pane.activeTab)
    return viewerType === 'typst-native-preview' || viewerType === 'pdf'
  }

  function getTrackedTypstPdfState(sourcePath) {
    const state = typstPdfPaneState.get(sourcePath)
    if (!state?.paneId) return null
    const pane = editorStore.findPane(editorStore.paneTree, state.paneId)
    if (!pane || !isPreviewHostPane(state.paneId)) {
      typstPdfPaneState.delete(sourcePath)
      return null
    }
    return state
  }

  function getTypstSharedPaneInfo(sourcePath, previewPath, artifactPath) {
    const previewBinding = workflowStore.findPreviewBindingForSource(sourcePath, 'native')
    const previewPaneId = (
      previewBinding?.paneId
      || editorStore.findPaneWithTab(previewPath)?.id
      || (
        workflowStore.session.previewSourcePath === sourcePath
        && workflowStore.session.previewKind === 'native'
          ? workflowStore.session.previewPaneId
          : null
      )
      || ''
    )
    if (previewPaneId) {
      return {
        paneId: previewPaneId,
        pane: editorStore.findPane(editorStore.paneTree, previewPaneId),
        previewPath,
        artifactPath,
        hasPreview: true,
        pdfMode: getTrackedTypstPdfState(sourcePath)?.mode || null,
      }
    }

    const tracked = getTrackedTypstPdfState(sourcePath)
    if (tracked?.paneId) {
      return {
        paneId: tracked.paneId,
        pane: editorStore.findPane(editorStore.paneTree, tracked.paneId),
        previewPath,
        artifactPath,
        hasPreview: false,
        pdfMode: tracked.mode,
      }
    }

    const existingPdfPane = editorStore.findPaneWithTab(artifactPath)
    if (existingPdfPane?.id && isPreviewHostPane(existingPdfPane.id)) {
      return {
        paneId: existingPdfPane.id,
        pane: existingPdfPane,
        previewPath,
        artifactPath,
        hasPreview: false,
        pdfMode: 'owned',
      }
    }

    const neighborPane = editorStore.findRightNeighborLeaf?.(paneIdRef.value)
    if (neighborPane?.id && isPreviewHostPane(neighborPane.id)) {
      return {
        paneId: neighborPane.id,
        pane: neighborPane,
        previewPath,
        artifactPath,
        hasPreview: false,
        pdfMode: null,
      }
    }

    return {
      paneId: '',
      pane: null,
      previewPath,
      artifactPath,
      hasPreview: false,
      pdfMode: null,
    }
  }

  function openTypstPdfInPane(sourcePath, artifactPath, paneId, mode) {
    if (!paneId) return false
    typstPdfPaneState.set(sourcePath, { paneId, mode })
    editorStore.openFileInPane(artifactPath, paneId, { activatePane: true })
    return true
  }

  function closeTypstSharedPane(sourcePath, previewPath, artifactPath, paneId, trigger) {
    if (previewPath) {
      workflowStore.closePreviewForSource(sourcePath, {
        previewKind: 'native',
        trigger,
        reconcile: false,
      })
    }
    if (paneId) {
      const pane = editorStore.findPane(editorStore.paneTree, paneId)
      if (pane?.tabs.includes(artifactPath)) {
        editorStore.closeTab(paneId, artifactPath)
      }
    } else {
      editorStore.closeFileFromAllPanes(artifactPath)
    }
    typstPdfPaneState.delete(sourcePath)
    workflowStore.reconcile({ trigger })
  }

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

  async function handlePreviewMarkdown() {
    if (!activeTabRef.value) return
    await workflowStore.togglePreviewForSource(activeTabRef.value, {
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
    await handlePreviewMarkdown()
  }

  async function handleWorkflowRevealPreview() {
    if (!workflowUiState.value || !activeTabRef.value) return
    if (workflowUiState.value.kind === 'markdown') {
      handlePreviewMarkdown()
      return
    }
    if (workflowUiState.value.kind === 'typst') {
      const sourcePath = activeTabRef.value
      const previewPath = workflowStore.getPreviewPathForSource(sourcePath, 'native')
      const artifactPath = activeCompileAdapter.value?.getArtifactPath?.(sourcePath, buildAdapterContext()) || ''
      const shared = getTypstSharedPaneInfo(sourcePath, previewPath, artifactPath)
      const activeTab = shared.pane?.activeTab || ''

      if (shared.paneId && activeTab === previewPath) {
        closeTypstSharedPane(sourcePath, previewPath, artifactPath, shared.paneId, 'typst-preview-toggle-close')
        return
      }

      if (shared.paneId && activeTab === artifactPath) {
        const result = workflowStore.ensurePreviewForSource(sourcePath, {
          previewKind: 'native',
          activatePreview: false,
          sourcePaneId: paneIdRef.value,
          trigger: 'typst-preview-toggle-switch',
        })
        const targetPaneId = result?.previewPaneId || shared.paneId
        if (previewPath && targetPaneId) {
          editorStore.openFileInPane(previewPath, targetPaneId, { activatePane: true })
          if (shared.pdfMode === 'owned') {
            const targetPane = editorStore.findPane(editorStore.paneTree, targetPaneId)
            if (targetPane?.tabs.includes(artifactPath)) {
              editorStore.closeTab(targetPaneId, artifactPath)
            }
          }
        }
        typstPdfPaneState.delete(sourcePath)
        return
      }

      await workflowStore.togglePreviewForSource(sourcePath, {
        previewKind: 'native',
        activatePreview: true,
        jump: true,
        sourcePaneId: paneIdRef.value,
        trigger: 'workflow-toggle-preview',
      })
      typstPdfPaneState.delete(sourcePath)
      return
    }
    await workflowStore.togglePreviewForSource(activeTabRef.value, {
      previewKind: workflowUiState.value.previewKind,
      activatePreview: true,
      jump: true,
      sourcePaneId: paneIdRef.value,
      trigger: 'workflow-toggle-preview',
    })
  }

  function handleWorkflowRevealPdf() {
    if (!workflowUiState.value || workflowUiState.value.kind !== 'typst' || !activeTabRef.value) return

    const sourcePath = activeTabRef.value
    const artifactPath = activeCompileAdapter.value?.getArtifactPath?.(activeTabRef.value, buildAdapterContext())
    if (!artifactPath) return
    const previewPath = workflowStore.getPreviewPathForSource(sourcePath, 'native')
    const shared = getTypstSharedPaneInfo(sourcePath, previewPath, artifactPath)
    const activeTab = shared.pane?.activeTab || ''

    if (shared.paneId && activeTab === artifactPath) {
      if (shared.pdfMode === 'overlay' && previewPath) {
        editorStore.openFileInPane(previewPath, shared.paneId, { activatePane: true })
      } else {
        const pane = editorStore.findPane(editorStore.paneTree, shared.paneId)
        if (pane?.tabs.includes(artifactPath)) {
          editorStore.closeTab(shared.paneId, artifactPath)
        }
      }
      typstPdfPaneState.delete(sourcePath)
      return
    }

    if (shared.paneId && activeTab === previewPath) {
      openTypstPdfInPane(sourcePath, artifactPath, shared.paneId, 'overlay')
      return
    }

    if (shared.paneId) {
      openTypstPdfInPane(sourcePath, artifactPath, shared.paneId, shared.hasPreview ? 'overlay' : 'owned')
      return
    }

    const newPaneId = editorStore.splitPaneWith(paneIdRef.value, 'vertical', artifactPath)
    if (newPaneId) {
      typstPdfPaneState.set(sourcePath, { paneId: newPaneId, mode: 'owned' })
      editorStore.setActivePane(newPaneId)
    }
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
  }
}
