import { isMarkdown, previewSourcePathFromPath } from '../../utils/fileTypes.js'

function readPreviewBinding(filePath, workflowStore, previewKind = null) {
  const binding = workflowStore?.getPreviewBinding?.(filePath) || null
  if (!binding?.sourcePath) return null
  if (previewKind && binding.previewKind && binding.previewKind !== previewKind) return null
  return binding
}

function normalizePath(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function resolveWorkspacePreviewSourcePath(filePath, options = {}) {
  const explicitSourcePath = normalizePath(options.sourcePath || options.workflowSourcePath)
  if (explicitSourcePath) return explicitSourcePath

  const bindingSourcePath =
    readPreviewBinding(filePath, options.workflowStore, options.previewKind)?.sourcePath || ''
  if (bindingSourcePath) return bindingSourcePath

  const previewSourcePath = previewSourcePathFromPath(filePath)
  if (previewSourcePath) return previewSourcePath

  if (options.acceptSourceFile !== false && options.matchesSourcePath?.(filePath)) {
    return filePath
  }

  return ''
}

export function resolveMarkdownPreviewInput(filePath, options = {}) {
  const sourcePath = resolveWorkspacePreviewSourcePath(filePath, {
    ...options,
    previewKind: 'html',
    matchesSourcePath: isMarkdown,
  })

  return {
    sourcePath,
  }
}
