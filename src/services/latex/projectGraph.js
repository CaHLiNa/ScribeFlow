import { invoke } from '@tauri-apps/api/core'
import { readWorkspaceFlatFiles } from '../workspaceSnapshotIO.js'
import { listWorkspaceFlatFilePaths } from '../../domains/files/workspaceSnapshotFlatFilesRuntime.js'
import { parseBibtex } from '../../utils/bibtexParser.js'
import {
  basenamePath,
  buildContentSignature,
  dirnamePath,
  extnamePath,
  normalizeFsPath,
  relativePathBetween,
  resolveRelativePath,
  sortByOffset,
  stripExtension,
  uniqueBy,
} from '../documentIntelligence/workspaceGraph.js'

const FILE_RECORD_CACHE = new Map()
const SOURCE_GRAPH_CACHE = new Map()

const SECTION_LEVELS = {
  part: 1,
  chapter: 2,
  section: 3,
  subsection: 4,
  subsubsection: 5,
  paragraph: 6,
}

const INCLUDE_COMMANDS = ['input', 'include', 'subfile', 'InputIfFileExists', 'loadglsentries', 'markdownInput']
const IMPORT_COMMANDS = ['import', 'inputfrom', 'includefrom', 'subimport', 'subinputfrom', 'subincludefrom']
const CITATION_COMMAND_RE = /\\(?:[A-Za-z]*cite[A-Za-z]*|nocite)\*?(?:\[[^\]]*\])?(?:\[[^\]]*\])?\{([^}]*)\}/g
const LABEL_RE = /\\label(?:\[[^\]]*\])?\{([^}]+)\}/g
const SECTION_RE = /\\(part|chapter|section|subsection|subsubsection|paragraph)\*?(?:\[[^\]]*\])?\{([^}]*)\}/g
const INCLUDE_RE = /\\(input|include|subfile|InputIfFileExists|loadglsentries|markdownInput)\{([^}]+)\}/g
const IMPORT_RE = /\\(import|inputfrom|includefrom|subimport|subinputfrom|subincludefrom)\{([^}]+)\}\{([^}]+)\}/g
const ADD_BIB_RESOURCE_RE = /\\addbibresource(?:\[[^\]]*\])?\{([^}]+)\}/g
const BIBLIOGRAPHY_RE = /\\bibliography\{([^}]+)\}/g
const THEBIBLIOGRAPHY_RE = /\\begin\{thebibliography\}(?:\[[^\]]*\])?\{[^}]*\}/g
const MAGIC_ROOT_RE = /^[ \t]*%\s*!TEX\s+root\s*=\s*(.+)$/im
const APPENDIX_RE = /\\appendix\b/g
const FLOAT_ENV_RE = /\\begin\{(figure|table)\*?\}([\s\S]*?)\\end\{\1\*?\}/g
const CAPTION_RE = /\\caption(?:\[[^\]]*\])?\{([^}]*)\}/g

function normalizeTitle(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildLineOffsets(text = '') {
  const offsets = [0]
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') offsets.push(index + 1)
  }
  return offsets
}

function offsetToLine(lineOffsets = [], offset = 0) {
  if (!Array.isArray(lineOffsets) || lineOffsets.length === 0) return 1
  let low = 0
  let high = lineOffsets.length - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (lineOffsets[mid] <= offset) low = mid + 1
    else high = mid - 1
  }
  return Math.max(1, high + 1)
}

function hasRootIndicator(content = '') {
  return /\\documentclass(?:\s*\[[^\]]*\])?\s*\{[^}]+\}/.test(content)
    || /\\begin\s*\{document\}/.test(content)
}

function sanitizeArgument(value = '') {
  return String(value || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/^\.\/+/, '')
    .replace(/\\/g, '/')
}

function stripTexQuotes(value = '') {
  return sanitizeArgument(value)
    .replace(/^\{+|\}+$/g, '')
    .trim()
}

function hasKnownExtension(path = '') {
  return ['.tex', '.latex', '.bib'].includes(extnamePath(path))
}

function isLatexSourcePath(path = '') {
  return ['.tex', '.latex'].includes(extnamePath(path))
}

function isBibliographyPath(path = '') {
  return extnamePath(path) === '.bib'
}

function candidatePathsFor(baseDir, rawPath, extensions = []) {
  const cleaned = stripTexQuotes(rawPath)
  if (!cleaned) return []
  const absolute = resolveRelativePath(baseDir, cleaned)
  if (hasKnownExtension(absolute) || extensions.length === 0) {
    return [absolute]
  }
  return [absolute, ...extensions.map(extension => `${absolute}${extension}`)]
}

