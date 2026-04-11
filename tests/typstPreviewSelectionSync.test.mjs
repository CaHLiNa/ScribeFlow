import test from 'node:test'
import assert from 'node:assert/strict'

import {
  clearTypstSelectionPreviewSyncSuppression,
  DEFAULT_SUPPRESS_MS,
  shouldSuppressTypstSelectionPreviewSync,
  suppressTypstSelectionPreviewSync,
} from '../src/services/typst/previewSelectionSync.js'

test('typst preview selection sync suppression activates per file', () => {
  clearTypstSelectionPreviewSyncSuppression()
  suppressTypstSelectionPreviewSync('/workspace/main.typ')
  assert.equal(shouldSuppressTypstSelectionPreviewSync('/workspace/main.typ'), true)
  assert.equal(shouldSuppressTypstSelectionPreviewSync('/workspace/other.typ'), false)
})

test('typst preview selection sync suppression expires immediately when duration is zero', async () => {
  clearTypstSelectionPreviewSyncSuppression()
  suppressTypstSelectionPreviewSync('/workspace/main.typ', 0)
  await new Promise((resolve) => setTimeout(resolve, 1))
  assert.equal(shouldSuppressTypstSelectionPreviewSync('/workspace/main.typ'), false)
})

test('typst preview selection sync suppression exposes a positive default duration', () => {
  assert.equal(DEFAULT_SUPPRESS_MS > 0, true)
})
