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

export async function resolveWorkspacePreviewSourcePath(filePath, options = {}) {
  const explicitSourcePath = normalizePath(options.sourcePath || options.workflowSourcePath)
  if (explicitSourcePath) return explicitSourcePath

  const bindingSourcePath =
    readPreviewBinding(filePath, options.workflowStore, options.previewKind)?.sourcePath || ''
  if (bindingSourcePath) return bindingSourcePath

  const previewSourcePath = await previewSourcePathFromPath(filePath)
  if (previewSourcePath) return previewSourcePath

  if (options.acceptSourceFile !== false && (await options.matchesSourcePath?.(filePath))) {
    return filePath
  }

  return ''
}

export async function resolveMarkdownPreviewInput(filePath, options = {}) {
  const sourcePath = await resolveWorkspacePreviewSourcePath(filePath, {
    ...options,
    previewKind: 'html',
    matchesSourcePath: isMarkdown,
  })

  return {
    sourcePath,
  }
}
