import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'

const TREE_ROW_HEIGHT = 24
const TREE_OVERSCAN = 12

function flattenVisibleRows(entries, depth = 0, rows = [], options = {}) {
  const { expandAll = false, isDirExpanded } = options
  for (const entry of entries) {
    rows.push({ entry, depth })
    if (entry.is_dir && Array.isArray(entry.children) && (expandAll || isDirExpanded(entry.path))) {
      flattenVisibleRows(entry.children, depth + 1, rows, options)
    }
  }
  return rows
}

function filterTreeEntries(entries, query) {
  const normalizedQuery = query.toLowerCase()
  const matchesPath = normalizedQuery.includes('/')
  const result = []

  for (const entry of entries) {
    const target = matchesPath ? entry.path.toLowerCase() : entry.name.toLowerCase()
    if (entry.is_dir) {
      if (target.includes(normalizedQuery)) {
        result.push(entry)
      } else if (Array.isArray(entry.children)) {
        const filteredChildren = filterTreeEntries(entry.children, query)
        if (filteredChildren.length > 0) {
          result.push({ ...entry, children: filteredChildren })
        }
      }
    } else if (target.includes(normalizedQuery)) {
      result.push(entry)
    }
  }

  return result
}

function collectFileMatches(entries, result) {
  for (const entry of entries) {
    if (entry.is_dir && Array.isArray(entry.children)) {
      collectFileMatches(entry.children, result)
    } else if (!entry.is_dir) {
      result.push(entry)
    }
  }
}

