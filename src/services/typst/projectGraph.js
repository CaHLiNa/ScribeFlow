import { invoke } from '@tauri-apps/api/core'
import { extractTypstLabelEntries, extractTypstReferenceEntries } from '../../editor/typstDocument.js'
import { readWorkspaceFlatFiles } from '../workspaceSnapshotIO.js'
import { listWorkspaceFlatFilePaths } from '../../domains/files/workspaceSnapshotFlatFilesRuntime.js'
import {
  basenamePath,
  buildContentSignature,
  dirnamePath,
  extnamePath,
  normalizeFsPath,
  relativePathBetween,
  resolveRelativePath,
  sortByOffset,
  uniqueBy,
} from '../documentIntelligence/workspaceGraph.js'

const FILE_RECORD_CACHE = new Map()
const SOURCE_GRAPH_CACHE = new Map()
const ROOT_PATH_CACHE = new Map()
const PREVIEW_PATH_CACHE = new Map()

const IMPORT_RE = /#import\s+"([^"]+)"/g
const INCLUDE_RE = /#include\s+"([^"]+)"/g
const TYPST_TOML_ENTRYPOINT_RE = /^\s*entrypoint\s*=\s*"([^"]+)"/m

function isTypstSourcePath(path = '') {
  return extnamePath(path) === '.typ'
}

function buildPreviewPath(filePath = '') {
  return filePath.replace(/\.typ$/i, '.pdf')
}

function sanitizeTarget(rawValue = '') {
  return String(rawValue || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/\\/g, '/')
}

function isLocalTypstTarget(rawValue = '') {
  const value = sanitizeTarget(rawValue)
  if (!value) return false
  if (value.startsWith('@')) return false
  if (/^[A-Za-z]+:/.test(value)) return false
  return true
}

function candidatePathsFor(baseDir, rawValue = '') {
  const value = sanitizeTarget(rawValue)
  if (!isLocalTypstTarget(value)) return []
  const absolute = resolveRelativePath(baseDir, value)
  if (!absolute) return []
  if (isTypstSourcePath(absolute)) return [absolute]
  return [absolute, `${absolute}.typ`]
}

function resolveExistingPath(candidates = [], availablePaths = new Set()) {
  for (const candidate of candidates) {
    if (availablePaths.has(candidate)) return candidate
  }
  return candidates[0] || ''
}

function parseDependencies(content = '', filePath = '', availablePaths = new Set()) {
  const dependencies = []
  const baseDir = dirnamePath(filePath)

  IMPORT_RE.lastIndex = 0
  let match
  while ((match = IMPORT_RE.exec(content)) !== null) {
    const targetPath = resolveExistingPath(candidatePathsFor(baseDir, match[1]), availablePaths)
    if (!targetPath || !isTypstSourcePath(targetPath)) continue
    dependencies.push({
      kind: 'import',
      filePath,
      targetPath,
      offset: match.index,
      raw: match[1],
    })
  }

  INCLUDE_RE.lastIndex = 0
  while ((match = INCLUDE_RE.exec(content)) !== null) {
    const targetPath = resolveExistingPath(candidatePathsFor(baseDir, match[1]), availablePaths)
    if (!targetPath || !isTypstSourcePath(targetPath)) continue
    dependencies.push({
      kind: 'include',
      filePath,
      targetPath,
      offset: match.index,
      raw: match[1],
    })
  }

  return sortByOffset(uniqueBy(
    dependencies,
    dependency => `${dependency.kind}:${dependency.filePath}:${dependency.targetPath}:${dependency.offset}`,
  ))
}

async function readTextFile(path, options = {}) {
  const normalized = normalizeFsPath(path)
  if (!normalized) return ''
  if (options.contentOverrides && Object.prototype.hasOwnProperty.call(options.contentOverrides, normalized)) {
    return String(options.contentOverrides[normalized] || '')
  }
  const cachedContent = options.filesStore?.fileContents?.[normalized]
  if (cachedContent !== undefined) return String(cachedContent || '')
  return await invoke('read_file', { path: normalized }).catch(() => '')
}

