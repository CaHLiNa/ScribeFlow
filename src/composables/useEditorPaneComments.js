import { computed, onMounted, onUnmounted, ref } from 'vue'

export function useEditorPaneComments(options) {
  const {
    paneIdRef,
    activeTabRef,
    viewerTypeRef,
    editorStore,
    commentsStore,
    editorContainerRef,
  } = options

  const hasEditorSelection = ref(false)
  const commentPanelMode = ref('view')
  const commentSelectionRange = ref(null)
  const commentSelectionText = ref(null)

  const showCommentPanel = computed(() => {
    if (commentPanelMode.value === 'create') return true
    if (!commentsStore.activeCommentId) return false
    const comment = commentsStore.activeComment
    return comment && comment.filePath === activeTabRef.value
  })

  const containerRect = computed(() => (
    editorContainerRef.value?.getBoundingClientRect() || null
  ))

  const currentEditorView = computed(() => {
    if (!activeTabRef.value || viewerTypeRef.value !== 'text') return null
    return editorStore.getEditorView(paneIdRef.value, activeTabRef.value)
  })

  function onSelectionChange(hasSelection) {
    hasEditorSelection.value = hasSelection
  }

  function closeCommentPanel() {
    commentsStore.setActiveComment(null)
    commentPanelMode.value = 'view'
    commentSelectionRange.value = null
    commentSelectionText.value = null
  }

  function onCommentCreated(comment) {
    commentPanelMode.value = 'view'
    commentSelectionRange.value = null
    commentSelectionText.value = null
    commentsStore.setActiveComment(comment.id)
  }

  function startComment() {
    const view = currentEditorView.value
    if (!view) return
    const selection = view.state.selection.main
    if (selection.from === selection.to) return

    commentPanelMode.value = 'create'
    commentSelectionRange.value = { from: selection.from, to: selection.to }
    commentSelectionText.value = view.state.sliceDoc(selection.from, selection.to)
    commentsStore.setActiveComment(null)

    if (!commentsStore.isMarginVisible(activeTabRef.value)) {
      commentsStore.toggleMargin(activeTabRef.value)
    }
  }

  function handleCommentCreate(event) {
    if (event.detail?.paneId !== paneIdRef.value) return
    startComment()
  }

  async function handleCommentScrollTo(event) {
    const { commentId, filePath } = event.detail || {}
    if (filePath !== activeTabRef.value) return
    const view = currentEditorView.value
    if (!view) return
    const comment = commentsStore.commentsForFile(filePath).find((item) => item.id === commentId)
    if (!comment) return
    const { EditorView } = await import('@codemirror/view')
    view.dispatch({
      effects: EditorView.scrollIntoView(comment.range.from, { y: 'start', yMargin: 50 }),
    })
  }

  onMounted(() => {
    window.addEventListener('comment-create', handleCommentCreate)
    window.addEventListener('comment-scroll-to', handleCommentScrollTo)
  })

  onUnmounted(() => {
    window.removeEventListener('comment-create', handleCommentCreate)
    window.removeEventListener('comment-scroll-to', handleCommentScrollTo)
  })

  return {
    hasEditorSelection,
    showCommentPanel,
    containerRect,
    currentEditorView,
    commentPanelMode,
    commentSelectionRange,
    commentSelectionText,
    onSelectionChange,
    closeCommentPanel,
    onCommentCreated,
    startComment,
  }
}
