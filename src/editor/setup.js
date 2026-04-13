import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, rectangularSelection, crosshairCursor, Decoration, ViewPlugin } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput, foldGutter, foldKeymap, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { searchKeymap, SearchCursor } from '@codemirror/search'
import { shouldersTheme, shouldersHighlighting } from './theme'
import { buildEditorInputAttributes } from './contextMenuPolicy'
import { shouldHighlightSelectionMatches } from './selectionHighlightPolicy'

// Shared compartment for line wrapping - reconfigured when user toggles soft wrap
export const wrapCompartment = new Compartment()

// Shared compartment for wrap column width - constrains content to N characters
export const columnWidthCompartment = new Compartment()

const SELECTION_HIGHLIGHT_MAX_MATCHES = 100
const selectionMatchMark = Decoration.mark({ class: 'cm-selectionMatch' })

function buildSelectionMatchDecorations(view) {
  const { state } = view
  const selection = state.selection
  if (selection.ranges.length !== 1) return Decoration.none

  const range = selection.main
  if (range.empty) return Decoration.none

  const selectedText = state.sliceDoc(range.from, range.to)
  const shouldHighlight = shouldHighlightSelectionMatches({
    hasSelection: true,
    isSingleLine: !/[\r\n]/.test(selectedText),
    selectedTextLength: selectedText.length,
  })

  if (!shouldHighlight) return Decoration.none

  const decorations = []
  for (const visibleRange of view.visibleRanges) {
    const cursor = new SearchCursor(state.doc, selectedText, visibleRange.from, visibleRange.to)
    while (!cursor.next().done) {
      const { from, to } = cursor.value
      if (from >= range.to || to <= range.from) {
        decorations.push(selectionMatchMark.range(from, to))
      }
      if (decorations.length > SELECTION_HIGHLIGHT_MAX_MATCHES) {
        return Decoration.none
      }
    }
  }

  return decorations.length ? Decoration.set(decorations) : Decoration.none
}

function selectionMatchesLikeVSCode() {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = buildSelectionMatchDecorations(view)
    }

    update(update) {
      if (update.selectionSet || update.docChanged || update.viewportChanged) {
        this.decorations = buildSelectionMatchDecorations(update.view)
      }
    }
  }, {
    decorations: (plugin) => plugin.decorations,
  })
}

export function columnWidthExtension(col) {
  if (col > 0) {
    return EditorView.theme({ '.cm-content': { maxWidth: col + 'ch' } })
  }
  return []
}

/**
 * Create a debounced auto-save extension.
 * Calls `onSave(content)` 1 second after the last edit.
 */
function autoSaveExtension(onSave) {
  let timeout = null

  return EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        const content = update.view.state.doc.toString()
        onSave(content)
      }, 1000)
    }
  })
}

function documentChangeExtension(onDocChanged) {
  return EditorView.updateListener.of((update) => {
    if (!update.docChanged) return
    onDocChanged(update.state.doc.toString())
  })
}

/**
 * Create cursor position listener extension.
 * Calls `onCursorChange({ line, col })` when cursor moves.
 */
function cursorPositionExtension(onCursorChange) {
  return EditorView.updateListener.of((update) => {
    if (update.selectionSet || update.docChanged) {
      const pos = update.state.selection.main.head
      const line = update.state.doc.lineAt(pos)
      onCursorChange({
        line: line.number,
        col: pos - line.from + 1,
        offset: pos,
      })
    }
  })
}

/**
 * Create editor stats listener extension.
 * Reports word count, char count, and selection stats.
 */
function editorStatsExtension(onStats) {
  return EditorView.updateListener.of((update) => {
    if (update.docChanged || update.selectionSet || update.startState === update.state) {
      const text = update.state.doc.toString()
      const words = text.trim() ? text.trim().split(/\s+/).length : 0
      const chars = text.replace(/\s/g, '').length

      const sel = update.state.selection.main
      let selWords = 0
      let selChars = 0
      if (sel.from !== sel.to) {
        const selText = update.state.sliceDoc(sel.from, sel.to)
        selWords = selText.trim() ? selText.trim().split(/\s+/).length : 0
        selChars = selText.replace(/\s/g, '').length
      }

      onStats({ words, chars, selWords, selChars })
    }
  })
}

/**
 * Create the full set of CodeMirror extensions.
 * Pass a languageExtension for syntax highlighting (or null for plain text).
 */
export function createEditorExtensions({
  onSave,
  onDocChanged,
  onCursorChange,
  onStats,
  softWrap = true,
  wrapColumn = 0,
  languageExtension = null,
  extraExtensions = [],
  autoSaveEnabled = true,
}) {
  return [
    // Soft wrap (toggleable via compartment)
    wrapCompartment.of(softWrap ? EditorView.lineWrapping : []),

    // Wrap column width (constrains content to N chars when > 0)
    columnWidthCompartment.of(columnWidthExtension(wrapColumn)),

    // Keep browser-native text services off so the editor owns selection and context menu behavior.
    EditorView.contentAttributes.of(buildEditorInputAttributes()),

    // Core
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    rectangularSelection(),
    crosshairCursor(),
    selectionMatchesLikeVSCode(),

    // Language (dynamic — passed by caller)
    ...(languageExtension ? [languageExtension] : []),

    // Theme
    shouldersTheme,
    shouldersHighlighting,

    // Keymaps
    keymap.of([
      indentWithTab,
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
    ]),

    ...(onDocChanged ? [documentChangeExtension(onDocChanged)] : []),

    // Auto-save
    ...(onSave && autoSaveEnabled ? [autoSaveExtension(onSave)] : []),

    // Cursor tracking
    ...(onCursorChange ? [cursorPositionExtension(onCursorChange)] : []),

    // Editor stats (word count, char count, selection)
    ...(onStats ? [editorStatsExtension(onStats)] : []),

    // Extra extensions supplied by the caller.
    ...extraExtensions,
  ]
}

/**
 * Create a new CodeMirror EditorState with the given content and extensions.
 */
export function createEditorState(content, extensions) {
  return EditorState.create({
    doc: content,
    extensions,
  })
}
