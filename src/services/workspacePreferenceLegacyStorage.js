import { clearStorageKeys, readStorageSnapshot } from './bridgeStorage.js'

const LEGACY_WORKSPACE_PREFERENCE_KEYS = [
  'primarySurface',
  'leftSidebarOpen',
  'leftSidebarPanel',
  'rightSidebarOpen',
  'rightSidebarPanel',
  'autoSave',
  'softWrap',
  'wrapColumn',
  'editorFontSize',
  'uiFontSize',
  'preferredLocale',
  'markdownPreviewSync',
  'editorSpellcheck',
  'editorLineNumbers',
  'editorHighlightActiveLine',
  'fileTreeShowHidden',
  'fileTreeSortMode',
  'fileTreeFoldDirectories',
  'uiFont',
  'markdownFont',
  'latexFont',
  'proseFont',
  'pdfViewerZoomMode',
  'pdfViewerSpreadMode',
  'pdfViewerLastScale',
  'pdfViewerPageThemeMode',
  'markdownCitationFormat',
  'latexCitationCommand',
  'citationInsertAddsSpace',
  'pdfCustomPageForegroundMode',
  'pdfCustomPageForeground',
  'theme',
]

export function readLegacyWorkspacePreferenceSnapshot() {
  return readStorageSnapshot(LEGACY_WORKSPACE_PREFERENCE_KEYS)
}

export function clearLegacyWorkspacePreferenceStorage() {
  clearStorageKeys(LEGACY_WORKSPACE_PREFERENCE_KEYS)
}
