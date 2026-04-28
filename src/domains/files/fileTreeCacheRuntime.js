function cloneRootEntries(entries = []) {
  return entries.map((entry) => {
    const { children, ...rest } = entry
    return { ...rest }
  })
}

function collectRootExpandedDirs(entries = [], expandedDirs = new Set()) {
  const rootDirPaths = new Set(entries.filter((entry) => entry?.is_dir).map((entry) => entry.path))
  return [...expandedDirs].filter((path) => rootDirPaths.has(path))
}

export function buildWorkspaceTreeCacheSnapshot({ tree = [], expandedDirs = new Set() } = {}) {
  return {
    tree: cloneRootEntries(tree),
    rootExpandedDirs: collectRootExpandedDirs(tree, expandedDirs),
  }
}

export function buildTreeStatePatch(tree = [], options = {}) {
  const { preserveFlatFiles = false } = options
  const patch = { tree }
  if (!preserveFlatFiles) {
    patch.flatFilesCache = []
    patch.flatFilesReady = false
  }
  return patch
}

export function buildFlatFilesStatePatch(flatFiles = []) {
  return {
    flatFilesCache: flatFiles,
    flatFilesReady: true,
  }
}

export function buildRestoredCachedTreeState(cachedSnapshot) {
  if (!cachedSnapshot?.tree) return null
  return {
    tree: cloneRootEntries(cachedSnapshot.tree),
    flatFilesCache: [],
    flatFilesReady: false,
    expandedDirs: new Set(cachedSnapshot.rootExpandedDirs || []),
    lastLoadError: null,
  }
}

export async function replayCachedExpandedDirs({
  workspacePath,
  cachedSnapshot,
  maxDirs = 6,
  getCurrentWorkspacePath,
  ensureDirLoaded,
  onDirExpanded,
  persistSnapshot,
} = {}) {
  if (!workspacePath) return
  const rootExpandedDirs = Array.isArray(cachedSnapshot?.rootExpandedDirs)
    ? cachedSnapshot.rootExpandedDirs
    : []

  for (const dirPath of rootExpandedDirs.slice(0, maxDirs)) {
    if (getCurrentWorkspacePath?.() !== workspacePath) return
    try {
      await ensureDirLoaded?.(dirPath)
      onDirExpanded?.(dirPath)
    } catch {
      // Directory may have disappeared or become inaccessible.
    }
  }

  persistSnapshot?.()
}
