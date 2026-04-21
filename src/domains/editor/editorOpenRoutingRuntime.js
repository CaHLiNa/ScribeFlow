import { activateOrOpenPaneTab, appendFreshPaneTab } from './paneTabs.js'

export function createEditorOpenRoutingRuntime({
  getActivePaneId,
  setActivePaneId,
  findPane,
  findPaneWithTab,
  rememberContextPath,
  recordFileOpen,
  revealInTree,
  saveEditorState,
  createNewTabPath,
} = {}) {
  function rememberOpenedPath(path) {
    rememberContextPath?.(path)
    if (
      path
      && !path.startsWith('newtab:')
      && !path.startsWith('draft:')
      && !path.startsWith('preview:')
    ) {
      recordFileOpen?.(path)
    }
  }

  function openFile(path) {
    const existingPane = findPaneWithTab?.(path)
    if (existingPane) {
      const alreadyActive = existingPane.activeTab === path && getActivePaneId?.() === existingPane.id
      if (alreadyActive) {
        rememberOpenedPath(path)
        return existingPane.id
      }
      existingPane.activeTab = path
      setActivePaneId?.(existingPane.id)
      rememberOpenedPath(path)
      saveEditorState?.()
      return existingPane.id
    }

    const pane = findPane?.(getActivePaneId?.())
    if (!pane) return

    activateOrOpenPaneTab(pane, path, {
      replaceLauncher: true,
    })
    rememberOpenedPath(path)
    revealInTree?.(path)
    saveEditorState?.()
    return pane.id
  }

  function openNewTab(paneId = null) {
    const targetPane = paneId
      ? findPane?.(paneId)
      : findPane?.(getActivePaneId?.())
    if (!targetPane) return

    appendFreshPaneTab(targetPane, createNewTabPath?.())
    saveEditorState?.()
  }

  function openFileInPane(path, paneId, options = {}) {
    const pane = findPane?.(paneId)
    if (!pane) return null

    const shouldActivatePane = options.activatePane === true
    const alreadyOpenInTargetPane = pane.activeTab === path && pane.tabs.includes(path)
    const alreadyActivePane = getActivePaneId?.() === paneId

    if (alreadyOpenInTargetPane && (!shouldActivatePane || alreadyActivePane)) {
      if (shouldActivatePane && !alreadyActivePane) {
        setActivePaneId?.(paneId)
        rememberContextPath?.(path)
      } else {
        rememberOpenedPath(path)
      }
      return paneId
    }

    activateOrOpenPaneTab(pane, path, {
      replaceLauncher: options.replaceNewTab !== false,
    })

    if (shouldActivatePane) {
      setActivePaneId?.(paneId)
      rememberContextPath?.(path)
    } else {
      rememberOpenedPath(path)
    }

    saveEditorState?.()
    return paneId
  }

  return {
    openFile,
    openNewTab,
    openFileInPane,
  }
}