async function listWorkspaceFiles(options = {}) {
  const workspacePath = normalizeFsPath(options.workspacePath || '')
  const filesStore = options.filesStore

  if (Array.isArray(options.flatFiles) && options.flatFiles.length > 0) {
    return options.flatFiles.map(entry => normalizeFsPath(entry.path || entry)).filter(Boolean)
  }

  if (filesStore?.readWorkspaceSnapshot) {
    const snapshot = await filesStore.readWorkspaceSnapshot().catch(() => null)
    const snapshotPaths = listWorkspaceFlatFilePaths(snapshot)
      .map(entry => normalizeFsPath(entry))
      .filter(Boolean)
    if (snapshotPaths.length > 0) {
      return snapshotPaths
    }
  }

  if (filesStore?.ensureFlatFilesReady) {
    const entries = await filesStore.ensureFlatFilesReady().catch(() => [])
    const normalizedEntries = Array.isArray(entries)
      ? entries.map(entry => normalizeFsPath(entry.path || entry)).filter(Boolean)
      : []
    if (normalizedEntries.length > 0) {
      return normalizedEntries
    }
  }

  if (!workspacePath) return [normalizeFsPath(options.sourcePath || '')].filter(Boolean)
  const entries = await readWorkspaceFlatFiles(workspacePath).catch(() => [])
  return Array.isArray(entries)
    ? entries.map(entry => normalizeFsPath(entry.path || entry)).filter(Boolean)
    : []
}

async function parseFileRecord(filePath, options = {}, availablePaths = new Set()) {
  const normalized = normalizeFsPath(filePath)
  const content = await readTextFile(normalized, options)
  const signature = buildContentSignature(content)
  const cached = FILE_RECORD_CACHE.get(normalized)
  if (cached?.signature === signature) return cached.record

  const record = {
    filePath: normalized,
    content,
    signature,
    labels: extractTypstLabelEntries(content).map(entry => ({
      key: entry.key,
      filePath: normalized,
      line: entry.line ?? null,
      offset: entry.offset ?? null,
      from: entry.from ?? null,
      to: entry.to ?? null,
    })),
    references: extractTypstReferenceEntries(content).map(entry => ({
      key: entry.key,
      filePath: normalized,
      line: entry.line ?? null,
      offset: entry.offset ?? null,
    })),
    dependencies: parseDependencies(content, normalized, availablePaths),
  }
  FILE_RECORD_CACHE.set(normalized, { signature, record })
  return record
}

async function parseTypstTomlRecord(filePath, options = {}, availablePaths = new Set()) {
  const normalized = normalizeFsPath(filePath)
  const content = await readTextFile(normalized, options)
  const signature = buildContentSignature(content)
  const entrypointMatch = String(content || '').match(TYPST_TOML_ENTRYPOINT_RE)
  const entrypointPath = entrypointMatch?.[1]
    ? resolveExistingPath(candidatePathsFor(dirnamePath(normalized), entrypointMatch[1]), availablePaths)
    : ''

  return {
    filePath: normalized,
    signature,
    entrypointPath: isTypstSourcePath(entrypointPath) ? entrypointPath : '',
  }
}

function buildReverseDependencyMap(records = new Map()) {
  const reverse = new Map()
  for (const [filePath, record] of records.entries()) {
    for (const dependency of record.dependencies || []) {
      const targetPath = normalizeFsPath(dependency.targetPath)
      if (!targetPath) continue
      if (!reverse.has(targetPath)) reverse.set(targetPath, new Set())
      reverse.get(targetPath).add(filePath)
    }
  }
  return reverse
}

function collectProjectPaths(rootPath, records = new Map(), visited = new Set()) {
  const normalizedRoot = normalizeFsPath(rootPath)
  if (!normalizedRoot || visited.has(normalizedRoot)) return visited
  visited.add(normalizedRoot)
  const record = records.get(normalizedRoot)
  for (const dependency of record?.dependencies || []) {
    collectProjectPaths(dependency.targetPath, records, visited)
  }
  return visited
}

function collectOrderedProjectPaths(rootPath, records = new Map(), ordered = [], visited = new Set()) {
  const normalizedRoot = normalizeFsPath(rootPath)
  if (!normalizedRoot || visited.has(normalizedRoot)) return ordered
  visited.add(normalizedRoot)
  ordered.push(normalizedRoot)
  const record = records.get(normalizedRoot)
  for (const dependency of record?.dependencies || []) {
    collectOrderedProjectPaths(dependency.targetPath, records, ordered, visited)
  }
  return ordered
}

