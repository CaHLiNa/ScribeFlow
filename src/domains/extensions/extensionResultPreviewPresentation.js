import { buildExtensionActionSurfaceState } from './extensionActionSurfaceState.js'
import { buildExtensionRuntimeBlockPresentation } from './extensionRuntimeBlockPresentation.js'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeAction(value = '') {
  return normalizeText(value).toLowerCase()
}

function pathLooksLikeImage(path = '') {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(path)
}

function pathLooksLikeHtml(path = '') {
  return /\.html?$/i.test(path)
}

function pathLooksLikeText(path = '') {
  return /\.(txt|md|markdown|json|log|csv|tex|py|bib)$/i.test(path)
}

export function inferExtensionResultPreviewMode(entry = {}) {
  const previewMode = normalizeAction(entry?.previewMode || entry?.preview_mode)
  const mediaType = normalizeAction(entry?.mediaType || entry?.media_type)
  const previewPath = normalizeText(entry?.previewPath || entry?.preview_path || entry?.path)

  if (previewMode) return previewMode
  if (mediaType === 'application/pdf' || previewPath.toLowerCase().endsWith('.pdf')) return 'pdf'
  if (mediaType.startsWith('image/') || pathLooksLikeImage(previewPath)) return 'image'
  if (mediaType === 'text/html' || pathLooksLikeHtml(previewPath)) return 'html'
  if (mediaType.startsWith('text/') || pathLooksLikeText(previewPath)) return 'text'
  return ''
}

export function labelKeyForResultAction(entry = {}) {
  switch (normalizeAction(entry?.action)) {
    case 'copy-text':
      return 'Copy'
    case 'copy-path':
      return 'Copy Path'
    case 'execute-command':
      return 'Run'
    case 'open-tab':
      return 'Open Tab'
    case 'open-reference':
      return 'Open Reference'
    case 'reveal':
      return 'Reveal'
    default:
      return 'Open'
  }
}

function hasReferenceTarget(entry = {}) {
  return Boolean(normalizeText(entry?.referenceId || entry?.reference_id))
}

function shouldShowPrimaryAction(entry = {}) {
  const action = normalizeAction(entry?.action)
  return Boolean(
    entry?.path ||
    entry?.previewPath ||
    entry?.preview_path ||
    ['copy-text', 'copy-path', 'execute-command', 'open-reference'].includes(action)
  )
}

function buildPrimaryToolbarAction(entry = {}, hostDiagnostics = {}) {
  if (!shouldShowPrimaryAction(entry)) return null
  const primaryState = buildExtensionActionSurfaceState({
    hostDiagnostics,
    resultEntry: entry,
  })
  const blockPresentation = buildExtensionRuntimeBlockPresentation(primaryState.runtimeBlock)
  return {
    id: 'primary',
    labelKey: labelKeyForResultAction(entry),
    entry,
    blocked: primaryState.resultEntryBlocked,
    blockedLabelKey: blockPresentation.labelKey,
    blockedMessageKey: blockPresentation.messageKey,
    blockedMessageParams: blockPresentation.messageParams,
  }
}

export function buildExtensionResultToolbarActions(entry = {}, { hostDiagnostics = {} } = {}) {
  const actions = []
  const primaryAction = normalizeAction(entry?.action)
  const path = normalizeText(entry?.path)
  const primary = buildPrimaryToolbarAction(entry, hostDiagnostics)
  if (primary) actions.push(primary)

  if (primaryAction !== 'reveal' && path) {
    actions.push({
      id: 'reveal',
      labelKey: 'Reveal',
      entry: { ...entry, action: 'reveal' },
      blocked: false,
      blockedLabelKey: '',
      blockedMessageKey: '',
      blockedMessageParams: {},
    })
  }

  if (primaryAction !== 'copy-path' && path) {
    actions.push({
      id: 'copy-path',
      labelKey: 'Copy Path',
      entry: { ...entry, action: 'copy-path' },
      blocked: false,
      blockedLabelKey: '',
      blockedMessageKey: '',
      blockedMessageParams: {},
    })
  }

  if (primaryAction !== 'open-reference' && hasReferenceTarget(entry)) {
    actions.push({
      id: 'open-reference',
      labelKey: 'Open Reference',
      entry: { ...entry, action: 'open-reference' },
      blocked: false,
      blockedLabelKey: '',
      blockedMessageKey: '',
      blockedMessageParams: {},
    })
  }

  return actions
}

export function actionKeyForResultEntry(entry = {}) {
  return [
    normalizeText(entry?.id),
    normalizeAction(entry?.action),
    normalizeText(entry?.path || entry?.targetPath || entry?.target_path),
    normalizeText(entry?.referenceId || entry?.reference_id),
  ].join('::')
}

export function buildExtensionResultPreviewPresentation(entry = {}, { hostDiagnostics = {} } = {}) {
  const previewMode = inferExtensionResultPreviewMode(entry)
  const toolbarActions = buildExtensionResultToolbarActions(entry, { hostDiagnostics })
  const previewPath = normalizeText(entry?.previewPath || entry?.preview_path || entry?.path)
  const hasPreview = Boolean(previewMode)
  const emptyState = hasPreview
    ? null
    : toolbarActions.length > 0
      ? {
          kind: 'actionable',
          titleKey: 'This result provides actions instead of an inline preview.',
          bodyKey: 'Use the actions above to continue.',
        }
      : {
          kind: 'unavailable',
          titleKey: 'Preview unavailable for this result entry.',
          bodyKey: '',
        }

  return {
    available: Boolean(entry),
    previewMode,
    previewPath,
    previewTitleKey: normalizeText(entry?.previewTitle || entry?.preview_title || entry?.label) || 'Result Preview',
    htmlPreviewContent: normalizeText(entry?.payload?.html),
    inlineText: String(entry?.payload?.text || ''),
    toolbarActions,
    emptyState,
    isPdfPreview: previewMode === 'pdf',
    isImagePreview: previewMode === 'image',
    isHtmlPreview: previewMode === 'html',
    isTextPreview: previewMode === 'text',
  }
}
