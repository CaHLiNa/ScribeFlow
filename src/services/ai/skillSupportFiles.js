import { invoke } from '@tauri-apps/api/core'

const MAX_SUPPORT_FILE_COUNT = 12
const MAX_SUPPORT_FILE_BYTES = 12_000
const SUPPORTED_SUPPORT_FILE_EXTENSIONS = new Set([
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

export function isSupportedSkillSupportFile(path = '') {
  const name = basename(path)
  if (!name || name === 'SKILL.md') return false
  return SUPPORTED_SUPPORT_FILE_EXTENSIONS.has(extname(path))
}

async function readDirShallow(path = '') {
  try {
    return await invoke('read_dir_shallow', { path })
  } catch {
    return []
  }
}

async function readTextFile(path = '') {
  try {
    return await invoke('read_file', { path, maxBytes: MAX_SUPPORT_FILE_BYTES })
  } catch {
    return ''
  }
}

async function walkSkillDirectory(rootPath = '', currentPath = '', collected = []) {
  if (collected.length >= MAX_SUPPORT_FILE_COUNT) return collected

  const entries = await readDirShallow(currentPath)
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (collected.length >= MAX_SUPPORT_FILE_COUNT) break

    if (entry?.is_dir) {
      if (String(entry.name || '').startsWith('.')) continue
      await walkSkillDirectory(rootPath, entry.path, collected)
      continue
    }

    if (!isSupportedSkillSupportFile(entry.path)) continue

    const content = await readTextFile(entry.path)
    if (!content) continue

    collected.push({
      path: entry.path,
      relativePath: relativePath(rootPath, entry.path),
      content: String(content || '').trim(),
    })
  }

  return collected
}

export async function loadSkillSupportingFiles(skill = null) {
  const rootPath = String(skill?.directoryPath || '').trim()
  if (!rootPath) return []
  return walkSkillDirectory(rootPath, rootPath, [])
}

export function buildSkillSupportPromptBlock(files = []) {
  const normalized = Array.isArray(files) ? files.filter(Boolean) : []
  if (normalized.length === 0) {
    return 'Skill support files loaded: none.'
  }

  return [
    'Skill support files loaded from the skill directory:',
    ...normalized.flatMap((file) => [
      `- ${file.relativePath}`,
      '```text',
      file.content,
      '```',
    ]),
  ].join('\n')
}
