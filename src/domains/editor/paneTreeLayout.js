export const ROOT_PANE_ID = 'pane-root'

const DEFAULT_SPLIT_RATIO = 0.5
const MIN_SPLIT_RATIO = 0.15
const MAX_SPLIT_RATIO = 0.85

function clampSplitRatio(value) {
  return Math.max(MIN_SPLIT_RATIO, Math.min(MAX_SPLIT_RATIO, Number(value) || DEFAULT_SPLIT_RATIO))
}

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

function findCompanionLeaf(rootNode, paneId) {
  if (rootNode?.type !== 'split' || rootNode.direction !== 'vertical') return null
  const [leftLeaf, rightLeaf] = rootNode.children || []
  if (leftLeaf?.id === paneId) return rightLeaf || null
  if (rightLeaf?.id === paneId) return leftLeaf || null
  return rightLeaf || leftLeaf || null
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
  if (leaves.length === 1) return leaves[0]

  return {
    type: 'split',
    direction: 'vertical',
    ratio: clampSplitRatio(node.ratio),
    children: [leaves[0], leaves[1]],
  }
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

export function findRightNeighborLeaf(rootNode, paneId) {
  if (rootNode?.type !== 'split' || rootNode.direction !== 'vertical') return null
  const [leftLeaf, rightLeaf] = rootNode.children || []
  return leftLeaf?.id === paneId ? findFirstLeaf(rightLeaf) : null
}

export function splitPaneNode(rootNode, paneId, newPaneId, newPaneTabs = [], newPaneActiveTab = null) {
  if (!rootNode || !newPaneId) return null

  const companionLeaf = findCompanionLeaf(rootNode, paneId)
  if (companionLeaf) return companionLeaf

  const pane = findPane(rootNode, paneId)
  if (!pane || pane.type !== 'leaf') return null

  const currentData = cloneLeaf(pane, pane.id)
  const newPane = {
    type: 'leaf',
    id: newPaneId,
    tabs: [...newPaneTabs],
    activeTab: newPaneActiveTab,
  }

  Object.keys(rootNode).forEach((key) => delete rootNode[key])
  Object.assign(rootNode, {
    type: 'split',
    direction: 'vertical',
    ratio: DEFAULT_SPLIT_RATIO,
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
