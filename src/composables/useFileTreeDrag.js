import { onMounted, onUnmounted, ref } from 'vue'
import { listenNativeFileDropEvents } from '../services/fileTreeSystem'
import { basenamePath } from '../utils/path'

export function useFileTreeDrag(options) {
  const {
    files,
    editor,
    workspace,
    treeContainer,
    selectedPaths,
  } = options

  const dragGhostVisible = ref(false)
  const dragGhostX = ref(0)
  const dragGhostY = ref(0)
  const dragGhostLabel = ref('')
  const dragOverDir = ref(null)
  const externalDragOver = ref(false)

  let draggedPaths = []
  let stopNativeListeners = null

  function cleanupDragState() {
    dragGhostVisible.value = false
    dragOverDir.value = null
    draggedPaths = []
    document.body.classList.remove('tab-dragging')
  }

  function dirAtPosition(x, y) {
    const element = document.elementFromPoint(x, y)
    if (!element) return null
    const dirElement = element.closest('[data-dir-path]')
    if (dirElement) return dirElement.dataset.dirPath
    if (treeContainer.value?.contains(element)) return workspace.path
    return null
  }

  function onDragStart({ path, event }) {
    if (selectedPaths.has(path)) {
      draggedPaths = [...selectedPaths]
    } else {
      draggedPaths = [path]
    }

    const names = draggedPaths.map((itemPath) => basenamePath(itemPath))
    dragGhostLabel.value = names.length === 1 ? names[0] : `${names.length} items`
    dragGhostVisible.value = true
    dragGhostX.value = event.clientX
    dragGhostY.value = event.clientY
    document.body.classList.add('tab-dragging')
    window.dispatchEvent(new CustomEvent('filetree-drag-start', { detail: { paths: [...draggedPaths] } }))

    const onMouseMove = (moveEvent) => {
      dragGhostX.value = moveEvent.clientX
      dragGhostY.value = moveEvent.clientY
      window.dispatchEvent(new CustomEvent('filetree-drag-move', {
        detail: { paths: [...draggedPaths], x: moveEvent.clientX, y: moveEvent.clientY },
      }))
    }

    const onMouseUp = (upEvent) => {
      const endPaths = [...draggedPaths]
      cleanupDragState()
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      window.dispatchEvent(new CustomEvent('filetree-drag-end', {
        detail: { paths: endPaths, x: upEvent.clientX, y: upEvent.clientY },
      }))
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  function onDragLeaveDir(dir) {
    if (dragOverDir.value === dir) {
      dragOverDir.value = null
    }
  }

  async function onDropOnDir(destDir) {
    if (!draggedPaths.length) return
    for (const srcPath of draggedPaths) {
      if (destDir.startsWith(`${srcPath}/`) || destDir === srcPath) continue
      await files.movePath(srcPath, destDir)
    }
    cleanupDragState()
    selectedPaths.clear()
  }

  function onTreeMouseUp() {
    if (!draggedPaths.length || !workspace.path) return
    if (dragOverDir.value) return
    if (!document.body.classList.contains('tab-dragging')) return
    void onDropOnDir(workspace.path)
  }

  onMounted(async () => {
    stopNativeListeners = await listenNativeFileDropEvents({
      onOver: ({ position }) => {
        if (draggedPaths.length > 0) return
        externalDragOver.value = true
        dragOverDir.value = dirAtPosition(position.x, position.y)
      },
      onDrop: async ({ paths, position }) => {
        if (draggedPaths.length > 0) return
        externalDragOver.value = false

        if (!workspace.path || !paths || paths.length === 0) {
          dragOverDir.value = null
          return
        }

        const destDir = dirAtPosition(position.x, position.y) || workspace.path
        dragOverDir.value = null

        let lastCopied = null
        for (const srcPath of paths) {
          const result = await files.copyExternalFile(srcPath, destDir)
          if (result) lastCopied = result
        }
        if (lastCopied) {
          files.expandedDirs.add(destDir)
          if (lastCopied.isDir) {
            files.expandedDirs.add(lastCopied.path)
          } else {
            editor.openFile(lastCopied.path)
          }
        }
      },
      onLeave: () => {
        externalDragOver.value = false
        if (draggedPaths.length === 0) {
          dragOverDir.value = null
        }
      },
    })
  })

  onUnmounted(() => {
    stopNativeListeners?.()
    stopNativeListeners = null
    externalDragOver.value = false
    cleanupDragState()
    window.dispatchEvent(new CustomEvent('filetree-drag-end'))
  })

  return {
    dragGhostVisible,
    dragGhostX,
    dragGhostY,
    dragGhostLabel,
    dragOverDir,
    externalDragOver,
    onDragStart,
    onDragLeaveDir,
    onDropOnDir,
    onTreeMouseUp,
  }
}
