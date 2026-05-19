export const WORKSPACE_INSPECTOR_PANELS = ['dock']
export const SETTINGS_INSPECTOR_PANELS = []

export const WORKBENCH_INSPECTOR_PANELS = {
  workspace: WORKSPACE_INSPECTOR_PANELS,
  settings: SETTINGS_INSPECTOR_PANELS,
}

export const MAX_WORKBENCH_INSPECTOR_PANEL_COUNT = Math.max(
  ...Object.values(WORKBENCH_INSPECTOR_PANELS).map((panels) => panels.length)
)