function resolveExistingPath(candidates = [], availablePaths = new Set()) {
  for (const candidate of candidates) {
    if (availablePaths.has(candidate)) return candidate
  }
  return candidates[0] || ''
}

function parseBibliographyTargets(rawValue = '', filePath = '', availablePaths = new Set()) {
  const baseDir = dirnamePath(filePath)
  return String(rawValue || '')
    .split(',')
    .map(part => stripTexQuotes(part))
    .filter(Boolean)
    .map(part => resolveExistingPath(candidatePathsFor(baseDir, part, ['.bib']), availablePaths))
}

function parseMagicRoot(content = '', filePath = '', availablePaths = new Set()) {
  const match = content.match(MAGIC_ROOT_RE)
  if (!match?.[1]) return ''
  return resolveExistingPath(
    candidatePathsFor(dirnamePath(filePath), match[1], ['.tex', '.latex']),
    availablePaths,
  )
}

function parseSections(content = '', filePath = '') {
  const sections = []
  const lineOffsets = buildLineOffsets(content)
  SECTION_RE.lastIndex = 0
  let match
  while ((match = SECTION_RE.exec(content)) !== null) {
    sections.push({
      filePath,
      kind: match[1],
      text: normalizeTitle(match[2]),
      level: SECTION_LEVELS[match[1]] || 3,
      offset: match.index,
      line: offsetToLine(lineOffsets, match.index),
    })
  }
  return sections
}

function parseLabels(content = '', filePath = '') {
  const labels = []
  const lineOffsets = buildLineOffsets(content)
  LABEL_RE.lastIndex = 0
  let match
  while ((match = LABEL_RE.exec(content)) !== null) {
    labels.push({
      key: stripTexQuotes(match[1]),
      filePath,
      offset: match.index,
      line: offsetToLine(lineOffsets, match.index),
    })
  }
  return labels.filter(label => label.key)
}

function parseCitations(content = '', filePath = '') {
  const citations = []
  const lineOffsets = buildLineOffsets(content)
  CITATION_COMMAND_RE.lastIndex = 0
  let match
  while ((match = CITATION_COMMAND_RE.exec(content)) !== null) {
    const keys = String(match[1] || '')
      .split(',')
      .map(part => stripTexQuotes(part))
      .filter(Boolean)
    for (const key of keys) {
      citations.push({
        key,
        filePath,
        offset: match.index,
        line: offsetToLine(lineOffsets, match.index),
      })
    }
  }
  return citations
}

function parseIncludes(content = '', filePath = '', availablePaths = new Set()) {
  const includes = []

  INCLUDE_RE.lastIndex = 0
  let match
  while ((match = INCLUDE_RE.exec(content)) !== null) {
    const target = resolveExistingPath(
      candidatePathsFor(dirnamePath(filePath), match[2], ['.tex', '.latex']),
      availablePaths,
    )
    if (!target) continue
    includes.push({
      command: match[1],
      filePath,
      targetPath: target,
      offset: match.index,
      raw: match[2],
    })
  }

  IMPORT_RE.lastIndex = 0
  while ((match = IMPORT_RE.exec(content)) !== null) {
    const importDir = resolveRelativePath(dirnamePath(filePath), match[2])
    const target = resolveExistingPath(
      candidatePathsFor(importDir, match[3], ['.tex', '.latex']),
      availablePaths,
    )
    if (!target) continue
    includes.push({
      command: match[1],
      filePath,
      targetPath: target,
      offset: match.index,
      raw: `${match[2]}::${match[3]}`,
    })
  }

  return sortByOffset(includes)
}

function parseBibliographyFiles(content = '', filePath = '', availablePaths = new Set()) {
  const files = []

  ADD_BIB_RESOURCE_RE.lastIndex = 0
  let match
  while ((match = ADD_BIB_RESOURCE_RE.exec(content)) !== null) {
    const target = resolveExistingPath(
      candidatePathsFor(dirnamePath(filePath), match[1], ['.bib']),
      availablePaths,
    )
    if (target) files.push(target)
  }

  BIBLIOGRAPHY_RE.lastIndex = 0
  while ((match = BIBLIOGRAPHY_RE.exec(content)) !== null) {
    files.push(...parseBibliographyTargets(match[1], filePath, availablePaths))
  }

  return uniqueBy(files.filter(Boolean))
}

function parseBibliographyOutlineItems(content = '', filePath = '') {
  const items = []
  const lineOffsets = buildLineOffsets(content)

  THEBIBLIOGRAPHY_RE.lastIndex = 0
  let match
  while ((match = THEBIBLIOGRAPHY_RE.exec(content)) !== null) {
    items.push({
      filePath,
      text: 'Bibliography',
      offset: match.index,
      line: offsetToLine(lineOffsets, match.index),
    })
  }

  return items
}

