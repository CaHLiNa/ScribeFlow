import {
  DEFAULT_UI_FONT_SIZE,
  PROSE_FONT_STACKS,
  buildSystemFontStack,
  normalizeEditorFontSize,
  normalizeWorkspaceFont,
} from '../domains/settings/workspacePreferencePresentation.js'

export function applyWorkspaceFontSizes(editorFontSize, uiFontSize) {
  if (typeof document === 'undefined') return

  document.documentElement.style.setProperty(
    '--editor-font-size',
    `${normalizeEditorFontSize(editorFontSize)}px`
  )
  document.documentElement.style.setProperty(
    '--ui-font-size',
    `${Math.max(1, Number(uiFontSize) || DEFAULT_UI_FONT_SIZE)}px`
  )
}

export function setWorkspaceEditorFontSize(editorFontSize) {
  const nextValue = normalizeEditorFontSize(editorFontSize)
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--editor-font-size', `${nextValue}px`)
  }
  return nextValue
}

function applyWorkspaceFontVariable(cssVariable, name, fallback = 'inter') {
  const nextFont = normalizeWorkspaceFont(name, fallback)
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty(
      cssVariable,
      PROSE_FONT_STACKS[nextFont] || buildSystemFontStack(nextFont)
    )
  }
  return nextFont
}

function syncMarkdownFontClass(name) {
  if (typeof document === 'undefined') return
  const normalized = String(name || '').toLowerCase()
  document.documentElement.classList.toggle('is-markdown-font-maple', normalized.includes('maple'))
}

export function setWorkspaceUiFont(name) {
  return applyWorkspaceFontVariable('--font-ui', name, 'inter')
}

export function setWorkspaceMarkdownFont(name) {
  const nextFont = applyWorkspaceFontVariable('--font-markdown', name, 'inter')
  syncMarkdownFontClass(nextFont)
  return nextFont
}

export function setWorkspaceLatexFont(name) {
  return applyWorkspaceFontVariable('--font-latex', name, 'mono')
}
