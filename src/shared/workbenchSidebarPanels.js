export const WORKSPACE_SIDEBAR_PANELS = ['files', 'references']
export const LIBRARY_SIDEBAR_PANELS = ['library-views', 'library-tags']
export const AI_SIDEBAR_PANELS = ['ai-chats']

export const WORKBENCH_SIDEBAR_PANELS = {
  workspace: WORKSPACE_SIDEBAR_PANELS,
  library: LIBRARY_SIDEBAR_PANELS,
  ai: AI_SIDEBAR_PANELS,
}

export const MAX_WORKBENCH_SIDEBAR_PANEL_COUNT = Math.max(
  ...Object.values(WORKBENCH_SIDEBAR_PANELS).map((panels) => panels.length)
)

export const DEFAULT_WORKBENCH_SIDEBAR_PANEL = {
  workspace: 'files',
  library: 'library-views',
  ai: 'ai-chats',
}

export const ALL_WORKBENCH_SIDEBAR_PANELS = [
  ...WORKSPACE_SIDEBAR_PANELS,
  ...LIBRARY_SIDEBAR_PANELS,
  ...AI_SIDEBAR_PANELS,
]

export function normalizeWorkbenchSurface(surface = 'workspace') {
  if (surface === 'library' || surface === 'ai') return surface
  return 'workspace'
}

export function normalizeWorkbenchSidebarPanel(surface = 'workspace', panel = '') {
  const normalizedSurface = normalizeWorkbenchSurface(surface)
  const allowedPanels = WORKBENCH_SIDEBAR_PANELS[normalizedSurface] || WORKSPACE_SIDEBAR_PANELS
  if (allowedPanels.includes(panel)) return panel
  return DEFAULT_WORKBENCH_SIDEBAR_PANEL[normalizedSurface]
}
