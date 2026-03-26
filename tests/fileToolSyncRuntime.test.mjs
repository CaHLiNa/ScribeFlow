import test from 'node:test'
import assert from 'node:assert/strict'

import { createFileToolSyncRuntime } from '../src/domains/files/fileToolSyncRuntime.js'

test('file tool sync runtime updates in-memory content without forcing editor focus', () => {
  const synced = []
  const opened = []
  const runtime = createFileToolSyncRuntime({
    setInMemoryFileContent: (path, content) => synced.push({ path, content }),
    openFile: (path) => opened.push(path),
  })

  assert.equal(runtime.syncTextFile('/ws/main.tex', '\\documentclass{article}'), true)
  assert.deepEqual(synced, [{
    path: '/ws/main.tex',
    content: '\\documentclass{article}',
  }])
  assert.deepEqual(opened, [])
})

test('file tool sync runtime can also reveal the updated file in the editor when requested', () => {
  const synced = []
  const opened = []
  const runtime = createFileToolSyncRuntime({
    setInMemoryFileContent: (path, content) => synced.push({ path, content }),
    openFile: (path) => opened.push(path),
  })

  assert.equal(runtime.syncTextFile('/ws/main.tex', '\\documentclass{article}', {
    openInEditor: true,
  }), true)
  assert.deepEqual(synced, [{
    path: '/ws/main.tex',
    content: '\\documentclass{article}',
  }])
  assert.deepEqual(opened, ['/ws/main.tex'])
})

test('file tool sync runtime ignores invalid text sync requests', () => {
  const synced = []
  const opened = []
  const runtime = createFileToolSyncRuntime({
    setInMemoryFileContent: (path, content) => synced.push({ path, content }),
    openFile: (path) => opened.push(path),
  })

  assert.equal(runtime.syncTextFile('', 'content'), false)
  assert.equal(runtime.syncTextFile('/ws/main.tex', null), false)
  assert.deepEqual(synced, [])
  assert.deepEqual(opened, [])
})
