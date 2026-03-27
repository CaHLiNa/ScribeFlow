import { onMounted, onUnmounted } from 'vue'
import { isMod } from '../../platform'
import { useAiWorkbenchStore } from '../../stores/aiWorkbench'
import {
  isAiLauncher,
  isChatTab,
  isLibraryPath,
  isNewTab,
  getViewerType,
  isPreviewPath,
} from '../../utils/fileTypes'
import { openExternalHttpUrl, resolveExternalHttpAnchor } from '../../services/externalLinks'
import { confirmUnsavedChanges } from '../../services/unsavedChanges'

export function useAppShellEventBridge({
  workspace,
  editorStore,
  commentsStore,
  headerRef,
  leftSidebarRef,
  bottomPanelRef,
  workspaceSnapshotBrowserVisible,
  fileVersionHistoryVisible,
  handleVisibilityChange,
  pickWorkspace,
  closeWorkspace,
  createSnapshot,
  openWorkspaceSnapshots,
  openFileVersionHistory,
}) {
  const aiWorkbenchStore = useAiWorkbenchStore()

  async function resolveChatStore() {
    const { useChatStore } = await import('../../stores/chat.js')
    return useChatStore()
  }

  async function handleKeydown(event) {
    if (isMod(event) && event.key === 's') {
      event.preventDefault()
      await createSnapshot()
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
      if (tab && isChatTab(tab)) {
        editorStore.openChat({ paneId: editorStore.activePaneId })
      } else if (tab && !isNewTab(tab) && !isAiLauncher(tab) && !isLibraryPath(tab)) {
        const dot = tab.lastIndexOf('.')
        const ext = dot > 0 ? tab.substring(dot) : '.md'
        const nextExt = ext.toLowerCase() === '.docx' ? '.md' : ext
        leftSidebarRef.value?.createNewFile(nextExt)
      } else {
        leftSidebarRef.value?.createNewFile('.md')
      }
      return
    }

    if (isMod(event) && event.key === 'b') {
      const tab = editorStore.activeTab
      if (tab?.endsWith('.md')) return
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
      editorStore.openNewTabBeside()
      return
    }

    if (isMod(event) && event.key === ',') {
      event.preventDefault()
      workspace.settingsOpen ? workspace.closeSettings() : workspace.openSettings()
      return
    }

    if (isMod(event) && event.key === 'p') {
      event.preventDefault()
      headerRef.value?.focusSearch()
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

    if (isMod(event) && event.shiftKey && (event.key === 'L' || event.key === 'l' || event.code === 'KeyL')) {
      event.preventDefault()

      const pane = editorStore.activePane
      if (!pane || !pane.activeTab) return

      if (getViewerType(pane.activeTab) !== 'text') return

      const view = editorStore.getEditorView(pane.id, pane.activeTab)
      if (!view) return
      const selection = view.state.selection.main
      if (selection.from === selection.to) return

      if (!commentsStore.isMarginVisible(pane.activeTab)) {
        commentsStore.toggleMargin(pane.activeTab)
      }

      window.dispatchEvent(new CustomEvent('comment-create', {
        detail: { paneId: pane.id },
      }))
      return
    }

    if (isMod(event) && event.code === 'Backquote') {
      event.preventDefault()
      handleToggleTerminal()
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
      if (workspaceSnapshotBrowserVisible.value) {
        workspaceSnapshotBrowserVisible.value = false
        event.preventDefault()
        return
      }
      if (fileVersionHistoryVisible.value) {
        fileVersionHistoryVisible.value = false
        event.preventDefault()
        return
      }
      if (workspace.rightSidebarOpen) {
        workspace.closeRightSidebar()
        event.preventDefault()
      }
    }
  }

  async function handleChatPrefill(event) {
    const { message } = event.detail || {}
    if (!message) return
    workspace.openAiSurface()
    aiWorkbenchStore.openLauncher()
    const chatStore = await resolveChatStore()
    chatStore.pendingPrefill = message
  }

  function handleAltZ(event) {
    if (
      event.altKey
      && !event.metaKey
      && !event.ctrlKey
      && (event.code === 'KeyZ' || event.code === 'KeyY' || event.key.toLowerCase() === 'z')
    ) {
      event.preventDefault()
      workspace.toggleSoftWrap()
    }
  }

  function handleFocusSearch() {
    headerRef.value?.focusSearch()
  }

  function handleNewFile() {
    if (!workspace.isOpen) return
    leftSidebarRef.value?.createNewFile('.md')
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

  function handleToggleTerminal() {
    if (!workspace.isOpen) return
    if (workspace.bottomPanelOpen) {
      workspace.toggleBottomPanel()
      return
    }
    if (bottomPanelRef.value?.focusTerminal) {
      bottomPanelRef.value.focusTerminal()
      return
    }
    workspace.openBottomPanel()
  }

  function handleOpenFileVersionHistoryEvent(event) {
    const path = event.detail?.path
    if (!path) return
    openFileVersionHistory({ path })
  }

  function handleOpenWorkspaceSnapshotsEvent() {
    openWorkspaceSnapshots()
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

  onMounted(() => {
    document.addEventListener('click', handleExternalLinkActivation)
    document.addEventListener('keydown', handleKeydown)
    document.addEventListener('keydown', handleExternalLinkKeydown)
    document.addEventListener('keydown', handleAltZ, true)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('chat-prefill', handleChatPrefill)
    window.addEventListener('app:focus-search', handleFocusSearch)
    window.addEventListener('app:new-file', handleNewFile)
    window.addEventListener('app:open-folder', handleOpenFolder)
    window.addEventListener('app:close-folder', handleCloseFolder)
    window.addEventListener('app:open-settings', handleOpenSettings)
    window.addEventListener('app:toggle-left-sidebar', handleToggleLeftSidebar)
    window.addEventListener('app:toggle-terminal', handleToggleTerminal)
    window.addEventListener('app:open-workspace-snapshots', handleOpenWorkspaceSnapshotsEvent)
    window.addEventListener('open-file-version-history', handleOpenFileVersionHistoryEvent)
  })

  onUnmounted(() => {
    document.removeEventListener('click', handleExternalLinkActivation)
    document.removeEventListener('keydown', handleKeydown)
    document.removeEventListener('keydown', handleExternalLinkKeydown)
    document.removeEventListener('keydown', handleAltZ, true)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('chat-prefill', handleChatPrefill)
    window.removeEventListener('app:focus-search', handleFocusSearch)
    window.removeEventListener('app:new-file', handleNewFile)
    window.removeEventListener('app:open-folder', handleOpenFolder)
    window.removeEventListener('app:close-folder', handleCloseFolder)
    window.removeEventListener('app:open-settings', handleOpenSettings)
    window.removeEventListener('app:toggle-left-sidebar', handleToggleLeftSidebar)
    window.removeEventListener('app:toggle-terminal', handleToggleTerminal)
    window.removeEventListener('app:open-workspace-snapshots', handleOpenWorkspaceSnapshotsEvent)
    window.removeEventListener('open-file-version-history', handleOpenFileVersionHistoryEvent)
  })
}
