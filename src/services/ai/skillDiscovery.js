import { invoke } from '@tauri-apps/api/core'
import { normalizePathValue } from '../workspacePaths.js'

const SKILL_FILE_NAME = 'SKILL.md'
const MAX_SKILL_DESCRIPTION_LENGTH = 220
export const ALLOWED_ALTALS_SKILL_SOURCES = new Set(['altals-global', 'altals-workspace'])
export const ALLOWED_FILESYSTEM_SKILL_SOURCES = new Set([
  'altals-global',
  'altals-workspace',
  'codex-user',
  'codex-workspace',
  'claude-user',
  'claude-workspace',
  'agents-user',
  'agents-workspace',
  'goose-user',
  'goose-workspace',
])
const SUPPORTED_DISCOVERED_SUPPORT_FILE_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.csv',
  '.ts',
  '.js',
  '.mjs',
  '.cjs',
  '.py',
  '.sh',
  '.rs',
])

function trimText(value = '', maxChars = 0) {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  if (!maxChars || normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, maxChars).trimEnd()}…`
}

function normalizeSkillName(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function extname(path = '') {
  const normalized = String(path || '')
  const idx = normalized.lastIndexOf('.')
  return idx >= 0 ? normalized.slice(idx).toLowerCase() : ''
}

function basename(path = '') {
  const normalized = String(path || '').replace(/\/+$/, '')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

function relativePath(root = '', target = '') {
  const normalizedRoot = String(root || '').replace(/\/+$/, '')
  const normalizedTarget = String(target || '')
  if (!normalizedRoot || !normalizedTarget.startsWith(`${normalizedRoot}/`)) return normalizedTarget
  return normalizedTarget.slice(normalizedRoot.length + 1)
}

function isWorkspaceAltalsSkillPath(path = '') {
  const normalized = normalizePathValue(path)
  return normalized.includes('/.altals/skills/')
    || normalized.endsWith('/.altals/skills')
}

function isWorkspaceManagedSkillPath(path = '') {
  const normalized = normalizePathValue(path)
  return [
    '/.altals/skills/',
    '/.codex/skills/',
    '/.claude/skills/',
    '/.agents/skills/',
    '/.goose/skills/',
  ].some((segment) => normalized.includes(segment))
    || [
      '/.altals/skills',
      '/.codex/skills',
      '/.claude/skills',
      '/.agents/skills',
      '/.goose/skills',
    ].some((suffix) => normalized.endsWith(suffix))
}

export function isAltalsManagedFilesystemSkill(skill = {}) {
  if (skill?.kind !== 'filesystem-skill') return false

  const source = String(skill?.source || '').trim()
  if (source && ALLOWED_FILESYSTEM_SKILL_SOURCES.has(source)) {
    return true
  }

  return isWorkspaceManagedSkillPath(skill?.directoryPath || '')
    || isWorkspaceManagedSkillPath(skill?.skillFilePath || '')
}

function isDiscoverableSupportFile(path = '') {
  const name = basename(path)
  if (!name || name === SKILL_FILE_NAME) return false
  return SUPPORTED_DISCOVERED_SUPPORT_FILE_EXTENSIONS.has(extname(path))
}

function getIndentWidth(line = '') {
  const match = String(line || '').match(/^\s*/)
  return match ? match[0].length : 0
}

function normalizeBlockScalarValue(lines = [], style = '|') {
  const normalizedLines = Array.isArray(lines) ? lines : []
  if (style === '|') {
    return normalizedLines.join('\n').trim()
  }

  const paragraphs = []
  let current = []
  for (const line of normalizedLines) {
    if (!String(line || '').trim()) {
      if (current.length > 0) {
        paragraphs.push(current.join(' ').trim())
        current = []
      } else if (paragraphs.length > 0 && paragraphs[paragraphs.length - 1] !== '') {
        paragraphs.push('')
      }
      continue
    }
    current.push(String(line || '').trim())
  }

  if (current.length > 0) {
    paragraphs.push(current.join(' ').trim())
  }

  return paragraphs.join('\n\n').trim()
}

function readBlockScalar(lines = [], startIndex = 0, style = '|') {
  const entries = Array.isArray(lines) ? lines : []
  const collected = []
  let blockIndent = null
  let index = startIndex + 1

  while (index < entries.length) {
    const rawLine = String(entries[index] || '')
    const trimmed = rawLine.trim()

    if (!trimmed) {
      collected.push('')
      index += 1
      continue
    }

    const indent = getIndentWidth(rawLine)
    if (blockIndent == null) {
      if (indent === 0) break
      blockIndent = indent
    }

    if (indent < blockIndent) break

    collected.push(rawLine.slice(blockIndent))
    index += 1
  }

  return {
    value: normalizeBlockScalarValue(collected, style),
    nextIndex: index - 1,
  }
}

function extractFrontmatter(markdown = '') {
  const source = String(markdown || '')
  const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/)
  if (!match) {
    return { frontmatter: {}, body: source.trim() }
  }

  const frontmatter = {}
  const lines = match[1].split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const next = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.+?)\s*$/)
    if (!next) continue
    const key = String(next[1] || '').trim()
    let value = String(next[2] || '').trim()
    if (/^[>|][+-]?$/.test(value)) {
      const block = readBlockScalar(lines, index, value[0])
      frontmatter[key] = block.value
      index = block.nextIndex
      continue
    }
    value = value.replace(/^['"]|['"]$/g, '')
    frontmatter[key] = value
  }

  return {
    frontmatter,
    body: source.slice(match[0].length).trim(),
  }
}

function extractFirstParagraph(markdownBody = '') {
  const normalized = String(markdownBody || '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (!normalized) return ''

  const paragraphs = normalized
    .split(/\n\s*\n/g)
    .map((paragraph) => {
      const trimmed = paragraph.trim()
      const isHeadingOnly = /^#+\s+/.test(trimmed) && !trimmed.includes('\n')
      return {
        text: trimmed.replace(/^#+\s*/, '').trim(),
        isHeadingOnly,
      }
    })
    .filter((paragraph) => paragraph.text && !paragraph.isHeadingOnly)
    .map((paragraph) => paragraph.text)

  return paragraphs[0] || ''
}

export function parseSkillMarkdown(markdown = '', fallbackName = '') {
  const { frontmatter, body } = extractFrontmatter(markdown)
  const name = String(frontmatter.name || fallbackName || '').trim() || 'unnamed-skill'
  const description = trimText(
    String(frontmatter.description || '').trim() || extractFirstParagraph(body),
    MAX_SKILL_DESCRIPTION_LENGTH
  )

  return {
    name,
    slug: normalizeSkillName(name || fallbackName),
    description,
    frontmatter,
    body,
  }
}

export function buildSkillSearchLocations({
  workspacePath = '',
  globalConfigDir = '',
  homeDir = '',
} = {}) {
  const workspace = String(workspacePath || '').trim() ? normalizePathValue(workspacePath) : ''
  const globalConfig = String(globalConfigDir || '').trim() ? normalizePathValue(globalConfigDir) : ''
  const home = String(homeDir || '').trim() ? normalizePathValue(homeDir) : ''

  const locations = [
    home ? { path: `${home}/.claude/skills`, scope: 'user', source: 'claude-user' } : null,
    home ? { path: `${home}/.codex/skills`, scope: 'user', source: 'codex-user' } : null,
    home ? { path: `${home}/.config/agents/skills`, scope: 'user', source: 'agents-user' } : null,
    home ? { path: `${home}/.config/goose/skills`, scope: 'user', source: 'goose-user' } : null,
    globalConfig ? { path: `${globalConfig}/skills`, scope: 'user', source: 'altals-global' } : null,
    workspace ? { path: `${workspace}/.claude/skills`, scope: 'workspace', source: 'claude-workspace' } : null,
    workspace ? { path: `${workspace}/.codex/skills`, scope: 'workspace', source: 'codex-workspace' } : null,
    workspace ? { path: `${workspace}/.agents/skills`, scope: 'workspace', source: 'agents-workspace' } : null,
    workspace ? { path: `${workspace}/.goose/skills`, scope: 'workspace', source: 'goose-workspace' } : null,
    workspace ? { path: `${workspace}/.altals/skills`, scope: 'workspace', source: 'altals-workspace' } : null,
  ].filter(Boolean)

  const deduped = new Set()
  return locations.filter((location) => {
    if (!location.path || deduped.has(location.path)) return false
    deduped.add(location.path)
    return true
  })
}

function buildSkillId(skill = {}) {
  const slug = normalizeSkillName(skill.slug || skill.name || skill.directoryName)
  return `fs-skill:${skill.scope || 'workspace'}:${slug}:${encodeURIComponent(skill.directoryPath || '')}`
}

export function mergeDiscoveredSkills(skills = []) {
  const merged = new Map()
  for (const skill of Array.isArray(skills) ? skills : []) {
    const key = normalizeSkillName(skill.name || skill.slug || skill.directoryName)
    if (!key) continue
    merged.set(key, skill)
  }

  return [...merged.values()].sort((left, right) =>
    String(left.name || '').localeCompare(String(right.name || ''))
  )
}

async function readDirShallow(path = '') {
  try {
    return await invoke('read_dir_shallow', { path })
  } catch {
    return []
  }
}

async function listFilesRecursive(path = '') {
  try {
    return await invoke('list_files_recursive', { path })
  } catch {
    return []
  }
}

async function readFile(path = '') {
  try {
    return await invoke('read_file', { path })
  } catch {
    return ''
  }
}

async function getHomeDir() {
  try {
    return await invoke('get_home_dir')
  } catch {
    return ''
  }
}

async function discoverSkillsInRoot(root = null, precedence = 0) {
  if (!root?.path) return []

  const entries = await readDirShallow(root.path)
  const discovered = []

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry?.is_dir) continue

    const skillPath = `${entry.path}/${SKILL_FILE_NAME}`
    const skillMarkdown = await readFile(skillPath)
    if (!skillMarkdown) continue

    const supportingEntries = await listFilesRecursive(entry.path)
    const supportingFiles = supportingEntries
      .map((item) => item?.path)
      .filter((path) => isDiscoverableSupportFile(path))
      .map((path) => relativePath(entry.path, path))
      .sort((left, right) => left.localeCompare(right))

    const parsed = parseSkillMarkdown(skillMarkdown, entry.name)
    const record = {
      id: '',
      kind: 'filesystem-skill',
      name: parsed.name,
      slug: parsed.slug || normalizeSkillName(entry.name),
      description: parsed.description,
      directoryName: String(entry.name || '').trim(),
      directoryPath: String(entry.path || '').trim(),
      skillFilePath: skillPath,
      markdown: skillMarkdown,
      body: parsed.body,
      frontmatter: parsed.frontmatter,
      scope: root.scope || 'workspace',
      source: root.source || 'unknown',
      sourceRootPath: root.path,
      precedence,
      supportingFiles,
    }
    record.id = buildSkillId(record)
    discovered.push(record)
  }

  return discovered
}

export async function discoverAltalsSkills({
  workspacePath = '',
  globalConfigDir = '',
} = {}) {
  const homeDir = await getHomeDir()
  const roots = buildSkillSearchLocations({
    workspacePath,
    globalConfigDir,
    homeDir,
  })

  const discovered = []
  for (const [index, root] of roots.entries()) {
    const skills = await discoverSkillsInRoot(root, index)
    discovered.push(...skills)
  }

  return mergeDiscoveredSkills(discovered)
}
