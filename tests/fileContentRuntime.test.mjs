import test from 'node:test'
import assert from 'node:assert/strict'

import { createFileContentRuntime } from '../src/domains/files/fileContentRuntime.js'

test('file content runtime reads text files into cache and records read failures', async () => {
  const fileContents = {}
  const fileLoadErrors = {}

  const runtime = createFileContentRuntime({
    readTextFile: async (path) => {
      if (path === '/ws/doc.md') throw new Error('boom')
      return '# notes'
    },
    isBinaryPath: (path) => path.endsWith('.png') || path.endsWith('.pdf'),
    setFileContent: (path, content) => {
      fileContents[path] = content
    },
    clearFileLoadError: (path) => {
      delete fileLoadErrors[path]
    },
    setFileLoadError: (path, error) => {
      fileLoadErrors[path] = error.message
    },
  })

  assert.equal(await runtime.readFile('/ws/note.md'), '# notes')
  assert.equal(fileContents['/ws/note.md'], '# notes')
  assert.equal(await runtime.readFile('/ws/output.pdf'), null)
  assert.equal(await runtime.readFile('/ws/image.png'), null)
  assert.equal(await runtime.readFile('/ws/doc.md'), null)
  assert.equal(fileLoadErrors['/ws/doc.md'], 'boom')
})

test('file content runtime saves content, clears read errors, and reports save failures through the callback', async () => {
  const fileContents = {}
  const fileLoadErrors = {
    '/ws/doc.md': 'old error',
  }
  const savedPaths = []
  const saveErrors = []
  let shouldFail = false

  const runtime = createFileContentRuntime({
    saveTextFile: async () => {
      if (shouldFail) throw new Error('write failed')
    },
    setFileContent: (path, content) => {
      fileContents[path] = content
    },
    clearFileLoadError: (path) => {
      delete fileLoadErrors[path]
    },
    syncSavedMarkdownLinks: (path) => {
      savedPaths.push(path)
    },
    onSaveError: (path, error) => {
      saveErrors.push({ path, message: error.message })
    },
  })

  assert.equal(await runtime.saveFile('/ws/doc.md', '# draft'), true)
  assert.equal(fileContents['/ws/doc.md'], '# draft')
  assert.equal(fileLoadErrors['/ws/doc.md'], undefined)
  assert.deepEqual(savedPaths, ['/ws/doc.md'])

  shouldFail = true
  assert.equal(await runtime.saveFile('/ws/doc.md', '# retry'), false)
  assert.deepEqual(saveErrors, [{
    path: '/ws/doc.md',
    message: 'write failed',
  }])
})
