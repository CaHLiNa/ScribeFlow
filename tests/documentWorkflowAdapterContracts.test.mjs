import test from 'node:test'
import assert from 'node:assert/strict'

import { markdownDocumentAdapter } from '../src/services/documentWorkflow/adapters/markdown.js'
import { latexDocumentAdapter } from '../src/services/documentWorkflow/adapters/latex.js'
import { typstDocumentAdapter } from '../src/services/documentWorkflow/adapters/typst.js'

test('document workflow adapter contracts keep markdown compile seam explicit', () => {
  assert.equal(markdownDocumentAdapter.compile, null)
})

test('document workflow adapter contracts resolve compile artifact paths through compile adapters', () => {
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
    latexDocumentAdapter.compile.getArtifactPath('/workspace/main.tex', latexContext),
    '/workspace/main.pdf'
  )
  assert.equal(
    typstDocumentAdapter.compile.getArtifactPath('/workspace/main.typ', typstContext),
    '/workspace/main.pdf'
  )
})

test('document workflow adapter contracts keep latex pdf preview and typst native support explicit', () => {
  const nativeContext = {
    typstStore: {
      liveStateForFile() {
        return { tinymistBacked: true }
      },
    },
  }
  const sourceOnlyContext = {
    typstStore: {
      liveStateForFile() {
        return { tinymistBacked: false }
      },
    },
  }

  assert.deepEqual(latexDocumentAdapter.preview.supportedKinds, ['pdf'])
  assert.equal(latexDocumentAdapter.preview.defaultKind, null)
  assert.equal(
    typstDocumentAdapter.preview.isNativeSupported('/workspace/main.typ', nativeContext),
    true
  )
  assert.equal(
    typstDocumentAdapter.preview.isNativeSupported('/workspace/main.typ', sourceOnlyContext),
    false
  )
})
