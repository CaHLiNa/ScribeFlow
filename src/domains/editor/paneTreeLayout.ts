export const ROOT_PANE_ID = 'pane-root'

function cloneLeaf(node, fallbackId = ROOT_PANE_ID) {
  return {
    type: 'leaf',
    id: node?.id || fallbackId,
    tabs: Array.isArray(node?.tabs) ? [...node.tabs] : [],
    activeTab: node?.activeTab || null,
  }
}

function collectLeaves(node, leaves = []) {
  if (!node) return leaves
  if (node.type === 'leaf') {
    leaves.push(node)
    return leaves
  }

  for (const child of node.children || []) {
    collectLeaves(child, leaves)
  }

  return leaves
}

function isContextTab(path = '') {
  return !!path && !String(path).startsWith('newtab:') && !String(path).startsWith('preview:')
}

export function normalizePaneTree(node) {
  if (!node) {
    return cloneLeaf(null)
  }

  if (node.type === 'leaf') {
    return cloneLeaf(node)
  }

  const leaves = collectLeaves(node).map((leaf, index) => (
    cloneLeaf(leaf, index === 0 ? ROOT_PANE_ID : `pane-restored-${index}`)
  ))

  if (leaves.length === 0) return cloneLeaf(null)
  if (leaves.length === 1) return cloneLeaf(leaves[0], ROOT_PANE_ID)

  const tabs = []
  const seen = new Set()
  let activeTab = null

  for (const leaf of leaves) {
    for (const tab of leaf.tabs || []) {
      if (seen.has(tab)) continue
      seen.add(tab)
      tabs.push(tab)
    }
    if (leaf.activeTab && (!activeTab || (!isContextTab(activeTab) && isContextTab(leaf.activeTab)))) {
      activeTab = leaf.activeTab
    }
  }

  return cloneLeaf({
    id: ROOT_PANE_ID,
    tabs,
    activeTab: tabs.includes(activeTab) ? activeTab : tabs[0] || null,
  })
}

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
