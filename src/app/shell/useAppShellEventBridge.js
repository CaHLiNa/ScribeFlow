import { onMounted, onUnmounted } from 'vue'
import { isMod } from '../../platform'
import { getViewerType, isNewTab } from '../../utils/fileTypes'
import { openExternalHttpUrl, resolveExternalHttpAnchor } from '../../services/externalLinks'
import { confirmUnsavedChanges } from '../../services/unsavedChanges'

function preferredNewFileExtension(path = '') {
  if (path.endsWith('.tex') || path.endsWith('.latex')) return '.tex'
  if (path.endsWith('.markdown')) return '.markdown'
  return '.md'
}

export function useAppShellEventBridge({
  workspace,
  editorStore,
  filesStore,
  toggleSplitPane,
  leftSidebarRef,
  handleVisibilityChange,
  pickWorkspace,
  closeWorkspace,
}) {
  function createDraftDocument(ext = '.md', options = {}) {
    const draftPath = filesStore.createDraftFile({
      ext,
      suggestedName: options.suggestedName,
      initialContent: options.initialContent,
    })
    const targetPaneId = editorStore.activePaneId
    if (targetPaneId) {
      editorStore.openFileInPane(draftPath, targetPaneId, {
        activatePane: true,
      })
      return
    }
    editorStore.openFile(draftPath)
  }

  async function handleKeydown(event) {
    if (isMod(event) && event.key === 's') {
      event.preventDefault()
      const activePath = editorStore.activeTab
      if (!activePath || isNewTab(activePath)) return
      await editorStore.persistPath(activePath)
      return
    }

    if (isMod(event) && event.key === 'o') {
      event.preventDefault()
      pickWorkspace()
      return
    }

    if (isMod(event) && event.key === 'n') {
      event.preventDefault()
      const tab = editorStore.activeTab
      if (tab && !isNewTab(tab) && getViewerType(tab) === 'text') {
        createDraftDocument(preferredNewFileExtension(tab))
      } else {
        createDraftDocument('.md')
      }
      return
    }

    if (isMod(event) && event.key === 'b') {
      event.preventDefault()
      workspace.toggleLeftSidebar()
      return
    }

    if (isMod(event) && event.key === 't') {
      event.preventDefault()
      editorStore.openNewTab()
      return
    }

    if (isMod(event) && event.key === 'j') {
      event.preventDefault()
      toggleSplitPane?.()
      return
    }

    if (isMod(event) && event.key === ',') {
      event.preventDefault()
      workspace.settingsOpen ? workspace.closeSettings() : workspace.openSettings()
      return
    }

    if (isMod(event) && event.shiftKey && (event.key === '[' || event.key === ']')) {
      event.preventDefault()
      editorStore.switchTab(event.key === '[' ? -1 : 1)
      return
    }

    if (isMod(event) && event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault()
      editorStore.switchTab(event.key === 'ArrowLeft' ? -1 : 1)
      return
    }

    if (isMod(event) && event.key === 'w') {
      event.preventDefault()
      const pane = editorStore.activePane
      if (!pane) return
      if (pane.activeTab) {
        const result = await confirmUnsavedChanges([pane.activeTab])
        if (result.choice === 'cancel') return
        editorStore.closeTab(pane.id, pane.activeTab)
      } else {
        const parent = editorStore.findParent(editorStore.paneTree, pane.id)
        if (parent) editorStore.collapsePane(pane.id)
      }
      return
    }

    if (isMod(event) && event.key === 'f') {
      const sidebarEl = document.querySelector('[data-sidebar="left"]')
      if (sidebarEl && sidebarEl.contains(document.activeElement)) {
        event.preventDefault()
        leftSidebarRef.value?.activateFilter()
        return
      }
    }

    if (event.key === 'Escape') {
      if (workspace.settingsOpen) {
        workspace.closeSettings()
        event.preventDefault()
        return
      }
      if (workspace.rightSidebarOpen) {
        workspace.closeRightSidebar()
        event.preventDefault()
      }
    }
  }

  async function handleNewFile() {
    if (!workspace.isOpen) return
    createDraftDocument('.md')
  }

  async function handleBeginNewFile(event) {
    if (!workspace.isOpen) return
    const ext = typeof event?.detail?.ext === 'string' ? event.detail.ext : '.md'
    createDraftDocument(ext, {
      suggestedName: event?.detail?.suggestedName,
      initialContent: event?.detail?.initialContent,
    })
  }

  function handleOpenFolder() {
    pickWorkspace()
  }

  async function handleCloseFolder() {
    if (!workspace.isOpen) return
    await closeWorkspace()
  }

  function handleOpenSettings(event) {
    const section = event?.detail?.section ?? null
    workspace.openSettings(section)
  }

  function handleToggleLeftSidebar() {
    if (!workspace.isOpen) return
    workspace.toggleLeftSidebar()
  }

  function handleExternalLinkActivation(event) {
    if (event.defaultPrevented) return
    const match = resolveExternalHttpAnchor(event.target, document.baseURI)
    if (!match) return
    event.preventDefault()
    event.stopPropagation()
    openExternalHttpUrl(match.url).catch((error) => {
      console.warn('[external-links] failed to open external url:', error)
    })
  }

  function handleExternalLinkKeydown(event) {
    if (event.defaultPrevented || event.key !== 'Enter') return
    const match = resolveExternalHttpAnchor(event.target, document.baseURI)
    if (!match) return
    event.preventDefault()
    event.stopPropagation()
    openExternalHttpUrl(match.url).catch((error) => {
      console.warn('[external-links] failed to open external url:', error)
    })
  }

  function handleSurfaceContextMenuGuard(event) {
    const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement || null
    if (!target?.closest?.('[data-surface-context-guard="true"]')) return
    event.preventDefault()
  }

  onMounted(() => {
    document.addEventListener('click', handleExternalLinkActivation)
    document.addEventListener('contextmenu', handleSurfaceContextMenuGuard, true)
    document.addEventListener('keydown', handleKeydown)
    document.addEventListener('keydown', handleExternalLinkKeydown)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('app:new-file', handleNewFile)
    window.addEventListener('app:begin-new-file', handleBeginNewFile)
    window.addEventListener('app:open-folder', handleOpenFolder)
    window.addEventListener('app:close-folder', handleCloseFolder)
    window.addEventListener('app:open-settings', handleOpenSettings)
    window.addEventListener('app:toggle-left-sidebar', handleToggleLeftSidebar)
  })

  onUnmounted(() => {
    document.removeEventListener('click', handleExternalLinkActivation)
    document.removeEventListener('contextmenu', handleSurfaceContextMenuGuard, true)
    document.removeEventListener('keydown', handleKeydown)
    document.removeEventListener('keydown', handleExternalLinkKeydown)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('app:new-file', handleNewFile)
    window.removeEventListener('app:begin-new-file', handleBeginNewFile)
    window.removeEventListener('app:open-folder', handleOpenFolder)
    window.removeEventListener('app:close-folder', handleCloseFolder)
    window.removeEventListener('app:open-settings', handleOpenSettings)
    window.removeEventListener('app:toggle-left-sidebar', handleToggleLeftSidebar)
  })
}
