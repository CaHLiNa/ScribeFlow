export const WORKBENCH_MODE_DOCUMENTS = 'documents'
export const WORKBENCH_MODE_REFERENCES = 'references'
export const WORKBENCH_MODE_SETTINGS = 'settings'

export const CONTEXT_DOCK_NONE = 'none'
export const CONTEXT_DOCK_DOCUMENT = 'document'
export const CONTEXT_DOCK_REFERENCE = 'reference'

export function normalizeWorkbenchMode(mode = '') {
  const normalized = String(mode || '').trim().toLowerCase()
  switch (normalized) {
    case WORKBENCH_MODE_REFERENCES:
    case 'reference':
      return WORKBENCH_MODE_REFERENCES
    case WORKBENCH_MODE_SETTINGS:
    case 'setting':
      return WORKBENCH_MODE_SETTINGS
    case WORKBENCH_MODE_DOCUMENTS:
    case 'document':
    case 'files':
    case 'workspace':
    default:
      return WORKBENCH_MODE_DOCUMENTS
  }
}

export function resolveWorkbenchMode({
  isSettingsSurface = false,
  leftSidebarPanel = 'files',
} = {}) {
  if (isSettingsSurface) return WORKBENCH_MODE_SETTINGS
  return normalizeWorkbenchMode(
    leftSidebarPanel === 'references'
      ? WORKBENCH_MODE_REFERENCES
      : WORKBENCH_MODE_DOCUMENTS
  )
}

export function leftSidebarPanelForWorkbenchMode(mode = WORKBENCH_MODE_DOCUMENTS) {
  return normalizeWorkbenchMode(mode) === WORKBENCH_MODE_REFERENCES ? 'references' : 'files'
}

export function resolveContextDockState({
  hasWorkspace = false,
  isWorkspaceSurface = false,
  workbenchMode = WORKBENCH_MODE_DOCUMENTS,
  documentDockOpen = false,
  referenceDockOpen = false,
} = {}) {
  const normalizedMode = normalizeWorkbenchMode(workbenchMode)
  const available = Boolean(
    hasWorkspace && isWorkspaceSurface && normalizedMode !== WORKBENCH_MODE_SETTINGS
  )

  if (!available) {
    return {
      available: false,
      kind: CONTEXT_DOCK_NONE,
      open: false,
      labelKey: 'Context dock',
      toggleLabelKey: 'Toggle context dock',
    }
  }

  if (normalizedMode === WORKBENCH_MODE_REFERENCES) {
    return {
      available: true,
      kind: CONTEXT_DOCK_REFERENCE,
      open: referenceDockOpen === true,
      labelKey: 'Reference detail',
      toggleLabelKey: 'Toggle reference detail',
    }
  }

  return {
    available: true,
    kind: CONTEXT_DOCK_DOCUMENT,
    open: documentDockOpen === true,
    labelKey: 'Document context',
    toggleLabelKey: 'Toggle document context',
  }
}
