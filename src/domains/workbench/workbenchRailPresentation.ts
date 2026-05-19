import {
  WORKBENCH_MODE_DOCUMENTS,
  WORKBENCH_MODE_REFERENCES,
  WORKBENCH_MODE_SETTINGS,
  normalizeWorkbenchMode,
} from './workbenchShellPresentation.ts'

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
  activeMode = '',
  activePanel = 'files',
  t = (key) => key,
} = {}) {
  const normalizedActiveMode = activeMode
    ? normalizeWorkbenchMode(activeMode)
    : normalizeWorkbenchMode(activePanel)
  return [
    {
      id: WORKBENCH_MODE_DOCUMENTS,
      label: t('Documents'),
      active: normalizedActiveMode === WORKBENCH_MODE_DOCUMENTS,
    },
    {
      id: WORKBENCH_MODE_REFERENCES,
      label: t('References'),
      active: normalizedActiveMode === WORKBENCH_MODE_REFERENCES,
    },
    {
      id: WORKBENCH_MODE_SETTINGS,
      label: t('Settings'),
      active: normalizedActiveMode === WORKBENCH_MODE_SETTINGS,
    },
  ]
}

export function buildWorkbenchRailTitleState({
  currentDocumentLabel = '',
  preferExternalDocumentTitle = false,
  showDocumentTitleTarget = true,
  workbenchMode = WORKBENCH_MODE_DOCUMENTS,
} = {}) {
  const normalizedMode = normalizeWorkbenchMode(workbenchMode)
  const isDocumentMode = normalizedMode === WORKBENCH_MODE_DOCUMENTS
  const documentTitleLabel = String(currentDocumentLabel || '')
  const showInlineDocumentTitle = Boolean(
    documentTitleLabel &&
      !preferExternalDocumentTitle &&
      isDocumentMode
  )

  return {
    contextTitleLabel: isDocumentMode ? '' : documentTitleLabel,
    documentTitleLabel,
    showContextTitle: Boolean(!isDocumentMode && documentTitleLabel),
    showDocumentTitleSlot: Boolean(showDocumentTitleTarget && isDocumentMode),
    showInlineDocumentTitle,
  }
}
