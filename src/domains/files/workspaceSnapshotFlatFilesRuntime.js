function normalizeFlatFilePath(entry = null) {
  if (typeof entry === 'string') return entry
  return entry?.path || ''
}

function basename(path = '') {
  return (
    String(path || '')
      .split('/')
      .pop() || ''
  )
}

function normalizeFlatFileEntry(entry = null) {
  const path = normalizeFlatFilePath(entry)
  if (!path) return null
  if (typeof entry === 'string') {
    return {
      path,
      name: basename(path),
      is_dir: false,
    }
  }

  return {
    ...entry,
    path,
    name: entry?.name || basename(path),
  }
}

export function listWorkspaceFlatFileEntries(snapshot = null, options = {}) {
  const entries = Array.isArray(snapshot?.flatFiles) ? snapshot.flatFiles : []
  const includeDirectories = options?.includeDirectories === true

  return entries
    .map((entry) => normalizeFlatFileEntry(entry))
    .filter((entry) => entry && (includeDirectories || !entry.is_dir))
}

export function listWorkspaceFlatFilePaths(snapshot = null) {
  return listWorkspaceFlatFileEntries(snapshot).map((entry) => entry.path)
}

export function filterWorkspaceFlatFilesByExtension(snapshot = null, extensions = []) {
  const normalizedExtensions = new Set(
    extensions.map((extension) => String(extension || '').toLowerCase()).filter(Boolean)
  )
  if (normalizedExtensions.size === 0) return []

  return listWorkspaceFlatFileEntries(snapshot).filter((entry) => {
    const lower = entry.path.toLowerCase()
    return [...normalizedExtensions].some((extension) => lower.endsWith(extension))
  })
}

export function countWorkspaceFlatFilesByExtension(snapshot = null, extensions = []) {
  return filterWorkspaceFlatFilesByExtension(snapshot, extensions).length
}

export function filterExistingRecentFiles(recentFiles = [], snapshot = null) {
  const availablePaths = new Set(listWorkspaceFlatFilePaths(snapshot))
  return (recentFiles || []).filter((entry) => availablePaths.has(entry?.path))
}
