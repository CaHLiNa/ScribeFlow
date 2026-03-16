import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_SELECTION_HIGHLIGHT_MAX_LENGTH,
  shouldHighlightSelectionMatches,
} from '../src/editor/selectionHighlightPolicy.js'

test('disables selection matches for empty selections', () => {
  assert.equal(
    shouldHighlightSelectionMatches({
      hasSelection: false,
      isSingleLine: true,
      selectedTextLength: 10,
    }),
    false,
  )
})

test('enables selection matches for short single-line selections', () => {
  assert.equal(
    shouldHighlightSelectionMatches({
      hasSelection: true,
      isSingleLine: true,
      selectedTextLength: 10,
    }),
    true,
  )
})

test('disables selection matches for multi-line selections', () => {
  assert.equal(
    shouldHighlightSelectionMatches({
      hasSelection: true,
      isSingleLine: false,
      selectedTextLength: 10,
    }),
    false,
  )
})

test('disables selection matches for selections longer than the VS Code limit', () => {
  assert.equal(
    shouldHighlightSelectionMatches({
      hasSelection: true,
      isSingleLine: true,
      selectedTextLength: DEFAULT_SELECTION_HIGHLIGHT_MAX_LENGTH + 1,
    }),
    false,
  )
})
