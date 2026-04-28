const PROSE_FONT_STACKS = {
  inter: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif",
  stix: "'New York', 'Times New Roman', Georgia, serif",
  mono: "'SF Mono', 'Menlo', 'Consolas', monospace",
}

const SYSTEM_FONT_PREFIX = 'system:'
const SYSTEM_FONT_FALLBACK_STACK =
  "'PingFang SC', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif"

const DEFAULT_EDITOR_FONT_SIZE = 14
const DEFAULT_UI_FONT_SIZE = 13
const MIN_EDITOR_FONT_SIZE = 12
const MAX_EDITOR_FONT_SIZE = 20
const DEFAULT_PREFERRED_LOCALE = 'system'
const DEFAULT_MARKDOWN_PREVIEW_SYNC = true
const DEFAULT_EDITOR_SPELLCHECK = false
const DEFAULT_EDITOR_LINE_NUMBERS = true
const DEFAULT_EDITOR_HIGHLIGHT_ACTIVE_LINE = true
const DEFAULT_FILE_TREE_SHOW_HIDDEN = true
const DEFAULT_FILE_TREE_SORT_MODE = 'name'
const DEFAULT_FILE_TREE_FOLD_DIRECTORIES = false
const DEFAULT_PDF_VIEWER_ZOOM_MODE = 'page-width'
const DEFAULT_PDF_VIEWER_SPREAD_MODE = 'single'
const DEFAULT_PDF_VIEWER_LAST_SCALE = ''
const DEFAULT_PDF_VIEWER_PAGE_THEME_MODE = 'theme'
const DEFAULT_MARKDOWN_CITATION_FORMAT = 'bracketed'
const DEFAULT_LATEX_CITATION_COMMAND = 'cite'
const DEFAULT_CITATION_INSERT_ADDS_SPACE = false

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

function escapeCssFontFamily(value) {
  return `'${String(value || '')
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .trim()}'`
}

function buildSystemFontStack(family) {
  const normalized = decodeWorkspaceSystemFontFamily(family) || String(family || '').trim()
  if (!normalized) {
    return PROSE_FONT_STACKS.inter
  }
  return `${escapeCssFontFamily(normalized)}, ${SYSTEM_FONT_FALLBACK_STACK}`
}

function normalizeWorkspaceFont(value, fallback = 'inter') {
  const preset = String(value || '')
    .trim()
    .toLowerCase()

  if (PROSE_FONT_STACKS[preset]) {
    return preset
  }

  const systemFamily = decodeWorkspaceSystemFontFamily(value)
  return systemFamily ? encodeWorkspaceSystemFontFamily(systemFamily) : fallback
}

export function normalizeWorkspaceThemePreference(value) {
  switch (String(value || '').trim().toLowerCase()) {
    case 'light':
    case 'solarized':
    case 'humane':
    case 'one-light':
      return 'light'
    case 'dark':
    case 'default':
    case 'dracula':
    case 'monokai':
    case 'nord':
      return 'dark'
    case 'system':
    default:
      return 'system'
  }
}

export function createWorkspacePreferenceState() {
  return {
    primarySurface: 'workspace',
    leftSidebarOpen: true,
    leftSidebarPanel: 'files',
    rightSidebarOpen: false,
    rightSidebarPanel: 'outline',
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

export function normalizeWorkspaceUiFontSize(value) {
  return Math.max(1, Number(value) || DEFAULT_UI_FONT_SIZE)
}

export function normalizeWorkspacePreferredLocale(value) {
  switch (String(value || '').trim().toLowerCase()) {
    case 'zh':
    case 'zh-cn':
      return 'zh-CN'
    case 'en':
    case 'en-us':
      return 'en-US'
    default:
      return DEFAULT_PREFERRED_LOCALE
  }
}

export function normalizeWorkspaceFileTreeSortMode(value) {
  return String(value || '').trim().toLowerCase() === 'modified'
    ? 'modified'
    : DEFAULT_FILE_TREE_SORT_MODE
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

export function normalizeWorkspacePdfViewerPageThemeMode(value) {
  return String(value || '').trim().toLowerCase() === 'light'
    ? 'light'
    : DEFAULT_PDF_VIEWER_PAGE_THEME_MODE
}

export function normalizeWorkspaceMarkdownCitationFormat(value) {
  return String(value || '').trim().toLowerCase() === 'bare'
    ? 'bare'
    : DEFAULT_MARKDOWN_CITATION_FORMAT
}

export function normalizeWorkspaceLatexCitationCommand(value) {
  switch (String(value || '').trim().toLowerCase()) {
    case 'citep':
    case 'citet':
    case 'parencite':
    case 'textcite':
    case 'autocite':
      return String(value || '').trim().toLowerCase()
    default:
      return DEFAULT_LATEX_CITATION_COMMAND
  }
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

export function resolveWorkspaceFontCssValue(name, fallback = 'inter') {
  const font = normalizeWorkspaceFont(name, fallback)
  return {
    font,
    cssValue: PROSE_FONT_STACKS[font] || buildSystemFontStack(font),
  }
}

export function setWrapColumnPreference(value) {
  return Math.max(0, parseInt(value, 10) || 0)
}

export function setWorkspaceMarkdownPreviewSync(value) {
  return value !== false
}

export function setWorkspaceEditorSpellcheck(value) {
  return value === true
}

export function setWorkspaceEditorLineNumbers(value) {
  return value !== false
}

export function setWorkspaceEditorHighlightActiveLine(value) {
  return value !== false
}

export function setWorkspaceFileTreeShowHidden(value) {
  return value !== false
}

export function setWorkspaceFileTreeSortMode(value) {
  return normalizeWorkspaceFileTreeSortMode(value)
}

export function setWorkspaceFileTreeFoldDirectories(value) {
  return value === true
}

export function setWorkspacePdfViewerZoomMode(value) {
  return normalizeWorkspacePdfViewerZoomMode(value)
}

export function setWorkspacePdfViewerSpreadMode(value) {
  return normalizeWorkspacePdfViewerSpreadMode(value)
}

export function setWorkspacePdfViewerLastScale(value) {
  return normalizeWorkspacePdfViewerLastScale(value)
}

export function setWorkspacePdfViewerPageThemeMode(value) {
  return normalizeWorkspacePdfViewerPageThemeMode(value)
}

export function setWorkspaceMarkdownCitationFormat(value) {
  return normalizeWorkspaceMarkdownCitationFormat(value)
}

export function setWorkspaceLatexCitationCommand(value) {
  return normalizeWorkspaceLatexCitationCommand(value)
}

export function setWorkspaceCitationInsertAddsSpace(value) {
  return value === true
}

export function setWorkspacePreferredLocale(preferredLocale) {
  return normalizeWorkspacePreferredLocale(preferredLocale)
}
