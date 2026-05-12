import { invoke } from '@tauri-apps/api/core'

export async function classify(path) {
  return invoke('file_types_classify', { params: { path } })
}

export async function getViewerType(path) {
  return invoke('file_types_get_viewer_type', { params: { path } })
}

export async function getFileIconName(fileName) {
  return invoke('file_types_get_icon_name', { params: { fileName } })
}

export async function getMimeType(path) {
  return invoke('file_types_get_mime_type', { params: { path } })
}

export async function isNewTab(path) {
  const result = await classify(path)
  return result.isNewTab
}

export async function isDraftPath(path) {
  const result = await classify(path)
  return result.isDraftPath
}

export async function isPreviewPath(path) {
  const result = await classify(path)
  return result.isPreviewPath
}

export async function isMarkdownPreviewPath(path) {
  const result = await classify(path)
  return result.isPreviewPath
}

export async function previewSourcePathFromPath(path) {
  const result = await classify(path)
  return result.previewSourcePath
}

export async function isMarkdown(path) {
  const result = await classify(path)
  return result.isMarkdown
}

export async function isLatex(path) {
  const result = await classify(path)
  return result.isLatex
}

export async function isLatexEditorFile(path) {
  const result = await classify(path)
  return result.isLatexEditorFile
}

export async function isBibFile(path) {
  const result = await classify(path)
  return result.isBibFile
}

export async function isImage(path) {
  const result = await classify(path)
  return result.isImage
}

export async function isHtml(path) {
  const result = await classify(path)
  return result.isHtml
}

export async function isMultimodalImage(path) {
  const result = await classify(path)
  return result.isMultimodalImage
}

export async function isPdf(path) {
  const result = await classify(path)
  return result.isPdf
}

export async function isBinaryFile(path) {
  const result = await classify(path)
  return result.isBinary
}

export async function isRunnable(path) {
  const result = await classify(path)
  return result.isRunnable
}

export async function getLanguage(path) {
  const result = await classify(path)
  return result.language
}

export async function isRmdOrQmd() {
  return false
}

export async function relativePath(fromFile, toFile) {
  return invoke('path_utils_relative_between', { params: { fromFile, toFile } })
}