function inferRootCandidates(records = new Map(), reverseDependencies = new Map(), sourcePath = '', configRootPaths = new Map()) {
  const candidates = [...configRootPaths.keys()]
  for (const filePath of records.keys()) {
    if (!reverseDependencies.has(filePath) || reverseDependencies.get(filePath)?.size === 0) {
      candidates.push(filePath)
    }
  }
  if (candidates.length > 0) {
    return uniqueBy(candidates.map(path => normalizeFsPath(path)).filter(Boolean)).sort()
  }
  return [normalizeFsPath(sourcePath)].filter(Boolean)
}

function buildPathDistance(fromFilePath = '', targetPath = '') {
  const relative = relativePathBetween(fromFilePath, targetPath)
  if (!relative) return 0
  return relative.split('/').filter(Boolean).length
}

function buildRootScore(sourcePath = '', rootPath = '', configRootPaths = new Map()) {
  const normalizedSource = normalizeFsPath(sourcePath)
  const normalizedRoot = normalizeFsPath(rootPath)
  const baseName = basenamePath(normalizedRoot).toLowerCase()

  let score = 0
  if (normalizedRoot === normalizedSource) score += 100000
  if (configRootPaths.has(normalizedRoot)) score += 30000
  if (baseName === 'main.typ') score += 12000
  else if (baseName === 'index.typ') score += 8000
  if (dirnamePath(normalizedRoot) === dirnamePath(normalizedSource)) score += 2500
  score += Math.max(0, 4000 - buildPathDistance(normalizedRoot, normalizedSource) * 80)
  return score
}

function chooseRootPath(sourcePath, owningRoots = [], configRootPaths = new Map()) {
  const normalizedSource = normalizeFsPath(sourcePath)
  if (owningRoots.includes(normalizedSource)) return normalizedSource
  if (owningRoots.length === 0) return normalizedSource

  return [...owningRoots].sort((left, right) => {
    const scoreDelta = buildRootScore(normalizedSource, right, configRootPaths)
      - buildRootScore(normalizedSource, left, configRootPaths)
    if (scoreDelta !== 0) return scoreDelta
    return left.localeCompare(right)
  })[0] || normalizedSource
}

function cacheResolvedRoot(sourcePath, rootPath) {
  const normalizedSource = normalizeFsPath(sourcePath)
  const normalizedRoot = normalizeFsPath(rootPath)
  if (!normalizedSource || !normalizedRoot) return
  ROOT_PATH_CACHE.set(normalizedSource, normalizedRoot)
  PREVIEW_PATH_CACHE.set(normalizedSource, buildPreviewPath(normalizedRoot))
}

function cacheResolvedProject(projectPaths = [], rootPath = '') {
  const normalizedRoot = normalizeFsPath(rootPath)
  if (!normalizedRoot) return
  for (const path of uniqueBy([...projectPaths, normalizedRoot].filter(Boolean))) {
    cacheResolvedRoot(path, normalizedRoot)
  }
}

export function getCachedTypstProjectGraph(sourcePath = '') {
  return SOURCE_GRAPH_CACHE.get(normalizeFsPath(sourcePath))?.graph || null
}

export function getCachedTypstRootPath(sourcePath = '') {
  return ROOT_PATH_CACHE.get(normalizeFsPath(sourcePath)) || ''
}

export function getCachedTypstPreviewPath(sourcePath = '') {
  return PREVIEW_PATH_CACHE.get(normalizeFsPath(sourcePath)) || ''
}

