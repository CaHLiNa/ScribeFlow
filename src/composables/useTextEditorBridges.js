import { onMounted, onUnmounted, watch } from 'vue'
import { buildInsertText } from '../editor/textEditorInteractions'
import { computeMinimalChange } from '../utils/textDiff'

export function useTextEditorBridges(options) {
  const {
    filePath,
    editorContainer,
    getView,
    files,
    isMarkdownFile,
    isLatexFile,
  } = options

  let dropOverlay = null
  let dropCursor = null
  let draggedFilePaths = []

  function showMergeViewIfNeeded() {}

  function cleanupDropOverlay() {
    if (dropOverlay) {
      dropOverlay.remove()
      dropOverlay = null
    }
    if (dropCursor) {
      dropCursor.remove()
      dropCursor = null
    }
  }

  function ensureDropOverlay() {
    if (!editorContainer.value || dropOverlay) return

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

  function onFileTreeDragStart(event) {
    draggedFilePaths = event.detail?.paths || []
    if (!draggedFilePaths.length) return
    ensureDropOverlay()
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
    if (!view) return

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
    cleanupDropOverlay()
  }

  watch(
    () => files.fileContents[filePath],
    (newContent) => {
      const view = getView()
      if (!view || newContent === undefined) return

      const currentContent = view.state.doc.toString()
      const change = computeMinimalChange(currentContent, newContent)
      if (change) {
        view.dispatch({ changes: change })
      }
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
    showMergeViewIfNeeded,
  }
}
