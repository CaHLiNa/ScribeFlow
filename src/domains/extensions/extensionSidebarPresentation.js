import { buildExtensionActionSurfaceState } from './extensionActionSurfaceState.js'
import { describeExtensionRuntimeBlockPresentation } from './extensionRuntimeBlockPresentation.js'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeList(value = []) {
  return Array.isArray(value) ? value : []
}

export function extensionSidebarViewKey(view = {}) {
  return `${normalizeText(view?.extensionId)}:${normalizeText(view?.id)}`
}

export function resolveExtensionSidebarPanelTitle({
  container = {},
  translate = (key) => key,
} = {}) {
  return translate(normalizeText(container?.title || container?.id || 'Extension'))
}

export function resolveExtensionSidebarPanelExtensionName(container = {}) {
  return normalizeText(container?.extensionName || container?.extensionId || '')
}

export function buildExtensionSidebarHeaderActionState({
  action = {},
  hostDiagnostics = {},
  translate = (key) => key,
} = {}) {
  const state = buildExtensionActionSurfaceState({
    hostDiagnostics,
    headerAction: action,
  })
  const blockPresentation = describeExtensionRuntimeBlockPresentation(state.runtimeBlock, translate)
  return {
    ...action,
    blocked: state.headerActionBlocked,
    blockedLabel: blockPresentation.label,
    blockedMessage: blockPresentation.message,
  }
}

export function buildExtensionSidebarHeaderActionsState({
  actions = [],
  hostDiagnostics = {},
  translate = (key) => key,
} = {}) {
  return normalizeList(actions).map((action) =>
    buildExtensionSidebarHeaderActionState({
      action,
      hostDiagnostics,
      translate,
    })
  )
}

export function resolveExtensionSidebarViewPresentation({
  view = {},
  viewState = {},
  resolvedView = {},
} = {}) {
  return {
    title: normalizeText(
      viewState?.title
        || resolvedView?.title
        || view?.contextualTitle
        || view?.title
        || view?.id
    ),
    description: normalizeText(viewState?.description),
    message: normalizeText(viewState?.message),
    statusLabel: normalizeText(viewState?.statusLabel),
    statusTone: normalizeText(viewState?.statusTone),
    actionLabel: normalizeText(viewState?.actionLabel),
    badgeValue: viewState?.badgeValue,
    badgeTooltip: normalizeText(viewState?.badgeTooltip),
    sections: normalizeList(viewState?.sections),
    resultEntries: normalizeList(viewState?.resultEntries),
  }
}

export function resolveExtensionSidebarActiveResultEntry({
  resultEntries = [],
  selectedEntryId = '',
} = {}) {
  const entries = normalizeList(resultEntries)
  if (entries.length === 0) return null
  const normalizedSelectedEntryId = normalizeText(selectedEntryId)
  return entries.find((entry) => normalizeText(entry?.id) === normalizedSelectedEntryId) || entries[0] || null
}

export function isExtensionSidebarActiveResultEntry({
  activeEntry = null,
  entry = {},
} = {}) {
  return activeEntry ? activeEntry?.id === entry?.id : false
}

export function isExtensionSidebarTreeItemExpandable(item = {}) {
  const state = normalizeText(item?.collapsibleState)
  return Boolean(state && state !== 'none')
}

export function resolveExtensionSidebarItemExpansionKey(view = {}, item = {}) {
  return `${extensionSidebarViewKey(view)}:${normalizeText(item?.handle || item?.id)}`
}

export function isExtensionSidebarTreeItemExpanded({
  view = {},
  item = {},
  expandedItemKeys = {},
  controllerState = {},
} = {}) {
  const key = resolveExtensionSidebarItemExpansionKey(view, item)
  if (expandedItemKeys?.[key] != null) {
    return Boolean(expandedItemKeys[key])
  }

  const handle = normalizeText(item?.handle || item?.id)
  if (handle && Array.isArray(controllerState?.revealedPathHandles)) {
    if (controllerState.revealedPathHandles.includes(handle)) {
      return true
    }
  }

  return normalizeText(item?.collapsibleState) === 'expanded'
}

export function resolveExtensionSidebarResultActionKey(entry = {}) {
  return [
    normalizeText(entry?.id),
    normalizeText(entry?.action).toLowerCase(),
    normalizeText(entry?.path || entry?.targetPath),
    normalizeText(entry?.referenceId || entry?.reference_id),
  ].join('::')
}

export function resolveExtensionSidebarResultActionMessageKey(entry = {}) {
  const action = normalizeText(entry?.action).toLowerCase()
  switch (action) {
    case 'copy-text':
    case 'copy-path':
      return 'Copied to clipboard'
    case 'open-reference':
      return 'Opened reference'
    case 'execute-command':
      return 'Extension task started'
    default:
      return ''
  }
}
