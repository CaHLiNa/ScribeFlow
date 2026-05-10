function readPreviewBinding(filePath, workflowStore, previewKind = null) {
  const binding = workflowStore?.getPreviewBinding?.(filePath) || null
  if (!binding?.sourcePath) return null
  if (previewKind && binding.previewKind && binding.previewKind !== previewKind) return null
  return binding
}

function getExtension(filePath) {
  const name = String(filePath || '').split(/[\\/]/).pop() || ''
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(index + 1).toLowerCase() : ''
}

function isMarkdownSourcePath(filePath) {
  return ['md', 'markdown', 'qmd', 'rmd'].includes(getExtension(filePath))
}

function previewSourcePathFromPreviewPath(filePath) {
  return typeof filePath === 'string' && filePath.startsWith('preview:')
    ? filePath.slice('preview:'.length)
    : ''
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

  const previewSourcePath = previewSourcePathFromPreviewPath(filePath)
  if (previewSourcePath) return previewSourcePath

  if (options.acceptSourceFile !== false && options.matchesSourcePath?.(filePath) === true) {
    return filePath
  }

  return ''
}

export function resolveMarkdownPreviewInput(filePath, options = {}) {
  const sourcePath = resolveWorkspacePreviewSourcePath(filePath, {
    ...options,
    previewKind: 'html',
    matchesSourcePath: isMarkdownSourcePath,
  })

  return {
    sourcePath,
  }
}