export function useFileTreeFilter(options) {
  const { files, editor, workspace, treeContainer, filterInputEl, isMod } = options

  const treeScrollTop = ref(0)
  const containerHeight = ref(0)
  let treeResizeObserver = null

  const filterActive = ref(true)
  const filterQuery = ref('')
  const filterSelectedIdx = ref(0)
  const selectedPaths = reactive(new Set())
  let lastSelectedPath = null

  const filteredTree = computed(() => {
    if (!filterQuery.value) return files.tree
    return filterTreeEntries(files.tree, filterQuery.value)
  })

  const filterMatches = computed(() => {
    if (!filterQuery.value) return []
    const matches = []
    collectFileMatches(filteredTree.value, matches)
    return matches
  })

  const displayTree = computed(() =>
    filterActive.value && filterQuery.value ? filteredTree.value : files.tree
  )

  const visibleRows = computed(() =>
    flattenVisibleRows(displayTree.value, 0, [], {
      expandAll: filterActive.value && !!filterQuery.value,
      isDirExpanded: (path) => files.isDirExpanded(path),
    })
  )

  const visiblePathIndexMap = computed(() => {
    const map = new Map()
    visibleRows.value.forEach((row, index) => map.set(row.entry.path, index))
    return map
  })

  const virtualStart = computed(() =>
    Math.max(0, Math.floor(treeScrollTop.value / TREE_ROW_HEIGHT) - TREE_OVERSCAN)
  )
  const virtualEnd = computed(() =>
    Math.min(
      visibleRows.value.length,
      Math.ceil((treeScrollTop.value + containerHeight.value) / TREE_ROW_HEIGHT) + TREE_OVERSCAN
    )
  )
  const virtualRows = computed(() => visibleRows.value.slice(virtualStart.value, virtualEnd.value))
  const virtualOffset = computed(() => virtualStart.value * TREE_ROW_HEIGHT)
  const totalTreeHeight = computed(() => visibleRows.value.length * TREE_ROW_HEIGHT)

  const filterHighlightPath = computed(() => {
    if (!filterActive.value || !filterQuery.value || filterMatches.value.length === 0) return ''
    const index = Math.min(filterSelectedIdx.value, filterMatches.value.length - 1)
    return filterMatches.value[index]?.path || ''
  })

  function getVisiblePaths() {
    return visibleRows.value.map((row) => row.entry.path)
  }

  function onTreeScroll(event) {
    treeScrollTop.value = event.target?.scrollTop || 0
    files.noteTreeActivity()
  }

  function selectSinglePath(path) {
    selectedPaths.clear()
    selectedPaths.add(path)
    lastSelectedPath = path
    nextTick(() => {
      const index = visiblePathIndexMap.value.get(path)
      if (index == null || !treeContainer.value) return
      const rowTop = index * TREE_ROW_HEIGHT
      const rowBottom = rowTop + TREE_ROW_HEIGHT
      const viewportTop = treeContainer.value.scrollTop
      const viewportBottom = viewportTop + treeContainer.value.clientHeight
      if (rowTop < viewportTop) {
        treeContainer.value.scrollTop = rowTop
      } else if (rowBottom > viewportBottom) {
        treeContainer.value.scrollTop = rowBottom - treeContainer.value.clientHeight
      }
    })
  }

  function navigateTree(delta) {
    const visible = getVisiblePaths()
    if (visible.length === 0) return

    const currentPath = lastSelectedPath || (selectedPaths.size > 0 ? [...selectedPaths][0] : null)
    const currentIndex = currentPath ? visible.indexOf(currentPath) : -1

    let nextIndex
    if (currentIndex === -1) {
      nextIndex = delta > 0 ? 0 : visible.length - 1
    } else {
      nextIndex = Math.max(0, Math.min(visible.length - 1, currentIndex + delta))
    }

    selectSinglePath(visible[nextIndex])
  }

  function findEntry(path) {
    const walk = (entries) => {
      for (const entry of entries) {
        if (entry.path === path) return entry
        if (Array.isArray(entry.children)) {
          const found = walk(entry.children)
          if (found) return found
        }
      }
      return null
    }
    return walk(files.tree)
  }

  async function handleArrowRight() {
    const currentPath = lastSelectedPath || (selectedPaths.size > 0 ? [...selectedPaths][0] : null)
    if (!currentPath) {
      navigateTree(1)
      return
    }

    const entry = findEntry(currentPath)
    if (entry?.is_dir && !files.isDirExpanded(currentPath)) {
      await files.toggleDir(currentPath)
    } else {
      navigateTree(1)
    }
  }

  function handleArrowLeft() {
    const currentPath = lastSelectedPath || (selectedPaths.size > 0 ? [...selectedPaths][0] : null)
    if (!currentPath) return

    const entry = findEntry(currentPath)
    if (entry?.is_dir && files.isDirExpanded(currentPath)) {
      files.expandedDirs.delete(currentPath)
      return
    }

    const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/'))
    if (parentPath && parentPath !== workspace.path && parentPath.startsWith(workspace.path)) {
      selectSinglePath(parentPath)
    }
  }

  async function handleSpace() {
    const currentPath = lastSelectedPath || (selectedPaths.size > 0 ? [...selectedPaths][0] : null)
    if (!currentPath) return

    const entry = findEntry(currentPath)
    if (!entry) return

    if (entry.is_dir) {
      await files.toggleDir(entry.path)
    } else {
      editor.openFile(entry.path)
    }
  }

  function getActivePath() {
    return lastSelectedPath || (selectedPaths.size > 0 ? [...selectedPaths][0] : null)
  }

  function onSelectFile({ path, event }) {
    if (event.shiftKey && lastSelectedPath) {
      try {
        const visible = getVisiblePaths()
        const anchorIndex = visible.indexOf(lastSelectedPath)
        const targetIndex = visible.indexOf(path)
        if (anchorIndex !== -1 && targetIndex !== -1) {
          const from = Math.min(anchorIndex, targetIndex)
          const to = Math.max(anchorIndex, targetIndex)
          if (!isMod(event)) selectedPaths.clear()
          for (let index = from; index <= to; index += 1) {
            selectedPaths.add(visible[index])
          }
          return
        }
      } catch {
        // Fall back to single selection below.
      }
    }

    if (isMod(event)) {
      if (selectedPaths.has(path)) {
        selectedPaths.delete(path)
      } else {
        selectedPaths.add(path)
      }
    } else if (!event.shiftKey) {
      selectedPaths.clear()
      selectedPaths.add(path)
    }

    lastSelectedPath = path
  }

  function activateFilter() {
    filterActive.value = true
    nextTick(() => {
      requestAnimationFrame(() => {
        const input = filterInputEl.value
        input?.focus?.()
        input?.select?.()
      })
    })
  }

  function closeFilter() {
    filterQuery.value = ''
    filterSelectedIdx.value = 0
    nextTick(() => {
      treeContainer.value?.focus()
    })
  }

  function openFilteredMatch() {
    if (filterMatches.value.length === 0) return
    const index = Math.min(filterSelectedIdx.value, filterMatches.value.length - 1)
    const match = filterMatches.value[index]
    if (!match) return
    editor.openFile(match.path)
    closeFilter()
  }

  function handleFilterKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeFilter()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (filterMatches.value.length > 0) {
        filterSelectedIdx.value = (filterSelectedIdx.value + 1) % filterMatches.value.length
      }
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (filterMatches.value.length > 0) {
        filterSelectedIdx.value =
          (filterSelectedIdx.value - 1 + filterMatches.value.length) % filterMatches.value.length
      }
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      openFilteredMatch()
    }
  }

  async function handleTreeKeydown(event) {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      navigateTree(-1)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      navigateTree(1)
      return
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      await handleArrowRight()
      return
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      handleArrowLeft()
      return
    }
    if (event.key === ' ') {
      event.preventDefault()
      await handleSpace()
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      const visible = getVisiblePaths()
      if (visible.length > 0) selectSinglePath(visible[0])
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      const visible = getVisiblePaths()
      if (visible.length > 0) selectSinglePath(visible[visible.length - 1])
      return
    }
    if (isMod(event) && event.key === 'f') {
      event.preventDefault()
      event.stopPropagation()
      activateFilter()
      return
    }
    if (event.key === 'Enter' && selectedPaths.size === 1) {
      event.preventDefault()
      const activePath = [...selectedPaths][0]
      const entry = findEntry(activePath)
      if (entry) {
        event.__fileTreeRenameEntry = entry
      }
      return
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedPaths.size > 0) {
      event.preventDefault()
      event.__fileTreeDeleteSelected = true
    }
  }

  watch(filterQuery, () => {
    filterSelectedIdx.value = 0
  })

  onMounted(() => {
    containerHeight.value = treeContainer.value?.clientHeight || 0
    treeResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerHeight.value = entry.contentRect.height
      }
    })
    if (treeContainer.value) {
      treeResizeObserver.observe(treeContainer.value)
    }
  })

  onUnmounted(() => {
    treeResizeObserver?.disconnect()
    treeResizeObserver = null
  })

  return {
    filterActive,
    filterQuery,
    filterMatches,
    filterHighlightPath,
    visibleRows,
    virtualRows,
    virtualOffset,
    totalTreeHeight,
    selectedPaths,
    onTreeScroll,
    onSelectFile,
    handleTreeKeydown,
    handleFilterKeydown,
    activateFilter,
    closeFilter,
    findEntry,
    getActivePath,
  }
}
