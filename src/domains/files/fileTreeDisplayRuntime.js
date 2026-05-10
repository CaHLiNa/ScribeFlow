function normalizedEntryName(entry = {}) {
  return String(entry.display_name || entry.name || '').trim()
}

function isHiddenEntry(entry = {}) {
  return normalizedEntryName(entry).startsWith('.')
}

function sortEntries(entries = [], sortMode = 'name') {
  const nextEntries = [...entries]
  nextEntries.sort((left, right) => {
    if (left.is_dir !== right.is_dir) {
      return left.is_dir ? -1 : 1
    }

    if (sortMode === 'modified' && !left.is_dir && !right.is_dir) {
      const leftModified = Number(left.modified || 0)
      const rightModified = Number(right.modified || 0)
      if (leftModified !== rightModified) {
        return rightModified - leftModified
      }
    }

    return normalizedEntryName(left).toLowerCase().localeCompare(normalizedEntryName(right).toLowerCase())
  })
  return nextEntries
}

function foldSingleChildDirectory(entry = {}) {
  if (!entry.is_dir || !Array.isArray(entry.children)) return entry

  const segments = [String(entry.name || '').trim()].filter(Boolean)
  let current = entry

  while (
    Array.isArray(current.children) &&
    current.children.length === 1 &&
    current.children[0]?.is_dir === true
  ) {
    current = current.children[0]
    segments.push(String(current.name || '').trim())
  }

  return {
    ...current,
    name: current.name,
    display_name: segments.join('/'),
  }
}

export function applyFileTreeDisplayPreferences(entries = [], preferences = {}) {
  const {
    showHidden = true,
    sortMode = 'name',
    foldDirectories = false,
  } = preferences

  const normalizedEntries = (Array.isArray(entries) ? entries : [])
    .filter((entry) => (showHidden ? true : !isHiddenEntry(entry)))
    .map((entry) => {
      const children = Array.isArray(entry.children)
        ? applyFileTreeDisplayPreferences(entry.children, preferences)
        : entry.children

      const nextEntry = {
        ...entry,
        children,
      }

      return foldDirectories ? foldSingleChildDirectory(nextEntry) : nextEntry
    })

  return sortEntries(normalizedEntries, sortMode)
}
