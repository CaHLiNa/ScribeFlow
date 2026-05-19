import { invokeCommand as invoke } from './tauriBridge.ts'

export async function normalizeFsPath(value = '') {
  return invoke('path_utils_normalize', { params: { value } })
}

export async function basenamePath(filePath = '') {
  return invoke('path_utils_basename', { params: { filePath } })
}

export async function dirnamePath(filePath = '') {
  return invoke('path_utils_dirname', { params: { filePath } })
}

export async function resolveRelativePath(baseDir = '', target = '') {
  return invoke('path_utils_resolve_relative', { params: { baseDir, target } })
}

export async function stripExtension(filePath = '') {
  return invoke('path_utils_strip_extension', { params: { filePath } })
}

export async function joinPath(...segments) {
  return invoke('path_utils_join', { params: { segments } })
}

export async function relativePathBetween(fromFile = '', toFile = '') {
  return invoke('path_utils_relative_between', { params: { fromFile, toFile } })
}
