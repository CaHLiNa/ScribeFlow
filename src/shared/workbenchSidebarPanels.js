export const WORKSPACE_SIDEBAR_PANELS = ['files', 'references']
export const SETTINGS_SIDEBAR_PANELS = ['files']

export const WORKBENCH_SIDEBAR_PANELS = {
  workspace: WORKSPACE_SIDEBAR_PANELS,
  settings: SETTINGS_SIDEBAR_PANELS,
}

export const MAX_WORKBENCH_SIDEBAR_PANEL_COUNT = Math.max(
  ...Object.values(WORKBENCH_SIDEBAR_PANELS).map((panels) => panels.length)
)

export const DEFAULT_WORKBENCH_SIDEBAR_PANEL = {
  workspace: 'files',
  settings: 'files',
}

export const ALL_WORKBENCH_SIDEBAR_PANELS = [...WORKSPACE_SIDEBAR_PANELS]

export function normalizeWorkbenchSurface(surface = 'workspace') {
  return WORKBENCH_SIDEBAR_PANELS[surface] ? surface : 'workspace'
}

export function normalizeWorkbenchSidebarPanel(surface = 'workspace', panel = '') {
  const normalizedSurface = normalizeWorkbenchSurface(surface)
  const allowedPanels = WORKBENCH_SIDEBAR_PANELS[normalizedSurface] || WORKSPACE_SIDEBAR_PANELS
  if (allowedPanels.includes(panel)) return panel
  return DEFAULT_WORKBENCH_SIDEBAR_PANEL[normalizedSurface]
}
