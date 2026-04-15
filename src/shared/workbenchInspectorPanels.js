export const WORKSPACE_INSPECTOR_PANELS = ['outline', 'ai']
export const SETTINGS_INSPECTOR_PANELS = []

export const WORKBENCH_INSPECTOR_PANELS = {
  workspace: WORKSPACE_INSPECTOR_PANELS,
  settings: SETTINGS_INSPECTOR_PANELS,
}

export const DEFAULT_WORKBENCH_INSPECTOR_PANEL = {
  workspace: 'outline',
  settings: '',
}

export const ALL_WORKBENCH_INSPECTOR_PANELS = [...WORKSPACE_INSPECTOR_PANELS]

export const MAX_WORKBENCH_INSPECTOR_PANEL_COUNT = Math.max(
  ...Object.values(WORKBENCH_INSPECTOR_PANELS).map((panels) => panels.length)
)

export function normalizeWorkbenchInspectorPanel(surface = 'workspace', panel = '') {
  const normalizedSurface = WORKBENCH_INSPECTOR_PANELS[surface] ? surface : 'workspace'
  const allowedPanels = WORKBENCH_INSPECTOR_PANELS[normalizedSurface]
  if (allowedPanels.includes(panel)) return panel
  return DEFAULT_WORKBENCH_INSPECTOR_PANEL[normalizedSurface]
}
