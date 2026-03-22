function patchTreeEntry(entries = [], targetPath, updater) {
  let changed = false
  const nextEntries = entries.map((entry) => {
    if (entry.path === targetPath) {
      changed = true
      return updater(entry)
    }

    if (Array.isArray(entry.children)) {
      const nextChildren = patchTreeEntry(entry.children, targetPath, updater)
      if (nextChildren !== entry.children) {
        changed = true
        return { ...entry, children: nextChildren }
      }
    }

    return entry
  })

  return changed ? nextEntries : entries
}

export { patchTreeEntry }

export function mergePreservingLoadedChildren(nextEntries = [], previousEntries = []) {
  const previousByPath = new Map(previousEntries.map(entry => [entry.path, entry]))
  return nextEntries.map((entry) => {
    const previous = previousByPath.get(entry.path)
    if (!entry.is_dir || !previous?.is_dir) {
      return entry
    }

    if (Array.isArray(previous.children)) {
      if (!Array.isArray(entry.children)) {
        return {
          ...entry,
          children: previous.children,
        }
      }
      return {
        ...entry,
        children: mergePreservingLoadedChildren(entry.children, previous.children),
      }
    }

    return entry
  })
}

function collectLoadedDirectoryPaths(entries = [], paths = []) {
  for (const entry of entries) {
    if (!entry.is_dir || !Array.isArray(entry.children)) continue
    paths.push(entry.path)
    collectLoadedDirectoryPaths(entry.children, paths)
  }
  return paths
}

function normalizeTreeSnapshot(entries = []) {
  return entries.map((entry) => ({
    path: entry.path,
    is_dir: entry.is_dir,
    modified: entry.modified ?? null,
    children: Array.isArray(entry.children) ? normalizeTreeSnapshot(entry.children) : null,
  }))
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

export function createVisibleTreeRefreshRuntime({
  getWorkspacePath,
  getCurrentTree,
  findCurrentEntry,
  readDirShallow,
  applyTree,
  setLastLoadError,
  beginReconcile,
  finishReconcile,
  failReconcile,
  refreshConcurrency = 6,
} = {}) {
  let refreshPromise = null
  let refreshQueued = false
  let generation = 0

  function reset() {
    generation += 1
    refreshPromise = null
    refreshQueued = false
  }

  async function refreshVisibleTreeOnce(options = {}) {
    const workspacePath = getWorkspacePath?.()
    if (!workspacePath) return getCurrentTree?.() ?? []

    const runGeneration = generation
    const {
      suppressErrors = false,
      reason = 'manual',
      announce = false,
    } = options

    beginReconcile?.(reason, { announce })

    try {
      const currentTree = getCurrentTree?.() ?? []
      let nextTree = await readDirShallow?.(workspacePath)
      nextTree = mergePreservingLoadedChildren(nextTree, currentTree)

      const loadedDirectories = collectLoadedDirectoryPaths(currentTree)
        .filter(path => path !== workspacePath)
        .sort((a, b) => a.length - b.length)

      const directoryResults = await mapWithConcurrency(
        loadedDirectories,
        refreshConcurrency,
        async (dirPath) => {
          try {
            const children = await readDirShallow?.(dirPath)
            return { dirPath, children }
          } catch {
            return null
          }
        },
      )

      for (const result of directoryResults) {
        if (!result) continue
        const previousEntry = findCurrentEntry?.(result.dirPath)
        nextTree = patchTreeEntry(nextTree, result.dirPath, (current) => ({
          ...current,
          children: mergePreservingLoadedChildren(
            result.children,
            previousEntry?.children || current.children || [],
          ),
        }))
      }

      if (runGeneration !== generation) {
        return getCurrentTree?.() ?? nextTree
      }

      const previousSnapshot = JSON.stringify(normalizeTreeSnapshot(currentTree))
      const nextSnapshot = JSON.stringify(normalizeTreeSnapshot(nextTree))
      if (previousSnapshot !== nextSnapshot) {
        applyTree?.(nextTree, workspacePath, { preserveFlatFiles: true })
      }

      setLastLoadError?.(null)
      finishReconcile?.(reason)
      return getCurrentTree?.() ?? nextTree
    } catch (error) {
      if (runGeneration === generation) {
        setLastLoadError?.(error)
        failReconcile?.(reason, error, { suppressErrors })
      }
      if (!suppressErrors) throw error
      return getCurrentTree?.() ?? []
    }
  }

  async function refreshVisibleTree(options = {}) {
    if (refreshPromise) {
      refreshQueued = true
      return refreshPromise
    }

    const refreshLoop = async () => {
      let latestTree = getCurrentTree?.() ?? []
      do {
        refreshQueued = false
        latestTree = await refreshVisibleTreeOnce(options)
      } while (refreshQueued)
      return latestTree
    }

    refreshPromise = refreshLoop()
    try {
      return await refreshPromise
    } finally {
      refreshPromise = null
    }
  }

  return {
    refreshVisibleTree,
    reset,
  }
}