function parseAppendices(content = '', filePath = '') {
  const appendices = []
  const lineOffsets = buildLineOffsets(content)
  APPENDIX_RE.lastIndex = 0
  let match
  while ((match = APPENDIX_RE.exec(content)) !== null) {
    appendices.push({
      filePath,
      offset: match.index,
      line: offsetToLine(lineOffsets, match.index),
      text: 'Appendix',
    })
  }
  return appendices
}

function parseFloats(content = '', filePath = '') {
  const floats = []
  const lineOffsets = buildLineOffsets(content)
  FLOAT_ENV_RE.lastIndex = 0
  let match
  while ((match = FLOAT_ENV_RE.exec(content)) !== null) {
    const kind = match[1]
    const body = match[2] || ''
    CAPTION_RE.lastIndex = 0
    const captionMatch = CAPTION_RE.exec(body)
    const caption = normalizeTitle(captionMatch?.[1] || '')
    if (!caption) continue

    LABEL_RE.lastIndex = 0
    const labelMatch = LABEL_RE.exec(body)
    const label = stripTexQuotes(labelMatch?.[1] || '')

    floats.push({
      filePath,
      kind,
      caption,
      label,
      offset: match.index,
      line: offsetToLine(lineOffsets, match.index),
    })
  }
  return floats
}

async function readTextFile(filePath, options = {}) {
  const normalized = normalizeFsPath(filePath)
  const overrideContent = options.contentOverrides?.[normalized]
  if (overrideContent !== undefined) return String(overrideContent || '')
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
    magicRootPath: parseMagicRoot(content, normalized, availablePaths),
    isRootLike: hasRootIndicator(content),
    sections: parseSections(content, normalized),
    appendices: parseAppendices(content, normalized),
    floats: parseFloats(content, normalized),
    bibliographyOutlineItems: parseBibliographyOutlineItems(content, normalized),
    labels: parseLabels(content, normalized),
    citations: parseCitations(content, normalized),
    includes: parseIncludes(content, normalized, availablePaths),
    bibliographyFiles: parseBibliographyFiles(content, normalized, availablePaths),
  }

  FILE_RECORD_CACHE.set(normalized, { signature, record })
  return record
}

function buildReverseIncludeMap(records = new Map()) {
  const reverse = new Map()
  for (const [filePath, record] of records.entries()) {
    for (const include of record.includes || []) {
      const target = normalizeFsPath(include.targetPath)
      if (!target) continue
      if (!reverse.has(target)) reverse.set(target, new Set())
      reverse.get(target).add(filePath)
    }
  }
  return reverse
}

function resolveMagicRoot(sourcePath, records = new Map()) {
  const visited = new Set()
  let current = normalizeFsPath(sourcePath)

  while (current && !visited.has(current)) {
    visited.add(current)
    const next = normalizeFsPath(records.get(current)?.magicRootPath || '')
    if (!next || next === current) break
    current = next
  }

  return current
}

function inferRootPathFromIncludes(sourcePath, records = new Map()) {
  const normalizedSource = normalizeFsPath(sourcePath)
  const reverse = buildReverseIncludeMap(records)
  const queue = [{ path: normalizedSource, distance: 0 }]
  const visited = new Set()
  const candidates = []

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current?.path || visited.has(current.path)) continue
    visited.add(current.path)

    const record = records.get(current.path)
    if (record?.isRootLike) {
      candidates.push({
        path: current.path,
        distance: current.distance,
      })
    }

    const parents = reverse.get(current.path)
    if (!parents) continue
    for (const parent of parents) {
      queue.push({ path: parent, distance: current.distance + 1 })
    }
  }

  if (candidates.length === 0) return normalizedSource
  candidates.sort((left, right) => {
    if (left.distance !== right.distance) return right.distance - left.distance
    const leftName = basenamePath(left.path)
    const rightName = basenamePath(right.path)
    const leftMain = /(^|[._-])main\.(tex|latex)$/i.test(leftName) ? 1 : 0
    const rightMain = /(^|[._-])main\.(tex|latex)$/i.test(rightName) ? 1 : 0
    if (leftMain !== rightMain) return rightMain - leftMain
    return left.path.localeCompare(right.path)
  })
  return candidates[0]?.path || normalizedSource
}

function collectProjectPaths(rootPath, records = new Map()) {
  const visited = new Set()
  const walk = (filePath) => {
    const normalized = normalizeFsPath(filePath)
    if (!normalized || visited.has(normalized)) return
    visited.add(normalized)
    const record = records.get(normalized)
    for (const include of record?.includes || []) {
      walk(include.targetPath)
    }
  }
  walk(rootPath)
  return visited
}

