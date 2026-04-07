import { invoke } from '@tauri-apps/api/core'
import { TEXT_FILE_READ_LIMIT_BYTES } from '../domains/files/workspaceTextFileLimits.js'
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

export async function readWorkspaceTextFile(path, maxBytes = TEXT_FILE_READ_LIMIT_BYTES) {
  return invoke('read_file', { path, maxBytes })
}

export async function saveWorkspaceTextFile(path, content) {
  await invoke('write_file', { path, content })
}

export async function createWorkspaceFile(dirPath, name, options = {}) {
  const fullPath = `${dirPath}/${name}`

  let content = typeof options.initialContent === 'string' ? options.initialContent : ''
  if (!content) {
    if (name.endsWith('.tex')) {
      const title = name.replace(/\.tex$/, '').replace(/-/g, ' ')
      content = `\\documentclass{article}\n\\title{${title}}\n\\author{}\n\\date{}\n\n\\begin{document}\n\\maketitle\n\n\n\n\\end{document}\n`
    } else if (name.endsWith('.typ')) {
      const title = name.replace(/\.typ$/, '').replace(/-/g, ' ')
      content = `= ${title}\n\nStart writing here.\n`
    }
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
