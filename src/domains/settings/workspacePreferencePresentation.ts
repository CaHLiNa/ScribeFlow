const SYSTEM_FONT_PREFIX = 'system:'

export const DEFAULT_EDITOR_FONT_SIZE = 14
export const DEFAULT_UI_FONT_SIZE = 13
export const MIN_EDITOR_FONT_SIZE = 12
export const MAX_EDITOR_FONT_SIZE = 20
export const DEFAULT_PREFERRED_LOCALE = 'system'
export const DEFAULT_MARKDOWN_PREVIEW_SYNC = true
export const DEFAULT_EDITOR_SPELLCHECK = false
export const DEFAULT_EDITOR_LINE_NUMBERS = true
export const DEFAULT_EDITOR_HIGHLIGHT_ACTIVE_LINE = true
export const DEFAULT_FILE_TREE_SHOW_HIDDEN = true
export const DEFAULT_FILE_TREE_SORT_MODE = 'name'
export const DEFAULT_FILE_TREE_FOLD_DIRECTORIES = false
export const DEFAULT_PDF_VIEWER_ZOOM_MODE = 'page-width'
export const DEFAULT_PDF_VIEWER_SPREAD_MODE = 'single'
export const DEFAULT_PDF_VIEWER_LAST_SCALE = ''
export const DEFAULT_PDF_VIEWER_PAGE_THEME_MODE = 'theme'
export const DEFAULT_MARKDOWN_CITATION_FORMAT = 'bracketed'
export const DEFAULT_LATEX_CITATION_COMMAND = 'cite'
export const DEFAULT_CITATION_INSERT_ADDS_SPACE = false

export const PROSE_FONT_STACKS = {
  inter: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif",
  stix: "'New York', 'Times New Roman', Georgia, serif",
  mono: "'SF Mono', 'Menlo', 'Consolas', monospace",
}

export const SYSTEM_FONT_FALLBACK_STACK =
  "'PingFang SC', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif"

export const EDITOR_FONT_SIZE_PRESETS = [12, 13, 14, 15, 16, 18]
export const WORKSPACE_FONT_PRESETS = [
  { value: 'inter', labelKey: 'Sans' },
  { value: 'stix', labelKey: 'Serif' },
  { value: 'mono', labelKey: 'Mono' },
  { value: 'system', labelKey: 'System' },
]
export const FALLBACK_SYSTEM_FONT_FAMILIES = [
  'PingFang SC',
  'SF Pro Text',
  'New York',
  'Songti SC',
  'Kaiti SC',
  'Helvetica Neue',
  'Avenir Next',
  'Times New Roman',
  'Georgia',
  'Menlo',
]

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function createWorkspacePreferenceState() {
  return {
    primarySurface: 'workspace',
    leftSidebarOpen: true,
    leftSidebarPanel: 'files',
    rightSidebarOpen: false,
    rightSidebarPanel: 'dock',
    documentDockOpen: false,
    referenceDockOpen: false,
    documentDockActivePage: 'preview',
    referenceDockActivePage: 'details',
    autoSave: true,
    softWrap: true,
    wrapColumn: 0,
    editorFontSize: DEFAULT_EDITOR_FONT_SIZE,
    uiFontSize: DEFAULT_UI_FONT_SIZE,
    preferredLocale: DEFAULT_PREFERRED_LOCALE,
    markdownPreviewSync: DEFAULT_MARKDOWN_PREVIEW_SYNC,
    editorSpellcheck: DEFAULT_EDITOR_SPELLCHECK,
    editorLineNumbers: DEFAULT_EDITOR_LINE_NUMBERS,
    editorHighlightActiveLine: DEFAULT_EDITOR_HIGHLIGHT_ACTIVE_LINE,
    fileTreeShowHidden: DEFAULT_FILE_TREE_SHOW_HIDDEN,
    fileTreeSortMode: DEFAULT_FILE_TREE_SORT_MODE,
    fileTreeFoldDirectories: DEFAULT_FILE_TREE_FOLD_DIRECTORIES,
    uiFont: 'inter',
    markdownFont: 'inter',
    latexFont: 'mono',
    pdfViewerZoomMode: DEFAULT_PDF_VIEWER_ZOOM_MODE,
    pdfViewerSpreadMode: DEFAULT_PDF_VIEWER_SPREAD_MODE,
    pdfViewerLastScale: DEFAULT_PDF_VIEWER_LAST_SCALE,
    pdfViewerPageThemeMode: DEFAULT_PDF_VIEWER_PAGE_THEME_MODE,
    markdownCitationFormat: DEFAULT_MARKDOWN_CITATION_FORMAT,
    latexCitationCommand: DEFAULT_LATEX_CITATION_COMMAND,
    citationInsertAddsSpace: DEFAULT_CITATION_INSERT_ADDS_SPACE,
    theme: 'system',
  }
}

export function normalizeEditorFontSize(value) {
  const parsed = Math.round(Number(value) || DEFAULT_EDITOR_FONT_SIZE)
  return clamp(parsed, MIN_EDITOR_FONT_SIZE, MAX_EDITOR_FONT_SIZE)
}

export function normalizeWorkspacePdfViewerZoomMode(value) {
  switch (String(value || '').trim().toLowerCase()) {
    case 'page-fit':
      return 'page-fit'
    case 'remember-last':
      return 'remember-last'
    default:
      return DEFAULT_PDF_VIEWER_ZOOM_MODE
  }
}

export function normalizeWorkspacePdfViewerSpreadMode(value) {
  return String(value || '').trim().toLowerCase() === 'double'
    ? 'double'
    : DEFAULT_PDF_VIEWER_SPREAD_MODE
}

export function normalizeWorkspacePdfViewerLastScale(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return DEFAULT_PDF_VIEWER_LAST_SCALE
  if (['auto', 'page-fit', 'page-width'].includes(normalized)) return normalized
  const numeric = Number(normalized)
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_PDF_VIEWER_LAST_SCALE
  return String(Math.round(Math.min(numeric, 2) * 10000) / 10000)
}

export function encodeWorkspaceSystemFontFamily(family) {
  const normalized = String(family || '').trim()
  return normalized ? `${SYSTEM_FONT_PREFIX}${normalized}` : 'inter'
}

export function decodeWorkspaceSystemFontFamily(value) {
  const normalized = String(value || '').trim()
  if (!normalized.toLowerCase().startsWith(SYSTEM_FONT_PREFIX)) {
    return ''
  }
  return normalized.slice(SYSTEM_FONT_PREFIX.length).trim()
}

export function getWorkspaceFontKind(value, fallback = 'inter') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (PROSE_FONT_STACKS[normalized]) {
    return normalized
  }

  return decodeWorkspaceSystemFontFamily(value) ? 'system' : fallback
}

export function escapeCssFontFamily(value) {
  return `'${String(value || '')
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .trim()}'`
}

export function buildSystemFontStack(family) {
  const normalized = decodeWorkspaceSystemFontFamily(family) || String(family || '').trim()
  if (!normalized) {
    return PROSE_FONT_STACKS.inter
  }
  return `${escapeCssFontFamily(normalized)}, ${SYSTEM_FONT_FALLBACK_STACK}`
}

export function normalizeWorkspaceFont(value, fallback = 'inter') {
  const preset = String(value || '')
    .trim()
    .toLowerCase()

  if (PROSE_FONT_STACKS[preset]) {
    return preset
  }

  const systemFamily = decodeWorkspaceSystemFontFamily(value)
  return systemFamily ? encodeWorkspaceSystemFontFamily(systemFamily) : fallback
}