function buildOutlineItems(rootPath, projectPaths = new Set(), records = new Map()) {
  const items = []
  const stack = new Set()
  const visited = new Set()
  let order = 0
  const headingBaseLevel = Math.min(
    ...Array.from(projectPaths)
      .flatMap(path => (records.get(path)?.sections || []).map(section => section.level))
      .filter(level => Number.isFinite(level) && level > 0),
  )
  const normalizedHeadingBaseLevel = Number.isFinite(headingBaseLevel) ? headingBaseLevel : 1

  const walk = (filePath) => {
    const normalized = normalizeFsPath(filePath)
    if (!normalized || stack.has(normalized)) return
    const record = records.get(normalized)
    if (!record) return

    stack.add(normalized)
    const nodes = [
      ...(record.appendices || []).map(appendix => ({ type: 'appendix', ...appendix })),
      ...record.sections.map(section => ({ type: 'section', ...section })),
      ...(record.floats || []).map(float => ({ type: 'float', ...float })),
      ...(record.bibliographyOutlineItems || []).map(item => ({ type: 'bibliography', ...item })),
      ...record.includes.map(include => ({ type: 'include', ...include })),
    ].sort((left, right) => (left.offset || 0) - (right.offset || 0))

    for (const node of nodes) {
      if (node.type === 'appendix') {
        items.push({
          kind: 'appendix',
          text: node.text,
          level: 1,
          displayLevel: 1,
          offset: node.offset,
          order: order++,
          filePath: normalized,
          line: node.line,
        })
      } else if (node.type === 'section') {
        items.push({
          kind: 'heading',
          text: node.text,
          level: node.level,
          displayLevel: Math.max(1, node.level - normalizedHeadingBaseLevel + 1),
          offset: node.offset,
          order: order++,
          filePath: normalized,
          line: node.line,
        })
      } else if (node.type === 'float') {
        items.push({
          kind: node.kind,
          text: node.label || node.caption,
          level: 1,
          displayLevel: 1,
          offset: node.offset,
          order: order++,
          filePath: normalized,
          line: node.line,
        })
      } else if (node.type === 'bibliography') {
        items.push({
          kind: 'bibliography',
          text: node.text || 'Bibliography',
          level: 1,
          displayLevel: 1,
          offset: node.offset,
          order: order++,
          filePath: normalized,
          line: node.line,
        })
      } else if (node.type === 'include') {
        const target = normalizeFsPath(node.targetPath)
        if (!target || !projectPaths.has(target) || visited.has(target)) continue
        visited.add(target)
        walk(target)
      }
    }

    stack.delete(normalized)
  }

  visited.add(normalizeFsPath(rootPath))
  walk(rootPath)
  return items
}

async function loadBibKeys(bibliographyFiles = [], options = {}) {
  const keys = []

  for (const bibPath of uniqueBy(bibliographyFiles.filter(Boolean))) {
    const content = await readTextFile(bibPath, options)
    if (!content) continue
    for (const entry of parseBibtex(content)) {
      if (entry?._key) keys.push(entry._key)
    }
  }

  if (keys.length === 0 && options.referencesStore?.allKeys) {
    keys.push(...options.referencesStore.allKeys)
  }

  return uniqueBy(keys)
}

function buildPreviewPath(rootPath = '') {
  const stripped = stripExtension(rootPath)
  return stripped ? `${stripped}.pdf` : ''
}

export function getCachedLatexProjectGraph(sourcePath = '') {
  return SOURCE_GRAPH_CACHE.get(normalizeFsPath(sourcePath)) || null
}

export function getCachedLatexRootPath(sourcePath = '') {
  return getCachedLatexProjectGraph(sourcePath)?.rootPath || normalizeFsPath(sourcePath)
}

export function getCachedLatexPreviewPath(sourcePath = '') {
  return getCachedLatexProjectGraph(sourcePath)?.previewPath || `${stripExtension(sourcePath)}.pdf`
}

