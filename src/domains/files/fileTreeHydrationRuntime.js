import {
  mergePreservingLoadedChildren,
  patchTreeEntry,
} from './fileTreeRefreshRuntime.js'
import {
  collectLoadedTreeDirs,
  listAncestorTreeDirs,
} from '../../services/fileTreeRuntimeBridge.js'

export function findTreeEntry(entries = [], targetPath) {
  for (const entry of entries) {
    if (entry.path === targetPath) return entry
    if (Array.isArray(entry.children)) {
      const found = findTreeEntry(entry.children, targetPath)
      if (found) return found
    }
  }
  return null
}

async function buildLoadedDirPaths(workspacePath, currentTree = [], extraDirs = []) {
  return collectLoadedTreeDirs(currentTree, workspacePath, extraDirs)
}

export function createFileTreeHydrationRuntime({
  getWorkspacePath,
  getCurrentTree,
  readDirShallow,
  readVisibleTree,
  readWorkspaceSnapshot,
  applyWorkspaceSnapshot,
  applyTree,
  refreshVisibleTree,
  setLastLoadError,
  addExpandedDir,
  removeExpandedDir,
  hasExpandedDir,
  cacheSnapshot,
  invalidateFlatFiles,
} = {}) {
  const dirLoadPromises = new Map()

  async function loadFileTree(options = {}) {
    const workspacePath = getWorkspacePath?.()
    if (!workspacePath) return undefined

    const {
      suppressErrors = false,
      keepCurrentTreeOnError = false,
    } = options

    try {
      if (readWorkspaceSnapshot && applyWorkspaceSnapshot) {
        const snapshot = await readWorkspaceSnapshot(workspacePath, [])
        const nextTree = await mergePreservingLoadedChildren(snapshot?.tree || [], getCurrentTree?.() ?? [])
        applyWorkspaceSnapshot({ ...(snapshot || {}), tree: nextTree }, workspacePath)
        setLastLoadError?.(null)
        return nextTree
      }

      const nextEntries = readVisibleTree
        ? await readVisibleTree(workspacePath, [])
        : await readDirShallow?.(workspacePath)
      const nextTree = await mergePreservingLoadedChildren(nextEntries, getCurrentTree?.() ?? [])
      applyTree?.(nextTree, workspacePath)
      setLastLoadError?.(null)
      return nextTree
    } catch (error) {
      setLastLoadError?.(error)
      if (!suppressErrors) throw error
      return keepCurrentTreeOnError ? (getCurrentTree?.() ?? []) : []
    }
  }

  async function ensureDirLoaded(path, options = {}) {
    const entry = findTreeEntry(getCurrentTree?.() ?? [], path)
    if (!entry?.is_dir) return []

    const { force = false } = options
    if (!force && Array.isArray(entry.children)) {
      return entry.children
    }

    const existingPromise = dirLoadPromises.get(path)
    if (existingPromise && !force) {
      return existingPromise
    }

    const loadPromise = (async () => {
      const workspacePath = getWorkspacePath?.()
      if (readWorkspaceSnapshot && applyWorkspaceSnapshot && workspacePath) {
        const loadedDirs = await buildLoadedDirPaths(workspacePath, getCurrentTree?.() ?? [], [path])

        const snapshot = await readWorkspaceSnapshot(workspacePath, loadedDirs)
        applyWorkspaceSnapshot(snapshot, workspacePath, { preserveFlatFiles: true })
        return findTreeEntry(snapshot?.tree || [], path)?.children || []
      }

      if (readVisibleTree && workspacePath) {
        const loadedDirs = await buildLoadedDirPaths(workspacePath, getCurrentTree?.() ?? [], [path])

        const nextTree = await readVisibleTree(workspacePath, loadedDirs)
        applyTree?.(nextTree, workspacePath, { preserveFlatFiles: true })
        return findTreeEntry(nextTree, path)?.children || []
      }

      const children = await readDirShallow?.(path)
      const nextTree = await patchTreeEntry(getCurrentTree?.() ?? [], path, (current) => ({
        ...current,
        children,
      }))
      applyTree?.(nextTree, getWorkspacePath?.(), { preserveFlatFiles: true })
      return children
    })()

    dirLoadPromises.set(path, loadPromise)
    try {
      return await loadPromise
    } finally {
      dirLoadPromises.delete(path)
    }
  }

  async function revealPath(path) {
    const workspacePath = getWorkspacePath?.()
    const ancestorDirPaths = await listAncestorTreeDirs(workspacePath, path)

    if (readVisibleTree && workspacePath && ancestorDirPaths.length > 0) {
      const nextTree = await readVisibleTree(
        workspacePath,
        await buildLoadedDirPaths(workspacePath, getCurrentTree?.() ?? [], ancestorDirPaths),
      )
      applyTree?.(nextTree, workspacePath, { preserveFlatFiles: true })
      for (const dirPath of ancestorDirPaths) {
        addExpandedDir?.(dirPath)
      }
      cacheSnapshot?.()
      return
    }

    if (readWorkspaceSnapshot && applyWorkspaceSnapshot && workspacePath && ancestorDirPaths.length > 0) {
      const snapshot = await readWorkspaceSnapshot(
        workspacePath,
        await buildLoadedDirPaths(workspacePath, getCurrentTree?.() ?? [], ancestorDirPaths),
      )
      applyWorkspaceSnapshot(snapshot, workspacePath, { preserveFlatFiles: true })
      for (const dirPath of ancestorDirPaths) {
        addExpandedDir?.(dirPath)
      }
      cacheSnapshot?.()
      return
    }

    if (readVisibleTree && workspacePath && ancestorDirPaths.length > 0) {
      const nextTree = await readVisibleTree(
        workspacePath,
        await buildLoadedDirPaths(workspacePath, getCurrentTree?.() ?? [], ancestorDirPaths),
      )
      applyTree?.(nextTree, workspacePath, { preserveFlatFiles: true })
      for (const dirPath of ancestorDirPaths) {
        addExpandedDir?.(dirPath)
      }
      cacheSnapshot?.()
      return
    }

    for (const dirPath of ancestorDirPaths) {
      await ensureDirLoaded(dirPath)
      addExpandedDir?.(dirPath)
    }
    cacheSnapshot?.()
  }

  async function toggleDir(path) {
    if (hasExpandedDir?.(path)) {
      removeExpandedDir?.(path)
      cacheSnapshot?.()
      return
    }

    await ensureDirLoaded(path)
    addExpandedDir?.(path)
    cacheSnapshot?.()
  }

  async function syncTreeAfterMutation(options = {}) {
    const { expandPath = null } = options
    const workspacePath = getWorkspacePath?.()

    if (readWorkspaceSnapshot && applyWorkspaceSnapshot && workspacePath) {
      const extraDirs =
        expandPath && expandPath !== workspacePath
          ? [expandPath]
          : []
      const snapshot = await readWorkspaceSnapshot(
        workspacePath,
        await buildLoadedDirPaths(workspacePath, getCurrentTree?.() ?? [], extraDirs),
      )
      applyWorkspaceSnapshot(snapshot, workspacePath, { preserveFlatFiles: true })

      if (expandPath && expandPath !== workspacePath) {
        addExpandedDir?.(expandPath)
      }

      invalidateFlatFiles?.()
      cacheSnapshot?.()
      return
    }

    if (readVisibleTree && workspacePath) {
      const extraDirs =
        expandPath && expandPath !== workspacePath
          ? [expandPath]
          : []
      const nextTree = await readVisibleTree(
        workspacePath,
        await buildLoadedDirPaths(workspacePath, getCurrentTree?.() ?? [], extraDirs),
      )
      applyTree?.(nextTree, workspacePath, { preserveFlatFiles: true })

      if (expandPath && expandPath !== workspacePath) {
        addExpandedDir?.(expandPath)
      }

      invalidateFlatFiles?.()
      cacheSnapshot?.()
      return
    }

    await refreshVisibleTree?.({ suppressErrors: true, reason: 'mutation' })

    if (expandPath && expandPath !== workspacePath) {
      await ensureDirLoaded(expandPath, { force: true })
      addExpandedDir?.(expandPath)
    }

    invalidateFlatFiles?.()
    cacheSnapshot?.()
  }

  function reset() {
    dirLoadPromises.clear()
  }

  return {
    loadFileTree,
    ensureDirLoaded,
    revealPath,
    toggleDir,
    syncTreeAfterMutation,
    reset,
  }
}
