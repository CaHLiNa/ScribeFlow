export const WORKSPACE_SIDEBAR_PANELS = ['files', 'references']
export const SETTINGS_SIDEBAR_PANELS = ['files']

export const WORKBENCH_SIDEBAR_PANELS = {
  workspace: WORKSPACE_SIDEBAR_PANELS,
  settings: SETTINGS_SIDEBAR_PANELS,
}

export const MAX_WORKBENCH_SIDEBAR_PANEL_COUNT = Math.max(
  ...Object.values(WORKBENCH_SIDEBAR_PANELS).map((panels) => panels.length)
)
