const TOPBAR_HEIGHT = 36
const DEFAULT_SIDE_PADDING = 12
const MAC_TRAFFIC_LIGHT_SAFE_PADDING = 68
const FULLSCREEN_LEFT_PADDING = 12

export function resolveWorkbenchRailLeftPadding({
  isMac = false,
  isTauriDesktop = false,
  isNativeFullscreen = false,
} = {}) {
  if (!isMac || !isTauriDesktop) {
    return DEFAULT_SIDE_PADDING
  }
  return isNativeFullscreen ? FULLSCREEN_LEFT_PADDING : MAC_TRAFFIC_LIGHT_SAFE_PADDING
}

export function resolveWorkbenchRailStyle(options = {}) {
  const leftPadding = resolveWorkbenchRailLeftPadding(options)
  return {
    '--rail-left-offset': `${leftPadding}px`,
    '--rail-right-offset': `${DEFAULT_SIDE_PADDING}px`,
    height: `${TOPBAR_HEIGHT}px`,
    minHeight: `${TOPBAR_HEIGHT}px`,
  }
}

export function buildWorkbenchRailModeItems({
  activePanel = 'files',
  t = (key) => key,
} = {}) {
  const normalizedActivePanel = String(activePanel || '').trim() || 'files'
  return [
    {
      id: 'files',
      label: t('Document Area'),
      active: normalizedActivePanel === 'files',
    },
    {
      id: 'references',
      label: t('Reference Library'),
      active: normalizedActivePanel === 'references',
    },
  ]
}

export function buildWorkbenchRailTitleState({
  currentDocumentLabel = '',
  leftSidebarAvailable = true,
  leftSidebarPanel = 'files',
  preferExternalDocumentTitle = false,
  showDocumentTitleTarget = true,
} = {}) {
  const activePanel = String(leftSidebarPanel || '').trim() || 'files'
  const isReferencePanel = leftSidebarAvailable && activePanel === 'references'
  const documentTitleLabel = String(currentDocumentLabel || '')
  const showInlineDocumentTitle = Boolean(
    documentTitleLabel &&
      !preferExternalDocumentTitle &&
      !isReferencePanel
  )

  return {
    documentTitleLabel,
    showDocumentTitleSlot: Boolean(showDocumentTitleTarget && !isReferencePanel),
    showInlineDocumentTitle,
    showReferenceTitle: isReferencePanel,
  }
}