export async function resolveLatexProjectGraph(sourcePath, options = {}) {
  const normalizedSource = normalizeFsPath(sourcePath)
  if (!normalizedSource) return null

  const workspaceFiles = await listWorkspaceFiles({
    ...options,
    sourcePath: normalizedSource,
  })
  const availablePaths = new Set(
    workspaceFiles.filter(path => ['.tex', '.latex', '.bib'].includes(extnamePath(path))),
  )
  availablePaths.add(normalizedSource)

  const latexFiles = [...availablePaths].filter(path => ['.tex', '.latex'].includes(extnamePath(path)))
  const records = new Map()
  for (const filePath of latexFiles) {
    records.set(filePath, await parseFileRecord(filePath, options, availablePaths))
  }

  const magicRootPath = resolveMagicRoot(normalizedSource, records)
  const rootPath = magicRootPath && magicRootPath !== normalizedSource
    ? magicRootPath
    : inferRootPathFromIncludes(normalizedSource, records)
  const projectPaths = collectProjectPaths(rootPath, records)

  const bibliographyFiles = uniqueBy(
    [
      ...Array.from(projectPaths).flatMap(path => records.get(path)?.bibliographyFiles || []),
      ...(records.get(normalizedSource)?.bibliographyFiles || []),
    ].filter(Boolean),
  )
  const bibKeys = await loadBibKeys(bibliographyFiles, options)

  const labels = uniqueBy(
    Array.from(projectPaths).flatMap(path => records.get(path)?.labels || []),
    label => `${label.filePath}:${label.key}:${label.offset}`,
  )
  const citations = uniqueBy(
    Array.from(projectPaths).flatMap(path => records.get(path)?.citations || []),
    citation => `${citation.filePath}:${citation.key}:${citation.offset}`,
  )
  const outlineItems = buildOutlineItems(rootPath, projectPaths, records)

  const graph = {
    sourcePath: normalizedSource,
    rootPath,
    previewPath: buildPreviewPath(rootPath),
    projectPaths: [...projectPaths],
    bibliographyFiles,
    bibKeys,
    labels,
    citations,
    outlineItems,
    records,
  }

  SOURCE_GRAPH_CACHE.set(normalizedSource, graph)
  return graph
}

export async function resolveLatexProjectContext(sourcePath, options = {}) {
  const graph = await resolveLatexProjectGraph(sourcePath, options)
  if (!graph) return null

  const labelKeys = new Set(graph.labels.map(label => label.key))
  const citationKeys = new Set(graph.bibKeys)
  const unresolvedCitations = uniqueBy(
    graph.citations.filter(citation => citation.key && !citationKeys.has(citation.key)),
    entry => `${entry.filePath}:${entry.key}:${entry.line}`,
  )
  const unresolvedRefs = []

  for (const path of graph.projectPaths) {
    const content = graph.records.get(path)?.content || ''
    const lineOffsets = buildLineOffsets(content)
    const refRe = /\\(?:ref|eqref|pageref|autoref|cref|Cref)\{([^}]+)\}/g
    refRe.lastIndex = 0
    let match
    while ((match = refRe.exec(content)) !== null) {
      const key = stripTexQuotes(match[1])
      if (!key || labelKeys.has(key)) continue
      unresolvedRefs.push({
        key,
        filePath: path,
        offset: match.index,
        line: offsetToLine(lineOffsets, match.index),
      })
    }
  }

  return {
    ...graph,
    unresolvedRefs: uniqueBy(unresolvedRefs, entry => `${entry.filePath}:${entry.key}:${entry.line}`),
    unresolvedCitations,
  }
}

export function buildRelativeLatexInputPath(fromFilePath, targetPath) {
  const relative = relativePathBetween(fromFilePath, targetPath)
  return stripExtension(relative)
}

export async function resolveLatexAffectedRootTargets(changedPath, options = {}) {
  const normalizedChangedPath = normalizeFsPath(changedPath)
  if (!normalizedChangedPath) return []
  if (!isLatexSourcePath(normalizedChangedPath) && !isBibliographyPath(normalizedChangedPath)) {
    return []
  }

  const workspaceFiles = await listWorkspaceFiles({
    ...options,
    sourcePath: normalizedChangedPath,
  })
  const latexFiles = workspaceFiles.filter(path => isLatexSourcePath(path))
  const graphOptions = {
    ...options,
    flatFiles: workspaceFiles,
  }

  const affectedRoots = new Map()
  for (const filePath of latexFiles) {
    const graph = await resolveLatexProjectGraph(filePath, graphOptions).catch(() => null)
    if (!graph?.rootPath) continue

    const touchesSource = graph.projectPaths?.includes(normalizedChangedPath)
    const touchesBibliography = graph.bibliographyFiles?.includes(normalizedChangedPath)
    if (!touchesSource && !touchesBibliography) continue

    if (!affectedRoots.has(graph.rootPath)) {
      affectedRoots.set(graph.rootPath, {
        sourcePath: graph.rootPath,
        rootPath: graph.rootPath,
        previewPath: graph.previewPath || buildPreviewPath(graph.rootPath),
      })
    }
  }

  return [...affectedRoots.values()]
}
