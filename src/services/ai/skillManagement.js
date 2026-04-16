import { invoke } from '@tauri-apps/api/core'
import { t } from '../../i18n/index.js'
import { normalizePathValue } from '../workspacePaths.js'
import { buildSkillSearchLocations, parseSkillMarkdown } from './skillDiscovery.js'

function slugifySkillName(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function skillMarkdownFromFields({
  name = '',
  description = '',
  body = '',
  frontmatter = {},
} = {}) {
  const normalizedName = String(name || '').trim()
  const normalizedDescription = String(description || '').trim()
  const normalizedBody = String(body || '').trim()
  const mergedFrontmatter = {
    ...frontmatter,
    name: normalizedName,
  }

  if (normalizedDescription) {
    mergedFrontmatter.description = normalizedDescription
  } else {
    delete mergedFrontmatter.description
  }

  const orderedEntries = [
    ['name', mergedFrontmatter.name],
    ['description', mergedFrontmatter.description],
    ...Object.entries(mergedFrontmatter).filter(([key]) => key !== 'name' && key !== 'description'),
  ].filter(([, value]) => String(value ?? '').trim())

  return [
    '---',
    ...orderedEntries.map(([key, value]) => `${key}: ${stringifyFrontmatterValue(value)}`),
    '---',
    '',
    normalizedBody || `# ${normalizedName}\n\nDescribe how this skill should be used.`,
    '',
  ].join('\n')
}

function stringifyFrontmatterValue(value = '') {
  const normalized = String(value ?? '').trim()
  if (!normalized) return '""'
  if (/[:#\n\r\t"'[\]{}]|^\s|\s$/.test(normalized)) {
    return JSON.stringify(normalized)
  }
  return normalized
}

export function rewriteSkillMarkdown(
  markdown = '',
  {
    nextName = '',
    nextDescription,
    nextBody = '',
  } = {}
) {
  const source = String(markdown || '').trim()
  const frontmatterMatch = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/)
  const frontmatterLines = frontmatterMatch ? frontmatterMatch[1].split('\n') : []
  const existingBody = frontmatterMatch ? source.slice(frontmatterMatch[0].length).trim() : source
  const body = String(nextBody ?? existingBody).trim()

  const upsertFrontmatterLine = (key = '', value) => {
    const pattern = new RegExp(`^\\s*${key}\\s*:`)
    const existingIndex = frontmatterLines.findIndex((line) => pattern.test(line))
    const normalizedValue = value == null ? undefined : String(value || '').trim()

    if (!normalizedValue) {
      if (existingIndex >= 0) {
        frontmatterLines.splice(existingIndex, 1)
      }
      return
    }

    const nextLine = `${key}: ${stringifyFrontmatterValue(normalizedValue)}`
    if (existingIndex >= 0) {
      frontmatterLines.splice(existingIndex, 1, nextLine)
      return
    }

    if (key === 'name') {
      frontmatterLines.unshift(nextLine)
      return
    }

    if (key === 'description') {
      const nameIndex = frontmatterLines.findIndex((line) => /^\s*name\s*:/.test(line))
      if (nameIndex >= 0) {
        frontmatterLines.splice(nameIndex + 1, 0, nextLine)
        return
      }
    }

    frontmatterLines.push(nextLine)
  }

  upsertFrontmatterLine('name', nextName)
  if (nextDescription !== undefined) {
    upsertFrontmatterLine('description', nextDescription)
  }

  return [
    '---',
    ...frontmatterLines.filter((line) => String(line || '').trim()),
    '---',
    '',
    body || `# ${String(nextName || 'unnamed-skill').trim()}\n\nDescribe how this skill should be used.`,
    '',
  ].join('\n')
}

function getDirectoryName(path = '') {
  const normalized = String(path || '').replace(/\/+$/, '')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

async function pathExists(path = '') {
  try {
    return await invoke('path_exists', { path })
  } catch {
    return false
  }
}

async function readFile(path = '') {
  try {
    return await invoke('read_file', { path })
  } catch {
    return ''
  }
}

function resolveUniqueDuplicateDirectory(baseDir = '', existingPaths = new Set()) {
  if (!existingPaths.has(baseDir)) return baseDir
  let counter = 2
  while (existingPaths.has(`${baseDir}-copy-${counter}`)) {
    counter += 1
  }
  return `${baseDir}-copy-${counter}`
}

export async function resolveManagedSkillRoots({ workspacePath = '', globalConfigDir = '' } = {}) {
  const workspace = String(workspacePath || '').trim() ? normalizePathValue(workspacePath) : ''
  const user = String(globalConfigDir || '').trim()
    ? `${normalizePathValue(globalConfigDir)}/skills`
    : ''

  return {
    workspace: workspace ? `${workspace}/.altals/skills` : '',
    user,
  }
}

export async function resolveWritableSkillRoots({ workspacePath = '', globalConfigDir = '' } = {}) {
  return buildSkillSearchLocations({
    workspacePath,
    globalConfigDir,
  }).map((entry) => String(entry.path || '').trim()).filter(Boolean)
}

export function isManagedSkill(skill = {}, managedRoots = {}) {
  const directoryPath = String(skill?.directoryPath || '').trim()
  if (!directoryPath) return false
  return ['workspace', 'user'].some((scope) => {
    const root = String(managedRoots[scope] || '').trim()
    return root && (directoryPath === root || directoryPath.startsWith(`${root}/`))
  })
}

export function isWritableSkill(skill = {}, writableRoots = []) {
  const directoryPath = String(skill?.directoryPath || '').trim()
  if (!directoryPath) return false

  return (Array.isArray(writableRoots) ? writableRoots : [])
    .map((root) => String(root || '').trim())
    .filter(Boolean)
    .some((root) => directoryPath === root || directoryPath.startsWith(`${root}/`))
}

export async function createManagedSkill({
  workspacePath = '',
  globalConfigDir = '',
  scope = 'workspace',
  name = '',
  description = '',
  body = '',
} = {}) {
  const roots = await resolveManagedSkillRoots({ workspacePath, globalConfigDir })
  const targetRoot = String(roots[scope] || '').trim()
  if (!targetRoot) {
    throw new Error(t('Managed skill scope is not available: {scope}', { scope }))
  }

  const slug = slugifySkillName(name)
  if (!slug) {
    throw new Error(t('Skill name is required.'))
  }

  const targetDir = `${targetRoot}/${slug}`
  if (await pathExists(targetDir)) {
    throw new Error(t('Skill already exists: {name}', { name: slug }))
  }

  await invoke('create_dir', { path: targetDir })
  await invoke('write_file', {
    path: `${targetDir}/SKILL.md`,
    content: skillMarkdownFromFields({ name: slug, description, body }),
  })

  return targetDir
}

export async function importManagedSkill({
  workspacePath = '',
  globalConfigDir = '',
  scope = 'workspace',
  sourcePath = '',
} = {}) {
  const source = String(sourcePath || '').trim()
  if (!source) {
    throw new Error(t('Source skill path is required.'))
  }

  const roots = await resolveManagedSkillRoots({ workspacePath, globalConfigDir })
  const targetRoot = String(roots[scope] || '').trim()
  if (!targetRoot) {
    throw new Error(t('Managed skill scope is not available: {scope}', { scope }))
  }

  const isDir = await invoke('is_directory', { path: source })
  if (isDir) {
    const skillFile = `${source.replace(/\/+$/, '')}/SKILL.md`
    const content = await readFile(skillFile)
    if (!content) {
      throw new Error(t('Selected directory does not contain SKILL.md.'))
    }

    const parsed = parseSkillMarkdown(content)
    const slug = slugifySkillName(parsed.name || source.split('/').pop() || '')
    const targetDir = `${targetRoot}/${slug}`
    if (await pathExists(targetDir)) {
      throw new Error(t('Skill already exists: {name}', { name: slug }))
    }
    await invoke('copy_dir', { src: source, dest: targetDir })
    return targetDir
  }

  const content = await readFile(source)
  if (!content) {
    throw new Error(t('Selected file could not be read as a skill.'))
  }
  const parsed = parseSkillMarkdown(content)
  const slug = slugifySkillName(parsed.name || source.split('/').slice(-2, -1)[0] || '')
  const targetDir = `${targetRoot}/${slug}`
  if (await pathExists(targetDir)) {
    throw new Error(t('Skill already exists: {name}', { name: slug }))
  }
  await invoke('create_dir', { path: targetDir })
  await invoke('copy_file', { src: source, dest: `${targetDir}/SKILL.md` })
  return targetDir
}

export async function deleteManagedSkill({
  workspacePath = '',
  globalConfigDir = '',
  skill = null,
} = {}) {
  const roots = await resolveManagedSkillRoots({ workspacePath, globalConfigDir })
  if (!isManagedSkill(skill, roots)) {
    throw new Error(t('Only managed skills can be deleted from Altals settings.'))
  }

  await invoke('delete_path', { path: skill.directoryPath })
}

export async function updateManagedSkill({
  workspacePath = '',
  globalConfigDir = '',
  skill = null,
  nextName = '',
  nextDescription = '',
  nextBody = '',
} = {}) {
  const roots = await resolveManagedSkillRoots({ workspacePath, globalConfigDir })
  if (!isManagedSkill(skill, roots)) {
    throw new Error(t('Only managed skills can be edited from Altals settings.'))
  }

  return updateWritableSkill({
    workspacePath,
    globalConfigDir,
    skill,
    nextName,
    nextDescription,
    nextBody,
  })
}

export async function updateWritableSkill({
  workspacePath = '',
  globalConfigDir = '',
  skill = null,
  nextName = '',
  nextDescription = '',
  nextBody = '',
} = {}) {
  const writableRoots = await resolveWritableSkillRoots({ workspacePath, globalConfigDir })
  if (!isWritableSkill(skill, writableRoots)) {
    throw new Error(t('Only writable Altals skills can be edited from Altals settings.'))
  }

  const slug = slugifySkillName(nextName)
  if (!slug) {
    throw new Error(t('Skill name is required.'))
  }

  const currentDir = String(skill?.directoryPath || '').trim()
  if (!currentDir) {
    throw new Error(t('Writable skill directory is missing.'))
  }

  const currentSkillFile = String(skill?.skillFilePath || `${currentDir}/SKILL.md`).trim()
  const currentMarkdown = await readFile(currentSkillFile)

  const parentDir = currentDir.slice(0, currentDir.lastIndexOf('/'))
  const targetDir = `${parentDir}/${slug}`

  if (targetDir !== currentDir && await pathExists(targetDir)) {
    throw new Error(t('Skill already exists: {name}', { name: slug }))
  }

  if (targetDir !== currentDir) {
    await invoke('rename_path', { oldPath: currentDir, newPath: targetDir })
  }

  await invoke('write_file', {
    path: `${targetDir}/SKILL.md`,
    content: rewriteSkillMarkdown(
      currentMarkdown || skillMarkdownFromFields({
        name: skill?.name || slug,
        description: skill?.frontmatter?.description || '',
        body: skill?.body || '',
        frontmatter: skill?.frontmatter || {},
      }),
      {
        nextName: slug,
        nextDescription,
        nextBody,
      }
    ),
  })

  return targetDir
}

export async function duplicateManagedSkill({
  workspacePath = '',
  globalConfigDir = '',
  skill = null,
} = {}) {
  const roots = await resolveManagedSkillRoots({ workspacePath, globalConfigDir })
  if (!isManagedSkill(skill, roots)) {
    throw new Error(t('Only managed skills can be duplicated from Altals settings.'))
  }

  return duplicateWritableSkill({
    workspacePath,
    globalConfigDir,
    skill,
  })
}

export async function duplicateWritableSkill({
  workspacePath = '',
  globalConfigDir = '',
  skill = null,
} = {}) {
  const writableRoots = await resolveWritableSkillRoots({ workspacePath, globalConfigDir })
  if (!isWritableSkill(skill, writableRoots)) {
    throw new Error(t('Only writable Altals skills can be duplicated from Altals settings.'))
  }

  const currentDir = String(skill?.directoryPath || '').trim()
  if (!currentDir) {
    throw new Error(t('Writable skill directory is missing.'))
  }

  const parentDir = currentDir.slice(0, currentDir.lastIndexOf('/'))
  const baseName = getDirectoryName(currentDir)
  const existingEntries = await invoke('read_dir_shallow', { path: parentDir }).catch(() => [])
  const existingPaths = new Set(
    (Array.isArray(existingEntries) ? existingEntries : [])
      .map((entry) => String(entry?.path || '').trim())
      .filter(Boolean)
  )

  const targetDir = resolveUniqueDuplicateDirectory(`${parentDir}/${baseName}-copy`, existingPaths)
  await invoke('copy_dir', { src: currentDir, dest: targetDir })

  const duplicatedSkillFile = `${targetDir}/SKILL.md`
  const duplicatedMarkdown = await readFile(duplicatedSkillFile)
  const parsed = duplicatedMarkdown
    ? parseSkillMarkdown(duplicatedMarkdown, getDirectoryName(targetDir))
    : {
        frontmatter: skill?.frontmatter || {},
        body: String(skill?.body || '').trim(),
      }
  await invoke('write_file', {
    path: duplicatedSkillFile,
    content: rewriteSkillMarkdown(
      duplicatedMarkdown || skillMarkdownFromFields({
        name: skill?.name || getDirectoryName(targetDir),
        description: skill?.frontmatter?.description || '',
        body: skill?.body || '',
        frontmatter: skill?.frontmatter || {},
      }),
      {
        nextName: getDirectoryName(targetDir),
        nextDescription: undefined,
        nextBody: parsed.body,
      }
    ),
  })

  return targetDir
}

export async function exportSkillDirectory({
  skill = null,
  destinationDirectory = '',
} = {}) {
  const sourceDir = String(skill?.directoryPath || '').trim()
  const destinationRoot = String(destinationDirectory || '').trim().replace(/\/+$/, '')
  if (!sourceDir || !destinationRoot) {
    throw new Error(t('Skill source and destination directory are required.'))
  }

  const targetDir = `${destinationRoot}/${getDirectoryName(sourceDir)}`
  if (await pathExists(targetDir)) {
    throw new Error(t('Export destination already exists: {path}', { path: targetDir }))
  }

  await invoke('copy_dir', { src: sourceDir, dest: targetDir })
  return targetDir
}
