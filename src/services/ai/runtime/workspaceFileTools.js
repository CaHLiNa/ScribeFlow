import {
  basenamePath,
  extnamePath,
  normalizeFsPath,
  resolveRelativePath,
} from '../../documentIntelligence/workspaceGraph.js'

const DEFAULT_LIST_RESULTS = 200
const DEFAULT_SEARCH_RESULTS = 40
const DEFAULT_READ_MAX_BYTES = 64 * 1024

function clampResults(value = 0, fallback = DEFAULT_LIST_RESULTS) {
  const normalized = Number(value)
  if (!Number.isFinite(normalized) || normalized <= 0) return fallback
  return Math.max(1, Math.min(Math.round(normalized), 500))
}

function getWorkspaceRoot(workspacePath = '') {
  const normalized = normalizeFsPath(workspacePath)
  if (!normalized) {
    throw new Error('No workspace is currently open.')
  }
  return normalized
}

function toRelativeWorkspacePath(workspacePath = '', targetPath = '') {
  const root = getWorkspaceRoot(workspacePath)
  const target = normalizeFsPath(targetPath)
  if (!target || target === root) return '.'
  return target.slice(root.length).replace(/^\/+/, '') || '.'
}

export function isWorkspaceToolPathAllowed(path = '', workspacePath = '') {
  const root = normalizeFsPath(workspacePath)
  const target = normalizeFsPath(path)
  if (!root || !target) return false
  return target === root || target.startsWith(`${root}/`)
}

export function resolveWorkspaceToolPath(inputPath = '', workspacePath = '', options = {}) {
  const root = getWorkspaceRoot(workspacePath)
  const allowWorkspaceRoot = options.allowWorkspaceRoot !== false
  const rawValue = String(inputPath || '').trim()

  if (!rawValue) {
    if (allowWorkspaceRoot) return root
    throw new Error('A workspace path is required.')
  }

  const normalizedInput = normalizeFsPath(rawValue)
  const absolute = normalizedInput.startsWith('/') || /^[A-Za-z]:\//.test(normalizedInput)
  const resolved = absolute ? normalizedInput : resolveRelativePath(root, normalizedInput)

  if (!isWorkspaceToolPathAllowed(resolved, root)) {
    throw new Error('Requested path must stay inside the current workspace.')
  }

  return resolved
}

export function listWorkspaceDirectory({
  workspacePath = '',
  files = [],
  path = '',
  maxResults = DEFAULT_LIST_RESULTS,
} = {}) {
  const root = getWorkspaceRoot(workspacePath)
  const directoryPath = resolveWorkspaceToolPath(path, root, { allowWorkspaceRoot: true })
  const normalizedFiles = (Array.isArray(files) ? files : [])
    .map((entry) => normalizeFsPath(entry?.path || entry))
    .filter(Boolean)
    .filter((entryPath) => isWorkspaceToolPathAllowed(entryPath, root))

  if (directoryPath !== root && normalizedFiles.includes(directoryPath)) {
    throw new Error('Requested directory path points to a file, not a folder.')
  }

  const childEntries = new Map()
  const prefix = directoryPath === root ? `${root}/` : `${directoryPath}/`

  for (const filePath of normalizedFiles) {
    if (!filePath.startsWith(prefix)) continue
    const remainder = filePath.slice(prefix.length)
    if (!remainder) continue

    const [firstSegment, ...restSegments] = remainder.split('/').filter(Boolean)
    if (!firstSegment) continue

    const childPath = normalizeFsPath(`${directoryPath}/${firstSegment}`)
    const kind = restSegments.length > 0 ? 'directory' : 'file'
    if (!childEntries.has(childPath)) {
      childEntries.set(childPath, {
        name: firstSegment,
        path: childPath,
        relativePath: toRelativeWorkspacePath(root, childPath),
        kind,
      })
      continue
    }

    if (kind === 'directory') {
      childEntries.set(childPath, {
        ...childEntries.get(childPath),
        kind,
      })
    }
  }

  const entries = [...childEntries.values()].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1
    return left.relativePath.localeCompare(right.relativePath)
  })

  const limit = clampResults(maxResults, DEFAULT_LIST_RESULTS)
  return {
    path: directoryPath,
    relativePath: toRelativeWorkspacePath(root, directoryPath),
    entries: entries.slice(0, limit),
    truncated: entries.length > limit,
  }
}

function scoreWorkspaceFileMatch(query = '', relativePath = '') {
  const normalizedQuery = String(query || '')
    .trim()
    .toLowerCase()
  const normalizedRelativePath = String(relativePath || '')
    .trim()
    .toLowerCase()
  const basename = basenamePath(normalizedRelativePath)

  if (!normalizedQuery) return Number.POSITIVE_INFINITY
  if (basename === normalizedQuery) return 0
  if (basename.startsWith(normalizedQuery)) return 1
  if (normalizedRelativePath === normalizedQuery) return 2
  if (normalizedRelativePath.startsWith(normalizedQuery)) return 3
  if (basename.includes(normalizedQuery)) return 4
  if (normalizedRelativePath.includes(normalizedQuery)) return 5
  return Number.POSITIVE_INFINITY
}