export async function resolveTypstProjectGraph(sourcePath, options = {}) {
  const normalizedSource = normalizeFsPath(sourcePath)
  if (!normalizedSource) return null

  const workspaceFiles = await listWorkspaceFiles({
    ...options,
    sourcePath: normalizedSource,
  })
  const typstFiles = uniqueBy(
    [...workspaceFiles.filter(path => isTypstSourcePath(path)), normalizedSource],
    value => normalizeFsPath(value),
  ).sort()
  const typstTomlPaths = uniqueBy(
    workspaceFiles.filter(path => basenamePath(path).toLowerCase() === 'typst.toml'),
    value => normalizeFsPath(value),
  ).sort()
  const availablePaths = new Set(typstFiles)

  const records = new Map()
  for (const filePath of typstFiles) {
    const record = await parseFileRecord(filePath, {
      ...options,
      flatFiles: typstFiles,
    }, availablePaths)
    records.set(filePath, record)
  }
  const configRecords = []
  for (const filePath of typstTomlPaths) {
    configRecords.push(await parseTypstTomlRecord(filePath, options, availablePaths))
  }
  const configRootPaths = new Map(
    configRecords
      .filter(record => record.entrypointPath)
      .map(record => [record.entrypointPath, record.filePath]),
  )

  const workspaceSignature = [
    ...typstFiles.map(filePath => `${filePath}:${records.get(filePath)?.signature || ''}`),
    ...configRecords.map(record => `${record.filePath}:${record.signature}:${record.entrypointPath || ''}`),
  ].join('|')
  const cached = SOURCE_GRAPH_CACHE.get(normalizedSource)
  if (cached?.signature === workspaceSignature) {
    cacheResolvedProject(cached.graph.projectPaths || [normalizedSource], cached.graph.rootPath || normalizedSource)
    return cached.graph
  }

  const reverseDependencies = buildReverseDependencyMap(records)
  const rootCandidates = inferRootCandidates(records, reverseDependencies, normalizedSource, configRootPaths)
  const rootProjects = rootCandidates.map((rootPath) => ({
    rootPath,
    projectPaths: [...collectProjectPaths(rootPath, records)].sort(),
    orderedProjectPaths: collectOrderedProjectPaths(rootPath, records),
  }))
  const owningRoots = rootProjects
    .filter(project => project.projectPaths.includes(normalizedSource))
    .map(project => project.rootPath)
    .sort()
  const rootPath = chooseRootPath(normalizedSource, owningRoots, configRootPaths)
  const activeProject = rootProjects.find(project => project.rootPath === rootPath)

  const graph = {
    sourcePath: normalizedSource,
    rootPath,
    previewPath: buildPreviewPath(rootPath),
    projectPaths: activeProject?.projectPaths || [normalizedSource],
    orderedProjectPaths: activeProject?.orderedProjectPaths || [normalizedSource],
    labels: uniqueBy(
      (activeProject?.orderedProjectPaths || [normalizedSource])
        .flatMap(path => records.get(path)?.labels || []),
      entry => `${entry.filePath}:${entry.key}:${entry.line ?? ''}:${entry.offset ?? ''}`,
    ),
    references: uniqueBy(
      (activeProject?.orderedProjectPaths || [normalizedSource])
        .flatMap(path => records.get(path)?.references || []),
      entry => `${entry.filePath}:${entry.key}:${entry.line ?? ''}:${entry.offset ?? ''}`,
    ),
    dependencies: (records.get(normalizedSource)?.dependencies || []).map(entry => entry.targetPath),
    dependentPaths: [...(reverseDependencies.get(normalizedSource) || [])].sort(),
    owningRoots,
    rootCandidates,
    configRootPaths: [...configRootPaths.keys()].sort(),
    configRootMap: configRootPaths,
    records,
  }

  SOURCE_GRAPH_CACHE.set(normalizedSource, { signature: workspaceSignature, graph })
  cacheResolvedProject(graph.projectPaths, rootPath)
  return graph
}

export async function resolveTypstAffectedRootTargets(changedPath, options = {}) {
  const normalizedChangedPath = normalizeFsPath(changedPath)
  if (!normalizedChangedPath || !isTypstSourcePath(normalizedChangedPath)) return []

  const workspaceFiles = await listWorkspaceFiles({
    ...options,
    sourcePath: normalizedChangedPath,
  })
  const typstFiles = uniqueBy(
    [...workspaceFiles.filter(path => isTypstSourcePath(path)), normalizedChangedPath],
    value => normalizeFsPath(value),
  ).sort()

  const affectedRoots = new Map()
  for (const filePath of typstFiles) {
    const graph = await resolveTypstProjectGraph(filePath, {
      ...options,
      flatFiles: workspaceFiles,
    }).catch(() => null)
    if (!graph?.rootPath) continue
    if (!graph.projectPaths?.includes(normalizedChangedPath)) continue

    if (!affectedRoots.has(graph.rootPath)) {
      affectedRoots.set(graph.rootPath, {
        sourcePath: graph.rootPath,
        rootPath: graph.rootPath,
        previewPath: graph.previewPath || buildPreviewPath(graph.rootPath),
      })
    }
  }

  if (affectedRoots.size === 0) {
    return [{
      sourcePath: normalizedChangedPath,
      rootPath: normalizedChangedPath,
      previewPath: buildPreviewPath(normalizedChangedPath),
    }]
  }

  return [...affectedRoots.values()]
}
