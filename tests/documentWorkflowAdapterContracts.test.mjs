import test from 'node:test'
import assert from 'node:assert/strict'

import { markdownDocumentAdapter } from '../src/services/documentWorkflow/adapters/markdown.js'
import { latexDocumentAdapter } from '../src/services/documentWorkflow/adapters/latex.js'
import { typstDocumentAdapter } from '../src/services/documentWorkflow/adapters/typst.js'

test('document workflow adapter contracts keep markdown compile seam explicit', () => {
  assert.equal(markdownDocumentAdapter.compile, null)
})

test('document workflow adapter contracts expose preview target resolution through preview adapters', () => {
  const latexContext = {
    latexStore: {
      stateForFile() {
        return { pdfPath: '/workspace/main.pdf' }
      },
    },
  }
  const typstContext = {
    typstStore: {
      stateForFile() {
        return { pdfPath: '/workspace/main.pdf' }
      },
    },
  }

  assert.equal(
    latexDocumentAdapter.preview.getTargetPath('/workspace/main.tex', latexContext),
    '/workspace/main.pdf',
  )
  assert.equal(
    typstDocumentAdapter.preview.getTargetPath('/workspace/main.typ', typstContext),
    '/workspace/main.pdf',
  )
})

test('document workflow adapter contracts expose typst native preview support through preview seam', () => {
  const nativeContext = {
    typstStore: {
      liveStateForFile() {
        return { tinymistBacked: true }
      },
    },
  }
  const pdfOnlyContext = {
    typstStore: {
      liveStateForFile() {
        return { tinymistBacked: false }
      },
    },
  }

  assert.equal(typstDocumentAdapter.preview.isNativeSupported('/workspace/main.typ', nativeContext), true)
  assert.equal(typstDocumentAdapter.preview.isNativeSupported('/workspace/main.typ', pdfOnlyContext), false)
})
