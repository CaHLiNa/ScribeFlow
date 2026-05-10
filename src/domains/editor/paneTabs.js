import { isNewTab } from '../../utils/fileTypes.js'

function isLauncherTab(path) {
  return isNewTab(path)
}

export function activateOrOpenPaneTab(pane, path, options = {}) {
  if (!pane || pane.type !== 'leaf' || !path) return false

  if (pane.tabs.includes(path)) {
    pane.activeTab = path
    return true
  }

  const shouldReplaceLauncher = options.replaceLauncher !== false
    && pane.activeTab
    && isLauncherTab(pane.activeTab)

  if (shouldReplaceLauncher) {
    const idx = pane.tabs.indexOf(pane.activeTab)
    if (idx !== -1) {
      pane.tabs.splice(idx, 1, path)
    } else {
      pane.tabs.push(path)
    }
  } else {
    pane.tabs.push(path)
  }

  pane.activeTab = path
  return true
}

export function appendFreshPaneTab(pane, path) {
  if (!pane || pane.type !== 'leaf' || !path) return false
  pane.tabs.push(path)
  pane.activeTab = path
  return true
}

export function closePaneTab(pane, path) {
  if (!pane || pane.type !== 'leaf' || !path) {
    return { closed: false, isEmpty: false, activeTab: pane?.activeTab || null }
  }

  const idx = pane.tabs.indexOf(path)
  if (idx === -1) {
    return { closed: false, isEmpty: false, activeTab: pane.activeTab || null }
  }

  pane.tabs.splice(idx, 1)

  if (pane.activeTab === path) {
    pane.activeTab = pane.tabs.length > 0
      ? pane.tabs[Math.min(idx, pane.tabs.length - 1)]
      : null
  }

  return {
    closed: true,
    isEmpty: pane.tabs.length === 0,
    activeTab: pane.activeTab,
  }
}

export function movePaneTab(fromPane, toPane, tabPath, insertIdx = 0) {
  if (!fromPane || fromPane.type !== 'leaf' || !toPane || toPane.type !== 'leaf') {
    return { moved: false, sourceEmpty: false }
  }
  if (toPane.tabs.includes(tabPath)) {
    return { moved: false, sourceEmpty: false }
  }

  const fromIdx = fromPane.tabs.indexOf(tabPath)
  if (fromIdx === -1) {
    return { moved: false, sourceEmpty: false }
  }

  fromPane.tabs.splice(fromIdx, 1)
  if (fromPane.activeTab === tabPath) {
    fromPane.activeTab = fromPane.tabs.length > 0
      ? fromPane.tabs[Math.min(fromIdx, fromPane.tabs.length - 1)]
      : null
  }

  const clampedIdx = Math.max(0, Math.min(insertIdx, toPane.tabs.length))
  toPane.tabs.splice(clampedIdx, 0, tabPath)
  toPane.activeTab = tabPath

  return {
    moved: true,
    sourceEmpty: fromPane.tabs.length === 0,
  }
}

export function reorderPaneTabs(pane, fromIdx, toIdx) {
  if (!pane || pane.type !== 'leaf' || fromIdx === toIdx) return false
  if (fromIdx < 0 || fromIdx >= pane.tabs.length || toIdx < 0 || toIdx >= pane.tabs.length) return false

  const [moved] = pane.tabs.splice(fromIdx, 1)
  pane.tabs.splice(toIdx, 0, moved)
  return true
}
