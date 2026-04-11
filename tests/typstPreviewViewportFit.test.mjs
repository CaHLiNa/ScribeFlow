import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_TYPT_PREVIEW_FIT_REPAIR_THRESHOLD_PX,
  shouldRepairTypstPreviewFit,
} from '../src/services/typst/previewViewportFit.js'

test('shouldRepairTypstPreviewFit ignores empty or fully fitted previews', () => {
  assert.equal(shouldRepairTypstPreviewFit({ clientWidth: 0, scrollWidth: 800 }), false)
  assert.equal(shouldRepairTypstPreviewFit({ clientWidth: 800, scrollWidth: 800 }), false)
  assert.equal(
    shouldRepairTypstPreviewFit({
      clientWidth: 800,
      scrollWidth: 804,
      previewWidth: 805,
    }),
    false,
  )
})

test('shouldRepairTypstPreviewFit detects horizontal overflow from scroll width', () => {
  assert.equal(
    shouldRepairTypstPreviewFit({
      clientWidth: 800,
      scrollWidth: 840,
    }),
    true,
  )
})

test('shouldRepairTypstPreviewFit detects horizontal overflow from measured preview width', () => {
  assert.equal(
    shouldRepairTypstPreviewFit({
      clientWidth: 800,
      scrollWidth: 800,
      previewWidth: 821,
    }),
    true,
  )
})

test('shouldRepairTypstPreviewFit honors custom thresholds', () => {
  assert.equal(DEFAULT_TYPT_PREVIEW_FIT_REPAIR_THRESHOLD_PX > 0, true)
  assert.equal(
    shouldRepairTypstPreviewFit({
      clientWidth: 800,
      scrollWidth: 812,
    }, 16),
    false,
  )
})
