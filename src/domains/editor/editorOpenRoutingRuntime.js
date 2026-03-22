import {
  getChatSessionId,
  isAiLauncher,
  isAiWorkbenchPath,
  isChatTab,
  isLibraryPath,
  isNewTab,
} from '../../utils/fileTypes.js'
import { activateOrOpenPaneTab, appendFreshPaneTab } from './paneTabs.js'

function isLauncherTab(path) {
  return isNewTab(path) || isAiLauncher(path)
}

function isChatLikeTab(path) {
  return isChatTab(path) || isAiWorkbenchPath(path)
}

function shouldTrackOpenedFile(path) {
  return !!path && !isChatTab(path) && !isLibraryPath(path) && !isAiWorkbenchPath(path)
}

function queueExistingChatInput({
  options,
  dispatchChatPrefill,
  dispatchChatSelection,
} = {}) {
  if (options?.prefill) {
    dispatchChatPrefill?.(options.prefill)
  }
  if (options?.selection) {
    dispatchChatSelection?.(options.selection)
  }
}

function queuePendingChatInput({
  options,
  setPendingChatPrefill,
  setPendingChatSelection,
} = {}) {
  if (options?.prefill) {
    setPendingChatPrefill?.(options.prefill)
  }
  if (options?.selection) {
    setPendingChatSelection?.(options.selection)
  }
}

export function createEditorOpenRoutingRuntime({
  getActivePaneId,
  setActivePaneId,
  getLastChatPaneId,
  setLastChatPaneId,
  findPane,
  findPaneWithTab,
  findLeaf,
  splitPaneWith,
  rememberContextPath,
  recordFileOpen,
  revealInTree,
  saveEditorState,
  createChatSession,
  setActiveChatSessionId,
  setPendingChatPrefill,
  setPendingChatSelection,
  dispatchChatPrefill,
  dispatchChatSelection,
  createNewTabPath,
  createAiLauncherPath,
} = {}) {
  function rememberOpenedPath(path) {
    rememberContextPath?.(path)
    if (shouldTrackOpenedFile(path)) {
      recordFileOpen?.(path)
    }
  }

  function findNonChatPane() {
    return findLeaf?.((node) => (
      !node.activeTab
      || (!isChatTab(node.activeTab) && !isAiWorkbenchPath(node.activeTab))
    )) || null
  }

  function openFile(path) {
    const activePaneId = getActivePaneId?.()
    const pane = findPane?.(activePaneId)
    if (!pane) return

    if (pane.tabs.includes(path)) {
      activateOrOpenPaneTab(pane, path)
      rememberOpenedPath(path)
      saveEditorState?.()
      return
    }

    if (pane.activeTab && isChatLikeTab(pane.activeTab) && !isChatLikeTab(path)) {
      const existingPane = findPaneWithTab?.(path)
      if (existingPane) {
        existingPane.activeTab = path
        setActivePaneId?.(existingPane.id)
        rememberOpenedPath(path)
        saveEditorState?.()
        return
      }

      const altPane = findNonChatPane()
      if (altPane && altPane.id !== pane.id) {
        activateOrOpenPaneTab(altPane, path)
        setActivePaneId?.(altPane.id)
        rememberOpenedPath(path)
        saveEditorState?.()
        return
      }

      const newPaneId = splitPaneWith?.(activePaneId, 'vertical', path)
      if (newPaneId) {
        setActivePaneId?.(newPaneId)
      }
      rememberOpenedPath(path)
      return
    }

    activateOrOpenPaneTab(pane, path)
    rememberOpenedPath(path)
    revealInTree?.(path)
    saveEditorState?.()
  }

  function openChat(options = {}) {
    const sessionId = options.sessionId || createChatSession?.()
    const tabPath = `chat:${sessionId}`

    const existingPane = findPaneWithTab?.(tabPath)
    if (existingPane) {
      setActivePaneId?.(existingPane.id)
      existingPane.activeTab = tabPath
      setActiveChatSessionId?.(sessionId)
      queueExistingChatInput({
        options,
        dispatchChatPrefill,
        dispatchChatSelection,
      })
      return
    }

    const targetPane = options.paneId
      ? findPane?.(options.paneId)
      : findPane?.(getActivePaneId?.())

    if (targetPane) {
      activateOrOpenPaneTab(targetPane, tabPath)
      setActivePaneId?.(targetPane.id)
      setLastChatPaneId?.(targetPane.id)
    }

    setActiveChatSessionId?.(sessionId)
    saveEditorState?.()

    queuePendingChatInput({
      options,
      setPendingChatPrefill,
      setPendingChatSelection,
    })
  }

  function openChatBeside(options = {}) {
    const lastPaneId = getLastChatPaneId?.()
    const lastPane = lastPaneId ? findPane?.(lastPaneId) : null
    if (lastPane?.activeTab && (isChatTab(lastPane.activeTab) || isLauncherTab(lastPane.activeTab))) {
      if (isChatTab(lastPane.activeTab)) {
        const sessionId = getChatSessionId(lastPane.activeTab)
        return openChat({ ...options, sessionId, paneId: lastPane.id })
      }
      return openChat({ ...options, paneId: lastPane.id })
    }

    const visiblePane = findLeaf?.((node) => (
      node.activeTab && (isChatTab(node.activeTab) || isLauncherTab(node.activeTab))
    )) || null
    if (visiblePane) {
      if (isChatTab(visiblePane.activeTab)) {
        const sessionId = getChatSessionId(visiblePane.activeTab)
        return openChat({ ...options, sessionId, paneId: visiblePane.id })
      }
      return openChat({ ...options, paneId: visiblePane.id })
    }

    const sessionId = options.sessionId || createChatSession?.()
    const tabPath = `chat:${sessionId}`
    const newPaneId = splitPaneWith?.(getActivePaneId?.(), 'vertical', tabPath)

    setActiveChatSessionId?.(sessionId)
    if (newPaneId) {
      setLastChatPaneId?.(newPaneId)
    }

    queuePendingChatInput({
      options,
      setPendingChatPrefill,
      setPendingChatSelection,
    })
  }

  function openNewTab(paneId = null) {
    const targetPane = paneId
      ? findPane?.(paneId)
      : findPane?.(getActivePaneId?.())
    if (!targetPane) return

    const tabPath = createNewTabPath?.()
    appendFreshPaneTab(targetPane, tabPath)
    saveEditorState?.()
  }

  function openAiLauncher(paneId = null) {
    const targetPane = paneId
      ? findPane?.(paneId)
      : findPane?.(getActivePaneId?.())
    if (!targetPane) return

    const tabPath = createAiLauncherPath?.()
    appendFreshPaneTab(targetPane, tabPath)
    setLastChatPaneId?.(targetPane.id)
    saveEditorState?.()
  }

  function openFileInPane(path, paneId, options = {}) {
    const pane = findPane?.(paneId)
    if (!pane) return null

    activateOrOpenPaneTab(pane, path, {
      replaceLauncher: options.replaceNewTab !== false,
    })

    if (options.activatePane) {
      setActivePaneId?.(paneId)
      rememberContextPath?.(path)
    }

    saveEditorState?.()
    return paneId
  }

  return {
    openFile,
    openChat,
    openChatBeside,
    openNewTab,
    openAiLauncher,
    openFileInPane,
  }
}
