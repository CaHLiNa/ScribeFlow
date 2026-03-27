import {
  isLatex,
  isMarkdown,
  isPdf,
  isTypst,
  previewSourcePathFromPath,
} from '../../utils/fileTypes.js'
import { resolveCachedTypstRootPath, resolveTypstCompileTarget } from '../../services/typst/root.js'

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
  const explicitSourcePath = normalizePath(options.sourcePath)
  if (explicitSourcePath) return explicitSourcePath

  const bindingSourcePath = readPreviewBinding(filePath, options.workflowStore, options.previewKind)?.sourcePath || ''
  if (bindingSourcePath) return bindingSourcePath

  const legacySourcePath = previewSourcePathFromPath(filePath)
  if (legacySourcePath) return legacySourcePath

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
    legacyPreviewPath: previewSourcePathFromPath(filePath) || '',
  }
}

export async function resolveTypstNativePreviewInput(filePath, options = {}) {
  const sourcePath = resolveWorkspacePreviewSourcePath(filePath, {
    ...options,
    previewKind: 'native',
    matchesSourcePath: isTypst,
  })
  const explicitRootPath = normalizePath(options.rootPath)

  if (!sourcePath) {
    return {
      sourcePath: '',
      rootPath: explicitRootPath,
    }
  }

  const typstState = options.typstStore?.stateForFile?.(sourcePath)
  const fallbackRootPath =
    explicitRootPath
    || typstState?.projectRootPath
    || typstState?.compileTargetPath
    || options.resolveCachedTypstRootPathImpl?.(sourcePath)
    || resolveCachedTypstRootPath(sourcePath)
    || sourcePath

  if (explicitRootPath) {
    return {
      sourcePath,
      rootPath: explicitRootPath,
    }
  }

  try {
    const resolvedRootPath = await (options.resolveTypstCompileTargetImpl || resolveTypstCompileTarget)(sourcePath, {
      filesStore: options.filesStore,
      workspacePath: options.workspacePath,
      contentOverrides: {
        [sourcePath]: options.filesStore?.fileContents?.[sourcePath],
      },
    })

    return {
      sourcePath,
      rootPath: resolvedRootPath || fallbackRootPath,
    }
  } catch {
    return {
      sourcePath,
      rootPath: fallbackRootPath,
    }
  }
}

export function resolveDocumentPdfPreviewInput(filePath, options = {}) {
  const sourcePath = resolveWorkspacePreviewSourcePath(filePath, {
    ...options,
    previewKind: 'pdf',
    matchesSourcePath: (path) => isLatex(path) || isTypst(path),
  })
  const artifactPath = normalizePath(options.previewTargetPath || options.resolvedTargetPath || options.artifactPath)
    || (isPdf(filePath) ? filePath : '')
  const sourceKind = isLatex(sourcePath) ? 'latex' : isTypst(sourcePath) ? 'typst' : null
  const pdfSourceState = artifactPath ? options.filesStore?.getPdfSourceState?.(artifactPath) || null : null
  const resolvedKind = sourceKind || pdfSourceState?.kind || 'plain'
  const resolutionState = sourceKind ? 'resolved-from-source' : pdfSourceState?.status || 'unresolved'

  return {
    sourcePath,
    artifactPath,
    sourceKind,
    resolvedKind,
    resolutionState,
    previewBinding: readPreviewBinding(filePath, options.workflowStore, 'pdf'),
  }
}