export function searchWorkspaceFiles({
  workspacePath = '',
  files = [],
  query = '',
  directoryPath = '',
  maxResults = DEFAULT_SEARCH_RESULTS,
} = {}) {
  const root = getWorkspaceRoot(workspacePath)
  const normalizedQuery = String(query || '').trim()
  if (!normalizedQuery) {
    throw new Error('A search query is required.')
  }

  const scopePath = directoryPath
    ? resolveWorkspaceToolPath(directoryPath, root, { allowWorkspaceRoot: true })
    : root
  const scopePrefix = scopePath === root ? `${root}/` : `${scopePath}/`
  const matches = (Array.isArray(files) ? files : [])
    .map((entry) => normalizeFsPath(entry?.path || entry))
    .filter(Boolean)
    .filter((entryPath) => isWorkspaceToolPathAllowed(entryPath, root))
    .filter((entryPath) => entryPath.startsWith(scopePrefix) || entryPath === scopePath)
    .map((entryPath) => {
      const relativePath = toRelativeWorkspacePath(root, entryPath)
      return {
        name: basenamePath(entryPath),
        path: entryPath,
        relativePath,
        extension: extnamePath(entryPath),
        score: scoreWorkspaceFileMatch(normalizedQuery, relativePath),
      }
    })
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score
      return left.relativePath.localeCompare(right.relativePath)
    })

  const limit = clampResults(maxResults, DEFAULT_SEARCH_RESULTS)
  return {
    query: normalizedQuery,
    directoryPath: scopePath,
    relativeDirectoryPath: toRelativeWorkspacePath(root, scopePath),
    matches: matches.slice(0, limit).map(({ score, ...entry }) => entry),
    truncated: matches.length > limit,
  }
}

export async function readWorkspaceFile({
  workspacePath = '',
  path = '',
  maxBytes = DEFAULT_READ_MAX_BYTES,
  readFile = null,
} = {}) {
  const root = getWorkspaceRoot(workspacePath)
  const targetPath = resolveWorkspaceToolPath(path, root, { allowWorkspaceRoot: false })
  const content = await readFile?.(targetPath, {
    maxBytes: Number.isFinite(Number(maxBytes)) ? Number(maxBytes) : DEFAULT_READ_MAX_BYTES,
  })

  if (typeof content !== 'string') {
    return {
      path: targetPath,
      relativePath: toRelativeWorkspacePath(root, targetPath),
      name: basenamePath(targetPath),
      available: false,
      content: '',
      error: 'File content is unavailable or could not be read as text.',
    }
  }

  return {
    path: targetPath,
    relativePath: toRelativeWorkspacePath(root, targetPath),
    name: basenamePath(targetPath),
    available: true,
    content,
  }
}

export async function createWorkspaceFile({
  workspacePath = '',
  path = '',
  content = '',
  createFile = null,
  openFile = null,
} = {}) {
  const root = getWorkspaceRoot(workspacePath)
  const targetPath = resolveWorkspaceToolPath(path, root, { allowWorkspaceRoot: false })
  const name = basenamePath(targetPath)
  const directoryPath = targetPath.slice(0, targetPath.lastIndexOf('/'))

  if (!name || !directoryPath) {
    throw new Error('A target file path is required.')
  }

  const createdPath = await createFile?.(directoryPath, name, {
    initialContent: String(content || ''),
  })
  if (!createdPath) {
    throw new Error('Failed to create the requested workspace file.')
  }

  await openFile?.(createdPath)

  return {
    path: createdPath,
    relativePath: toRelativeWorkspacePath(root, createdPath),
    name: basenamePath(createdPath),
    created: true,
    opened: true,
  }
}

export async function writeWorkspaceFile({
  workspacePath = '',
  path = '',
  content = '',
  saveFile = null,
  openFile = null,
  openAfterWrite = true,
} = {}) {
  const root = getWorkspaceRoot(workspacePath)
  const targetPath = resolveWorkspaceToolPath(path, root, { allowWorkspaceRoot: false })
  const saved = await saveFile?.(targetPath, String(content || ''))

  if (!saved) {
    throw new Error('Failed to write the requested workspace file.')
  }

  if (openAfterWrite !== false) {
    await openFile?.(targetPath)
  }

  return {
    path: targetPath,
    relativePath: toRelativeWorkspacePath(root, targetPath),
    name: basenamePath(targetPath),
    saved: true,
    opened: openAfterWrite !== false,
  }
}

export async function openWorkspaceFile({
  workspacePath = '',
  path = '',
  openFile = null,
} = {}) {
  const root = getWorkspaceRoot(workspacePath)
  const targetPath = resolveWorkspaceToolPath(path, root, { allowWorkspaceRoot: false })
  await openFile?.(targetPath)

  return {
    path: targetPath,
    relativePath: toRelativeWorkspacePath(root, targetPath),
    name: basenamePath(targetPath),
    opened: true,
  }
}

export async function deleteWorkspacePath({
  workspacePath = '',
  path = '',
  deletePath = null,
} = {}) {
  const root = getWorkspaceRoot(workspacePath)
  const targetPath = resolveWorkspaceToolPath(path, root, { allowWorkspaceRoot: false })
  const deleted = await deletePath?.(targetPath)

  if (!deleted) {
    throw new Error('Failed to delete the requested workspace path.')
  }

  return {
    path: targetPath,
    relativePath: toRelativeWorkspacePath(root, targetPath),
    name: basenamePath(targetPath),
    deleted: true,
  }
}
