export const WORKSPACE_INSPECTOR_PANELS = ['outline', 'backlinks', 'document-run']
export const CONVERSION_INSPECTOR_PANELS = []
export const LIBRARY_INSPECTOR_PANELS = ['library-details']
export const AI_INSPECTOR_PANELS = []

export const WORKBENCH_INSPECTOR_PANELS = {
  workspace: WORKSPACE_INSPECTOR_PANELS,
  conversion: CONVERSION_INSPECTOR_PANELS,
  library: LIBRARY_INSPECTOR_PANELS,
  ai: AI_INSPECTOR_PANELS,
}

export const DEFAULT_WORKBENCH_INSPECTOR_PANEL = {
  workspace: 'outline',
  conversion: '',
  library: 'library-details',
  ai: '',
}

export const ALL_WORKBENCH_INSPECTOR_PANELS = [
  ...WORKSPACE_INSPECTOR_PANELS,
  ...LIBRARY_INSPECTOR_PANELS,
]

export const MAX_WORKBENCH_INSPECTOR_PANEL_COUNT = Math.max(
  ...Object.values(WORKBENCH_INSPECTOR_PANELS).map((panels) => panels.length)
)

export function normalizeWorkbenchInspectorPanel(surface = 'workspace', panel = '') {
  const allowedPanels = WORKBENCH_INSPECTOR_PANELS[surface] || WORKSPACE_INSPECTOR_PANELS
  if (allowedPanels.includes(panel)) return panel
  return DEFAULT_WORKBENCH_INSPECTOR_PANEL[surface] || ''
}
