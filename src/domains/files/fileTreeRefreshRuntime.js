import {
  collectLoadedTreeDirs,
  mergeLoadedTreeEntries,
  patchTreeDirChildren,
} from '../../services/fileTreeRuntimeBridge.js'

export async function patchTreeEntry(entries = [], targetPath, updater) {
  const current = findTreeEntry(entries, targetPath)
  if (!current) return entries
  const nextEntry = updater(current)
  const children = Array.isArray(nextEntry?.children) ? nextEntry.children : []
  return patchTreeDirChildren(entries, targetPath, children)
}

export async function mergePreservingLoadedChildren(nextEntries = [], previousEntries = []) {
  return mergeLoadedTreeEntries(nextEntries, previousEntries)
}

export async function collectLoadedDirectoryPaths(entries = [], paths = []) {
  return collectLoadedTreeDirs(entries, '', paths)
}

function findTreeEntry(entries = [], targetPath) {
  for (const entry of entries) {
    if (entry.path === targetPath) return entry
    if (Array.isArray(entry.children)) {
      const found = findTreeEntry(entry.children, targetPath)
      if (found) return found
    }
  }
  return null
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
  readVisibleTree,
  readWorkspaceSnapshot,
  applyWorkspaceSnapshot,
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
      const loadedDirectories = (await collectLoadedTreeDirs(currentTree, workspacePath))
        .filter(path => path !== workspacePath)

      let nextTree = null
      if (readWorkspaceSnapshot && applyWorkspaceSnapshot) {
        const snapshot = await readWorkspaceSnapshot(workspacePath, loadedDirectories)
        nextTree = snapshot?.tree ?? []
        applyWorkspaceSnapshot(snapshot, workspacePath, { preserveFlatFiles: true })
      } else if (readVisibleTree) {
        nextTree = await readVisibleTree(workspacePath, loadedDirectories)
      } else {
        nextTree = await readDirShallow?.(workspacePath)
        nextTree = await mergePreservingLoadedChildren(nextTree, currentTree)

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
          const patchedEntryChildren = Array.isArray(previousEntry?.children)
            ? previousEntry.children
            : []
          nextTree = await patchTreeDirChildren(
            nextTree,
            result.dirPath,
            await mergePreservingLoadedChildren(
              result.children,
              patchedEntryChildren,
            ),
          )
        }
      }

      if (runGeneration !== generation) {
        return getCurrentTree?.() ?? nextTree
      }

      const previousSnapshot = JSON.stringify(normalizeTreeSnapshot(currentTree))
      const nextSnapshot = JSON.stringify(normalizeTreeSnapshot(nextTree))
      if (previousSnapshot !== nextSnapshot && !(readWorkspaceSnapshot && applyWorkspaceSnapshot)) {
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
