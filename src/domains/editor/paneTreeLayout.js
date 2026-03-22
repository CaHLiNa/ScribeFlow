export const ROOT_PANE_ID = 'pane-root'

export function findPane(node, id) {
  if (!node) return null
  if (node.type === 'leaf' && node.id === id) return node
  if (node.type === 'split' && Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findPane(child, id)
      if (found) return found
    }
  }
  return null
}

export function findParent(node, id, parent = null) {
  if (!node) return null
  if (node.type === 'leaf' && node.id === id) return parent
  if (node.type === 'split' && Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findParent(child, id, node)
      if (found !== null) return found
    }
  }
  return null
}

export function findPaneWithTab(node, tabPath) {
  if (!node) return null
  if (node.type === 'leaf' && node.tabs.includes(tabPath)) return node
  if (node.type === 'split' && Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findPaneWithTab(child, tabPath)
      if (found) return found
    }
  }
  return null
}

export function findLeaf(node, predicate) {
  if (!node) return null
  if (node.type === 'leaf' && predicate(node)) return node
  if (node.type === 'split' && Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findLeaf(child, predicate)
      if (found) return found
    }
  }
  return null
}

export function findFirstLeaf(node) {
  if (!node) return null
  if (node.type === 'leaf') return node
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const leaf = findFirstLeaf(child)
      if (leaf) return leaf
    }
  }
  return null
}

export function findRightNeighborLeaf(rootNode, paneId) {
  const walk = (node, trail = []) => {
    if (!node) return null
    if (node.type === 'leaf') {
      return node.id === paneId ? [...trail, node] : null
    }
    for (const child of node.children || []) {
      const found = walk(child, [...trail, node])
      if (found) return found
    }
    return null
  }

  const trail = walk(rootNode)
  if (!trail || trail.length < 2) return null

  for (let i = trail.length - 2; i >= 0; i -= 1) {
    const parent = trail[i]
    const child = trail[i + 1]
    if (parent?.type !== 'split' || parent.direction !== 'vertical') continue
    const idx = (parent.children || []).findIndex((candidate) => candidate === child)
    if (idx === 0 && parent.children?.[1]) {
      return findFirstLeaf(parent.children[1])
    }
  }

  return null
}

export function splitPaneNode(pane, direction, newPaneId, newPaneTabs = [], newPaneActiveTab = null) {
  if (!pane || pane.type !== 'leaf' || !newPaneId) return null

  const currentData = {
    type: 'leaf',
    id: pane.id,
    tabs: [...pane.tabs],
    activeTab: pane.activeTab,
  }

  const newPane = {
    type: 'leaf',
    id: newPaneId,
    tabs: [...newPaneTabs],
    activeTab: newPaneActiveTab,
  }

  Object.keys(pane).forEach((key) => delete pane[key])
  Object.assign(pane, {
    type: 'split',
    direction,
    ratio: 0.5,
    children: [currentData, newPane],
  })

  return newPane
}

export function collapsePaneNode(rootNode, paneId, activePaneId = null) {
  const parent = findParent(rootNode, paneId)
  if (!parent || parent.type !== 'split') {
    return { collapsed: false, activePaneId }
  }

  const idx = parent.children.findIndex((child) => child.type === 'leaf' && child.id === paneId)
  if (idx === -1) {
    return { collapsed: false, activePaneId }
  }

  const sibling = parent.children[1 - idx]
  Object.keys(parent).forEach((key) => delete parent[key])
  Object.assign(parent, sibling)

  let nextActivePaneId = activePaneId
  if (activePaneId === paneId) {
    if (sibling.type === 'leaf') {
      nextActivePaneId = sibling.id
    } else {
      const firstLeaf = findFirstLeaf(sibling)
      nextActivePaneId = firstLeaf?.id || activePaneId
    }
  }

  return {
    collapsed: true,
    activePaneId: nextActivePaneId,
  }
}
