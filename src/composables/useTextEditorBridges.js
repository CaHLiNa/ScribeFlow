import { nextTick, onMounted, onUnmounted, watch } from 'vue'
import { addComment, removeComment, updateComment, setActiveComment, commentField } from '../editor/comments'
import { reconfigureMergeView, computeOriginalContent } from '../editor/diffOverlay'
import { buildInsertText } from '../editor/textEditorInteractions'
import { computeMinimalChange } from '../utils/textDiff'

export function useTextEditorBridges(options) {
  const {
    filePath,
    editorContainer,
    getView,
    files,
    reviews,
    commentsStore,
    isMarkdownFile,
    isLatexFile,
  } = options

  let mergeViewActive = false
  let dropOverlay = null
  let dropCursor = null
  let draggedFilePaths = []

  function handleCommentClick(event) {
    const commentId = event.detail?.commentId
    if (!commentId) return

    commentsStore.setActiveComment(commentId)
    const view = getView()
    if (view) {
      view.dispatch({ effects: setActiveComment.of(commentId) })
    }
    if (!commentsStore.isMarginVisible(filePath)) {
      commentsStore.toggleMargin(filePath)
    }
  }

  function syncCommentsToEditor(editorView) {
    if (!editorView) return

    const storeComments = commentsStore.commentsForFile(filePath)
    const cmState = editorView.state.field(commentField)
    const cmComments = cmState.comments
    const effects = []

    for (const storeComment of storeComments) {
      const existing = cmComments.find((comment) => comment.id === storeComment.id)
      if (!existing) {
        effects.push(addComment.of({
          id: storeComment.id,
          from: Math.min(storeComment.range.from, editorView.state.doc.length),
          to: Math.min(storeComment.range.to, editorView.state.doc.length),
          status: storeComment.status,
          author: storeComment.author,
        }))
      }
    }

    for (const comment of cmComments) {
      if (!storeComments.find((storeComment) => storeComment.id === comment.id)) {
        effects.push(removeComment.of(comment.id))
      }
    }

    for (const storeComment of storeComments) {
      const existing = cmComments.find((comment) => comment.id === storeComment.id)
      if (existing && existing.status !== storeComment.status) {
        effects.push(updateComment.of({ id: storeComment.id, status: storeComment.status }))
      }
    }

    if (cmState.activeId !== commentsStore.activeCommentId) {
      effects.push(setActiveComment.of(commentsStore.activeCommentId))
    }

    if (effects.length) {
      editorView.dispatch({ effects })
    }
  }

  function pushCommentPositionsToStore(editorView) {
    const cmState = editorView.state.field(commentField)
    for (const comment of cmState.comments) {
      commentsStore.updateRange(comment.id, comment.from, comment.to)
    }
  }

  function showMergeViewIfNeeded() {
    const view = getView()
    if (!view) return

    const edits = reviews.editsForFile(filePath)
    if (edits.length > 0) {
      const currentContent = view.state.doc.toString()
      const original = computeOriginalContent(currentContent, edits)

      if (original !== currentContent) {
        mergeViewActive = true
        reconfigureMergeView(view, original, () => {
          mergeViewActive = false
          reconfigureMergeView(view, null)
          const finalContent = view.state.doc.toString()
          files.saveFile(filePath, finalContent)
          for (const edit of reviews.editsForFile(filePath)) {
            reviews.acceptEdit(edit.id)
          }
        })
      } else if (mergeViewActive) {
        mergeViewActive = false
        reconfigureMergeView(view, null)
      }
    } else if (mergeViewActive) {
      mergeViewActive = false
      reconfigureMergeView(view, null)
    }
  }

  function onFileTreeDragStart(event) {
    draggedFilePaths = event.detail?.paths || []
    if (!draggedFilePaths.length || !editorContainer.value) return

    dropOverlay = document.createElement('div')
    dropOverlay.style.cssText = 'position:absolute;inset:0;z-index:50;cursor:copy;'
    editorContainer.value.style.position = 'relative'
    editorContainer.value.appendChild(dropOverlay)

    dropCursor = document.createElement('div')
    dropCursor.style.cssText = 'position:absolute;width:2px;pointer-events:none;background:var(--accent);z-index:51;opacity:0.8;display:none;'
    editorContainer.value.appendChild(dropCursor)

    dropOverlay.addEventListener('mousemove', onOverlayMouseMove)
    dropOverlay.addEventListener('mouseup', onOverlayMouseUp)
  }

  function onOverlayMouseMove(event) {
    const view = getView()
    if (!view || !dropCursor) return

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
    if (pos === null) {
      dropCursor.style.display = 'none'
      return
    }

    const coords = view.coordsAtPos(pos)
    if (!coords) {
      dropCursor.style.display = 'none'
      return
    }

    const rect = editorContainer.value.getBoundingClientRect()
    dropCursor.style.display = ''
    dropCursor.style.left = `${coords.left - rect.left}px`
    dropCursor.style.top = `${coords.top - rect.top}px`
    dropCursor.style.height = `${coords.bottom - coords.top}px`
  }

  function onOverlayMouseUp(event) {
    const view = getView()
    if (!view || !draggedFilePaths.length) return

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
    if (pos === null) return

    const text = buildInsertText(draggedFilePaths, {
      filePath,
      isMarkdownFile,
      isLatexFile,
    })
    if (!text) return

    view.dispatch({
      changes: { from: pos, to: pos, insert: text },
      selection: { anchor: pos + text.length },
    })
    view.focus()
  }

  function onFileTreeDragEnd() {
    draggedFilePaths = []
    if (dropOverlay) {
      dropOverlay.remove()
      dropOverlay = null
    }
    if (dropCursor) {
      dropCursor.remove()
      dropCursor = null
    }
  }

  watch(
    () => commentsStore.commentsForFile(filePath),
    () => {
      const view = getView()
      if (view) syncCommentsToEditor(view)
    },
    { deep: true },
  )

  watch(
    () => commentsStore.activeCommentId,
    (newId) => {
      const view = getView()
      if (view) {
        view.dispatch({ effects: setActiveComment.of(newId) })
      }
    },
  )

  watch(
    () => reviews.editsForFile(filePath),
    async () => {
      await nextTick()
      showMergeViewIfNeeded()
    },
    { deep: true },
  )

  watch(
    () => files.fileContents[filePath],
    (newContent) => {
      const view = getView()
      if (!view || newContent === undefined) return

      const currentContent = view.state.doc.toString()
      const change = computeMinimalChange(currentContent, newContent)
      if (change) {
        if (mergeViewActive) {
          mergeViewActive = false
          reconfigureMergeView(view, null)
        }
        view.dispatch({ changes: change })
      }
      showMergeViewIfNeeded()
    },
  )

  onMounted(() => {
    window.addEventListener('filetree-drag-start', onFileTreeDragStart)
    window.addEventListener('filetree-drag-end', onFileTreeDragEnd)
  })

  onUnmounted(() => {
    window.removeEventListener('filetree-drag-start', onFileTreeDragStart)
    window.removeEventListener('filetree-drag-end', onFileTreeDragEnd)
    onFileTreeDragEnd()
  })

  return {
    handleCommentClick,
    syncCommentsToEditor,
    pushCommentPositionsToStore,
    showMergeViewIfNeeded,
  }
}
