import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTypstPreviewStartArgs,
  clearPendingTypstForwardSync,
  peekPendingTypstForwardSync,
  PENDING_FORWARD_SYNC_TTL_MS,
  rememberPendingTypstForwardSync,
  shouldRecoverTypstPreviewStart,
} from '../src/services/typst/previewSync.js'

test('typst preview start args align native preview defaults with tinymist preview settings', () => {
  assert.deepEqual(buildTypstPreviewStartArgs('/workspace/main.typ'), [
    '--task-id',
    'altals-typst-preview-sync',
    '--data-plane-host',
    '127.0.0.1:0',
    '--preview-mode',
    'document',
    '--partial-rendering',
    'true',
    '--invert-colors',
    'auto',
    '/workspace/main.typ',
  ])
})

test('typst preview start args return empty args when root is missing', () => {
  assert.deepEqual(buildTypstPreviewStartArgs(''), [])
})

test('typst preview start args support slide mode and non-primary tasks when requested', () => {
  assert.deepEqual(buildTypstPreviewStartArgs('/workspace/slides.typ', {
    taskId: 'slides-preview',
    dataPlaneHost: '127.0.0.1:24567',
    previewMode: 'slide',
    partialRendering: false,
    invertColors: 'never',
    notPrimary: true,
  }), [
    '--task-id',
    'slides-preview',
    '--data-plane-host',
    '127.0.0.1:24567',
    '--preview-mode',
    'slide',
    '--partial-rendering',
    'false',
    '--invert-colors',
    'never',
    '--not-primary',
    '/workspace/slides.typ',
  ])
})

test('typst preview start args keep a stable single-task id for the app background preview', () => {
  const args = buildTypstPreviewStartArgs('/workspace/main.typ')
  const taskIdIndex = args.indexOf('--task-id')
  assert.notEqual(taskIdIndex, -1)
  assert.equal(args[taskIdIndex + 1], 'altals-typst-preview-sync')
})

test('typst preview start recovery recognizes compiler preview registration conflicts', () => {
  assert.equal(
    shouldRecoverTypstPreviewStart(new Error('cannot register preview to the compiler instance')),
    true,
  )
  assert.equal(
    shouldRecoverTypstPreviewStart('failed to register background preview to the primary instance'),
    true,
  )
  assert.equal(
    shouldRecoverTypstPreviewStart(new Error('Tinymist preview did not expose a valid data plane port')),
    false,
  )
})

test('pending typst forward sync stays available briefly for source-driven preview reveals', () => {
  clearPendingTypstForwardSync()
  const originalNow = Date.now
  try {
    Date.now = () => 100
    rememberPendingTypstForwardSync({
      sourcePath: '/workspace/main.typ',
      rootPath: '/workspace/main.typ',
      line: 12,
      character: 4,
    })

    Date.now = () => 100 + PENDING_FORWARD_SYNC_TTL_MS - 1
    assert.deepEqual(
      peekPendingTypstForwardSync('/workspace/main.typ'),
      {
        sourcePath: '/workspace/main.typ',
        rootPath: '/workspace/main.typ',
        line: 12,
        character: 4,
        createdAt: 100,
      },
    )
  } finally {
    Date.now = originalNow
    clearPendingTypstForwardSync()
  }
})

test('stale pending typst forward sync expires instead of reopening the preview at an old cursor location', () => {
  clearPendingTypstForwardSync()
  const originalNow = Date.now
  try {
    Date.now = () => 200
    rememberPendingTypstForwardSync({
      sourcePath: '/workspace/main.typ',
      rootPath: '/workspace/main.typ',
      line: 0,
      character: 0,
    })

    Date.now = () => 200 + PENDING_FORWARD_SYNC_TTL_MS + 1
    assert.equal(peekPendingTypstForwardSync('/workspace/main.typ'), null)
  } finally {
    Date.now = originalNow
    clearPendingTypstForwardSync()
  }
})
