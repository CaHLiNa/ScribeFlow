import { invoke } from '@tauri-apps/api/core'
import { getWorkflowSourcePathForPreview } from './fileStoreEffects'

export const TEXT_FILE_READ_LIMIT_BYTES = 10 * 1024 * 1024

// Minimal valid DOCX — includes styles, numbering, settings, custom props.
export const EMPTY_DOCX_BASE64 = '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'

async function pathExists(path) {
  return invoke('path_exists', { path })
}

async function isDirectory(path) {
  return invoke('is_directory', { path })
}

function buildCopyName(name, index, suffix = '') {
  return index === 1 ? `${name} copy${suffix}` : `${name} copy ${index}${suffix}`
}

async function resolveUniqueCopyDestination(path, { dir, isDir }) {
  const name = path.split('/').pop()
  if (isDir) {
    let index = 1
    let candidate = `${dir}/${buildCopyName(name, index)}`
    while (await pathExists(candidate)) {
      index += 1
      candidate = `${dir}/${buildCopyName(name, index)}`
    }
    return candidate
  }

  const dotIdx = name.lastIndexOf('.')
  const base = dotIdx > 0 ? name.substring(0, dotIdx) : name
  const suffix = dotIdx > 0 ? name.substring(dotIdx) : ''
  let index = 1
  let candidate = `${dir}/${buildCopyName(base, index, suffix)}`
  while (await pathExists(candidate)) {
    index += 1
    candidate = `${dir}/${buildCopyName(base, index, suffix)}`
  }
  return candidate
}

async function resolveUniqueMoveDestination(name, destDir, isDir) {
  if (isDir) {
    let index = 2
    let candidate = `${destDir}/${name} ${index}`
    while (await pathExists(candidate)) {
      index += 1
      candidate = `${destDir}/${name} ${index}`
    }
    return candidate
  }

  const dotIdx = name.lastIndexOf('.')
  const base = dotIdx > 0 ? name.substring(0, dotIdx) : name
  const suffix = dotIdx > 0 ? name.substring(dotIdx) : ''
  let index = 2
  let candidate = `${destDir}/${base} ${index}${suffix}`
  while (await pathExists(candidate)) {
    index += 1
    candidate = `${destDir}/${base} ${index}${suffix}`
  }
  return candidate
}

export async function detectPdfSourceKind({ pdfPath, fileContents = {}, findEntry }) {
  const texPath = pdfPath.replace(/\.pdf$/i, '.tex')
  const typPath = pdfPath.replace(/\.pdf$/i, '.typ')
  const workflowSourcePath = getWorkflowSourcePathForPreview(pdfPath)

  if (workflowSourcePath === texPath) return 'latex'
  if (workflowSourcePath === typPath) return 'typst'
  if (fileContents[texPath] !== undefined) return 'latex'
  if (fileContents[typPath] !== undefined) return 'typst'
  if (findEntry?.(texPath)) return 'latex'
  if (findEntry?.(typPath)) return 'typst'

  try {
    const [hasTex, hasTyp] = await Promise.all([
      pathExists(texPath),
      pathExists(typPath),
    ])
    if (hasTex) return 'latex'
    if (hasTyp) return 'typst'
  } catch {
    // Fall back to the plain viewer if the filesystem probe fails.
  }

  return 'plain'
}

export async function readWorkspaceTextFile(path, maxBytes = TEXT_FILE_READ_LIMIT_BYTES) {
  return invoke('read_file', { path, maxBytes })
}

export async function saveWorkspaceTextFile(path, content) {
  await invoke('write_file', { path, content })
}

export async function createWorkspaceFile(dirPath, name) {
  const fullPath = `${dirPath}/${name}`

  if (name.endsWith('.docx')) {
    const exists = await pathExists(fullPath)
    if (exists) {
      return { ok: false, code: 'exists', path: fullPath }
    }
    await invoke('write_file_base64', { path: fullPath, data: EMPTY_DOCX_BASE64 })
    return { ok: true, path: fullPath }
  }

  let content = ''
  if (name.endsWith('.ipynb')) {
    content = JSON.stringify({
      cells: [{ id: 'cell-1', cell_type: 'code', source: [], metadata: {}, outputs: [], execution_count: null }],
      metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' }, language_info: { name: 'python' } },
      nbformat: 4, nbformat_minor: 5,
    }, null, 1) + '\n'
  } else if (name.endsWith('.tex')) {
    const title = name.replace(/\.tex$/, '').replace(/-/g, ' ')
    content = `\\documentclass{article}\n\\title{${title}}\n\\author{}\n\\date{}\n\n\\begin{document}\n\\maketitle\n\n\n\n\\end{document}\n`
  } else if (name.endsWith('.typ')) {
    const title = name.replace(/\.typ$/, '').replace(/-/g, ' ')
    content = `= ${title}\n\nStart writing here.\n`
  }

  await invoke('create_file', { path: fullPath, content })
  return { ok: true, path: fullPath }
}

export async function duplicateWorkspacePath(path) {
  const dir = path.substring(0, path.lastIndexOf('/'))
  const directory = await isDirectory(path)
  const newPath = await resolveUniqueCopyDestination(path, { dir, isDir: directory })
  if (directory) {
    await invoke('copy_dir', { src: path, dest: newPath })
  } else {
    await invoke('copy_file', { src: path, dest: newPath })
  }
  return newPath
}

export async function createWorkspaceFolder(dirPath, name) {
  const fullPath = `${dirPath}/${name}`
  await invoke('create_dir', { path: fullPath })
  return fullPath
}

export async function renameWorkspacePath(oldPath, newPath) {
  if (oldPath !== newPath) {
    const exists = await pathExists(newPath)
    if (exists) {
      return { ok: false, code: 'exists' }
    }
  }
  await invoke('rename_path', { oldPath, newPath })
  return { ok: true }
}

export async function moveWorkspacePath(srcPath, destDir) {
  const name = srcPath.split('/').pop()
  let destPath = `${destDir}/${name}`
  if (srcPath === destPath) {
    return { ok: true, destPath }
  }

  const exists = await pathExists(destPath)
  if (exists) {
    const directory = await isDirectory(srcPath)
    destPath = await resolveUniqueMoveDestination(name, destDir, directory)
  }

  await invoke('rename_path', { oldPath: srcPath, newPath: destPath })
  return { ok: true, destPath }
}

export async function copyExternalWorkspaceFile(srcPath, destDir) {
  const directory = await isDirectory(srcPath)
  const name = srcPath.split('/').pop()
  let destPath = `${destDir}/${name}`
  const exists = await pathExists(destPath)
  if (exists) {
    destPath = await resolveUniqueMoveDestination(name, destDir, directory)
  }

  if (directory) {
    await invoke('copy_dir', { src: srcPath, dest: destPath })
  } else {
    await invoke('copy_file', { src: srcPath, dest: destPath })
  }

  return {
    path: destPath,
    isDir: directory,
  }
}

export async function deleteWorkspacePath(path) {
  await invoke('delete_path', { path })
}
