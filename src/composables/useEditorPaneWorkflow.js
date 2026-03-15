import { computed, onMounted, onUnmounted, watch } from 'vue'
import { getLanguage, isChatTab, getChatSessionId, isLatex, isRmdOrQmd, isTypst } from '../utils/fileTypes'
import { sendCode, runFile, renderDocument } from '../services/codeRunner'
import {
  ensureLanguageExecutionReady,
  ensureLatexCompileReady,
  ensureMarkdownPdfExportReady,
  ensureTypstCompileReady,
} from '../services/environmentPreflight'
import { ensureBibFile } from '../services/latexBib'
import {
  cleanupMarkdownExportArtifacts,
  markdownPdfPathExists,
  materializeCustomCslStyle,
  writeMarkdownExportFile,
} from '../services/markdownPdfExport'

const BUILTIN_TYPST_STYLES = ['apa', 'chicago', 'ieee', 'harvard', 'vancouver']

function getAllLeaves(node) {
  if (!node) return []
  if (node.type === 'leaf') return [node]
  return (node.children || []).flatMap(getAllLeaves)
}

export function useEditorPaneWorkflow(options) {
  const {
    paneIdRef,
    tabsRef,
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
  const pdfToolbarTargetId = computed(() => (
    `pdf-toolbar-slot-${String(paneIdRef.value || 'pane').replace(/[^a-zA-Z0-9_-]/g, '-')}`
  ))
  const pdfToolbarTargetSelector = computed(() => (
    activeTabRef.value && viewerTypeRef.value === 'pdf'
      ? `#${pdfToolbarTargetId.value}`
      : ''
  ))
  const showDocumentHeader = computed(() => (
    !!activeTabRef.value && (!!workflowUiState.value || !!pdfToolbarTargetSelector.value)
  ))
  const workflowCanViewLog = computed(() => {
    const kind = workflowUiState.value?.kind
    return kind === 'latex' || kind === 'typst'
  })
  const workflowStatusText = computed(() => {
    if (!activeTabRef.value || !workflowUiState.value) return ''

    if (workflowUiState.value.kind === 'latex') {
      const state = latexStore.stateForFile(activeTabRef.value)
      if (state?.status === 'compiling') return t('Compiling...')
      if (state?.status === 'success') {
        const ms = state?.durationMs
        if (!ms) return t('Compiled')
        if (ms < 1000) return `${ms}ms`
        return `${(ms / 1000).toFixed(1)}s`
      }
    }

    if (workflowUiState.value.kind === 'typst') {
      const state = typstStore.stateForFile(activeTabRef.value)
      if (state?.status === 'compiling') return t('Compiling...')
      if (state?.status === 'success') {
        const ms = state?.durationMs
        if (!ms) return t('Compiled')
        if (ms < 1000) return `${ms}ms`
        return `${(ms / 1000).toFixed(1)}s`
      }
    }

    if (workflowUiState.value.kind === 'markdown' && workflowUiState.value.phase === 'rendering') {
      return t('Rendering...')
    }

    return ''
  })
  const workflowStatusTone = computed(() => {
    if (!workflowUiState.value) return 'muted'
    if (workflowUiState.value.phase === 'compiling' || workflowUiState.value.phase === 'rendering') return 'running'
    if (workflowUiState.value.phase === 'ready') return 'success'
    return 'muted'
  })
  const previewSourcePath = computed(() => (
    activeTabRef.value && viewerTypeRef.value === 'pdf'
      ? workflowStore.getSourcePathForPreview(activeTabRef.value)
      : ''
  ))
  const pdfSourceState = computed(() => (
    activeTabRef.value && viewerTypeRef.value === 'pdf'
      ? filesStore.getPdfSourceState(activeTabRef.value)
      : null
  ))
  const pdfSourceReady = computed(() => (
    viewerTypeRef.value !== 'pdf'
      || !activeTabRef.value
      || pdfSourceState.value?.status === 'ready'
  ))
  const pdfSourceKind = computed(() => pdfSourceState.value?.kind || 'plain')

  function ensurePdfOpen(pdfPath) {
    const leaves = getAllLeaves(editorStore.paneTree)
    if (leaves.some((pane) => pane.tabs.includes(pdfPath))) return

    const sourcePaneId = editorStore.activePaneId
    editorStore.splitPaneWith(sourcePaneId, 'vertical', pdfPath)
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
    if (!(await ensureLatexCompileReady())) return
    await latexStore.compile(activeTabRef.value)
    const state = latexStore.stateForFile(activeTabRef.value)
    if (state?.status === 'success' && state.pdfPath) {
      ensurePdfOpen(state.pdfPath)
    }
  }

  async function handleCompileTypst() {
    if (!activeTabRef.value || !isTypst(activeTabRef.value)) return
    if (!(await ensureTypstCompileReady())) return
    await typstStore.compile(activeTabRef.value)
  }

  function handlePreviewPdf() {
    if (!activeTabRef.value) return

    if (isLatex(activeTabRef.value)) {
      const state = latexStore.stateForFile(activeTabRef.value)
      const pdfPath = state?.pdfPath || activeTabRef.value.replace(/\.tex$/i, '.pdf')
      ensurePdfOpen(pdfPath)
      return
    }

    if (isTypst(activeTabRef.value)) {
      workflowStore.revealPreview(activeTabRef.value, {
        previewKind: 'pdf',
        sourcePaneId: paneIdRef.value,
        trigger: 'typst-preview-button',
      })
    }
  }

  function handlePreviewMarkdown() {
    if (!activeTabRef.value) return
    workflowStore.ensurePreviewForSource(activeTabRef.value, {
      previewKind: 'html',
      activatePreview: true,
      sourcePaneId: paneIdRef.value,
      trigger: 'markdown-preview-button',
    })
  }

  function handleWorkflowPrimaryAction() {
    if (!workflowUiState.value || !activeTabRef.value) return

    if (workflowUiState.value.kind === 'latex') {
      handleCompileTex()
      return
    }
    if (workflowUiState.value.kind === 'typst') {
      handleCompileTypst()
      return
    }
    handlePreviewMarkdown()
  }

  async function handleWorkflowRevealPreview() {
    if (!workflowUiState.value || !activeTabRef.value) return

    if (workflowUiState.value.kind === 'markdown') {
      try {
        const pdfPath = activeTabRef.value.replace(/\.(md|rmd|qmd)$/i, '.pdf')
        const hasPdf = await markdownPdfPathExists(pdfPath)
        if (hasPdf) {
          workflowStore.revealPreview(activeTabRef.value, {
            previewKind: 'pdf',
            sourcePaneId: paneIdRef.value,
            trigger: 'workflow-reveal-markdown-pdf',
          })
          return
        }
      } catch {
        // Fall back to HTML preview if existence check fails.
      }

      handlePreviewMarkdown()
      return
    }

    workflowStore.revealPreview(activeTabRef.value, {
      previewKind: workflowUiState.value.previewKind,
      sourcePaneId: paneIdRef.value,
      trigger: 'workflow-reveal-preview',
    })
  }

  function handleWorkflowViewLog() {
    if (!activeTabRef.value) return
    workflowStore.openLogForFile(activeTabRef.value)
  }

  async function handleExportPdf(settingsOverride) {
    if (!activeTabRef.value) return
    if (!(await ensureMarkdownPdfExportReady())) return

    workflowStore.setMarkdownPdfState(activeTabRef.value, {
      status: 'rendering',
      problems: [],
    })

    try {
      let mdPathForExport = activeTabRef.value
      let tempMdPath = null

      if (isRmdOrQmd(activeTabRef.value)) {
        const content = filesStore.fileContents[activeTabRef.value]
        if (content) {
          const { knitRmd } = await import('../services/rmdKnit')
          tempMdPath = activeTabRef.value.replace(/\.(rmd|qmd)$/i, '.md')
          const imageDir = activeTabRef.value.substring(0, activeTabRef.value.lastIndexOf('/'))
          const knitted = await knitRmd(content, workspace.path, { imageDir })
          await writeMarkdownExportFile(tempMdPath, knitted)
          mdPathForExport = tempMdPath
        }
      }

      const settings = settingsOverride || typstStore.getSettings(activeTabRef.value)
      if (!settings.bib_style) {
        settings.bib_style = referencesStore.citationStyle
      }

      if (settings.bib_style && !BUILTIN_TYPST_STYLES.includes(settings.bib_style)) {
        try {
          settings.bib_style = await materializeCustomCslStyle(activeTabRef.value, settings.bib_style)
        } catch {
          settings.bib_style = 'apa'
        }
      }

      const expectedPdfPath = activeTabRef.value.replace(/\.(md|rmd|qmd)$/i, '.pdf')
      const pdfExisted = await markdownPdfPathExists(expectedPdfPath)

      let bibPath = null
      try {
        bibPath = await ensureBibFile(activeTabRef.value)
      } catch {
        // Continue without bibliography.
      }

      const result = await typstStore.exportToPdf(mdPathForExport, bibPath, settings)

      if (tempMdPath) {
        await cleanupMarkdownExportArtifacts(tempMdPath)
      }

      if (result?.success && result.pdf_path) {
        workflowStore.setMarkdownPdfState(activeTabRef.value, {
          status: 'ready',
          problems: [],
          pdfPath: result.pdf_path,
        })
        workflowStore.bindPreview({
          previewPath: result.pdf_path,
          sourcePath: activeTabRef.value,
          previewKind: 'pdf',
          kind: 'markdown',
        })
        if (!pdfExisted) {
          const pdfName = result.pdf_path.split('/').pop()
          const duration = result.duration_ms ? ` in ${result.duration_ms}ms` : ''
          toastStore.show(`Created ${pdfName}${duration}`)
        }
        workflowStore.revealPreview(activeTabRef.value, {
          previewKind: 'pdf',
          trigger: 'markdown-export-pdf',
        })
        window.dispatchEvent(new CustomEvent('pdf-updated', {
          detail: { path: result.pdf_path },
        }))
      } else if (result?.errors?.length) {
        workflowStore.setMarkdownPdfState(activeTabRef.value, {
          status: 'error',
          problems: result.errors.map((error, index) => ({
            id: `markdown-pdf:${activeTabRef.value}:${index}`,
            sourcePath: activeTabRef.value,
            line: error?.line || null,
            column: error?.column || null,
            severity: error?.severity || 'error',
            message: error?.message || String(error),
            origin: 'preview',
            actionable: true,
            raw: error?.raw || error?.message || String(error),
          })),
        })
        const errorMessage = result.errors.map((error) => error.message).join('\n')
        editorStore.openChatBeside({
          prefill: `Typst export error:\n\`\`\`\n${errorMessage}\n\`\`\`\nBriefly explain and fix.`,
        })
      }
    } catch (error) {
      console.error('PDF export failed:', error)
      workflowStore.setMarkdownPdfState(activeTabRef.value, {
        status: 'error',
        problems: [{
          id: `markdown-pdf:${activeTabRef.value}:catch`,
          sourcePath: activeTabRef.value,
          line: null,
          column: null,
          severity: 'error',
          message: error?.message || String(error),
          origin: 'preview',
          actionable: true,
          raw: error?.stack || String(error),
        }],
      })
    }
  }

  function handleLatexCompileDone(event) {
    const { texPath, pdf_path: pdfPath, success } = event.detail || {}
    if (!success || !pdfPath) return
    if (!tabsRef.value.includes(texPath)) return
    ensurePdfOpen(pdfPath)
  }

  function handleTypstCompileDone(event) {
    const { typPath, pdf_path: pdfPath, success } = event.detail || {}
    if (!success || !pdfPath) return
    if (!tabsRef.value.includes(typPath)) return
    workflowStore.ensurePreviewForSource(typPath, {
      previewKind: 'pdf',
      activatePreview: false,
      sourcePaneId: paneIdRef.value,
      trigger: 'typst-compile-success',
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
    [activeTabRef, viewerTypeRef, previewSourcePath],
    async ([activeTab, type]) => {
      if (!activeTab || type !== 'pdf') return
      try {
        await filesStore.ensurePdfSourceKind(activeTab, { force: true })
      } catch (error) {
        console.warn('[editor] failed to resolve PDF source kind:', error)
      }
    },
    { immediate: true },
  )

  onMounted(() => {
    window.addEventListener('latex-compile-done', handleLatexCompileDone)
    window.addEventListener('typst-compile-done', handleTypstCompileDone)
  })

  onUnmounted(() => {
    window.removeEventListener('latex-compile-done', handleLatexCompileDone)
    window.removeEventListener('typst-compile-done', handleTypstCompileDone)
  })

  return {
    pdfToolbarTargetId,
    pdfToolbarTargetSelector,
    showDocumentHeader,
    workflowUiState,
    workflowCanViewLog,
    workflowStatusText,
    workflowStatusTone,
    pdfSourceReady,
    pdfSourceKind,
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
