import { EditorSelection } from '@codemirror/state'

export const EDITOR_INPUT_ATTRIBUTES = Object.freeze({
  autocomplete: 'off',
  autocapitalize: 'off',
  autocorrect: 'off',
  spellcheck: 'false',
})

export function buildEditorInputAttributes(options = {}) {
  return {
    ...EDITOR_INPUT_ATTRIBUTES,
    spellcheck: options.spellcheck === true ? 'true' : 'false',
  }
}

export function normalizeContextMenuClickPos(clickPos, lineRange) {
  if (typeof clickPos !== 'number') return null
  const from = typeof lineRange?.from === 'number' ? lineRange.from : null
  const to = typeof lineRange?.to === 'number' ? lineRange.to : null
  if (from === null || to === null) return clickPos
  if (clickPos < from) return from
  if (clickPos > to) return to
  return clickPos
}

function cloneSelection(selection) {
  return EditorSelection.create(
    selection.ranges.map((range) => EditorSelection.range(range.anchor, range.head)),
    selection.mainIndex,
  )
}

export function captureContextMenuState(state, pos) {
  const selection = cloneSelection(state.selection)
  const hasSelection = selection.ranges.some((range) => !range.empty)
  const clickPos = typeof pos === 'number' ? pos : null
  const clickedInsideSelection = clickPos !== null
    && selection.ranges.some((range) => range.from <= clickPos && clickPos <= range.to)

  return {
    selection,
    hasSelection,
    clickPos,
    clickedInsideSelection,
  }
}

export function resolveContextMenuSelection(contextMenuState) {
  const selection = contextMenuState?.selection || null
  const hasSelection = contextMenuState?.hasSelection === true
  const clickPos = typeof contextMenuState?.clickPos === 'number' ? contextMenuState.clickPos : null

  if (!selection) {
    return {
      hasSelection: false,
      nextSelection: null,
    }
  }

  if (contextMenuState.clickedInsideSelection) {
    return {
      hasSelection,
      nextSelection: selection,
    }
  }

  if (clickPos === null) {
    return {
      hasSelection,
      nextSelection: selection,
    }
  }

  return {
    hasSelection: false,
    nextSelection: EditorSelection.create([EditorSelection.cursor(clickPos)]),
  }
}
