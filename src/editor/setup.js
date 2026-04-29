import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, rectangularSelection, crosshairCursor, Decoration, ViewPlugin } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput, foldKeymap } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { searchKeymap, SearchCursor } from '@codemirror/search'
import { shouldersTheme, shouldersHighlighting } from './theme'
import { buildEditorInputAttributes } from './contextMenuPolicy'
import { shouldHighlightSelectionMatches } from './selectionHighlightPolicy'
import { createFoldGutterExtension } from './foldGutterRuntime'

// Shared compartment for line wrapping - reconfigured when user toggles soft wrap
export const wrapCompartment = new Compartment()

// Shared compartment for wrap column width - constrains content to N characters
export const columnWidthCompartment = new Compartment()
export const editorInputAttributesCompartment = new Compartment()
export const lineNumbersCompartment = new Compartment()
export const activeLineCompartment = new Compartment()

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
    return EditorView.theme({ '&': { '--editor-wrap-column': col + 'ch' } })
  }
  return []
}

export function editorInputAttributesExtension(options = {}) {
  return EditorView.contentAttributes.of(buildEditorInputAttributes(options))
}

export function lineNumbersExtension(showLineNumbers = true) {
  return showLineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []
}

export function activeLineExtension(enabled = true) {
  return enabled ? [highlightActiveLine()] : []
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
    // Pass a getter to defer O(n) toString() until actually needed
    // (the handler debounces the expensive Pinia update).
    onDocChanged(update.view.state.doc)
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
 * Uses incremental Text API instead of full toString() for performance.
 */
function editorStatsExtension(onStats) {
  let debounceTimer = null

  function computeStats(state) {
    const doc = state.doc
    let words = 0
    let chars = 0
    let inWord = false

    for (let i = 1; i <= doc.lines; i++) {
      const lineText = doc.line(i).text
      for (let j = 0; j < lineText.length; j++) {
        const ch = lineText.charCodeAt(j)
        const isSpace = ch === 32 || ch === 9 || ch === 10 || ch === 13
        if (isSpace) {
          inWord = false
        } else {
          chars++
          if (!inWord) {
            words++
            inWord = true
          }
        }
      }
      // Newline between lines counts as whitespace
      if (i < doc.lines) inWord = false
    }

    const sel = state.selection.main
    let selWords = 0
    let selChars = 0
    if (sel.from !== sel.to) {
      const selText = state.sliceDoc(sel.from, sel.to)
      let selInWord = false
      for (let j = 0; j < selText.length; j++) {
        const ch = selText.charCodeAt(j)
        const isSpace = ch === 32 || ch === 9 || ch === 10 || ch === 13
        if (isSpace) {
          selInWord = false
        } else {
          selChars++
          if (!selInWord) {
            selWords++
            selInWord = true
          }
        }
      }
    }

    return { words, chars, selWords, selChars }
  }

  return EditorView.updateListener.of((update) => {
    if (update.docChanged || update.selectionSet || update.startState === update.state) {
      // Debounce doc-changed stats to avoid O(n) work on every keystroke.
      // Selection-only changes are cheap enough to run immediately.
      if (update.docChanged) {
        clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          onStats(computeStats(update.view.state))
        }, 200)
      } else {
        onStats(computeStats(update.state))
      }
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
  readOnly = false,
  softWrap = true,
  wrapColumn = 0,
  spellcheckEnabled = false,
  showLineNumbers = true,
  highlightActiveLineEnabled = true,
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
    editorInputAttributesCompartment.of(
      editorInputAttributesExtension({ spellcheck: spellcheckEnabled })
    ),

    // Core
    lineNumbersCompartment.of(lineNumbersExtension(showLineNumbers)),
    activeLineCompartment.of(activeLineExtension(highlightActiveLineEnabled)),
    history(),
    createFoldGutterExtension(),
    drawSelection(),
    dropCursor(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    rectangularSelection(),
    crosshairCursor(),
    selectionMatchesLikeVSCode(),
    ...(readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []),

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
