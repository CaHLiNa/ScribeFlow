import { invoke } from '@tauri-apps/api/core'

export async function normalizeFsPath(value = '') {
  return invoke('path_utils_normalize', { value })
}

export async function basenamePath(filePath = '') {
  return invoke('path_utils_basename', { filePath })
}

export async function dirnamePath(filePath = '') {
  return invoke('path_utils_dirname', { filePath })
}

export async function resolveRelativePath(baseDir = '', target = '') {
  return invoke('path_utils_resolve_relative', { baseDir, target })
}

export async function stripExtension(filePath = '') {
  return invoke('path_utils_strip_extension', { filePath })
}

export async function joinPath(...segments) {
  return invoke('path_utils_join', { segments })
}

export async function relativePathBetween(fromFile = '', toFile = '') {
  return invoke('path_utils_relative_between', { fromFile, toFile })
}
