import test from 'node:test'
import assert from 'node:assert/strict'

import { createDocumentWorkflowBuildRuntime } from '../src/domains/document/documentWorkflowBuildRuntime.js'

function createAdapter(overrides = {}) {
  return {
    kind: 'markdown',
    preview: {
      defaultKind: 'html',
      getTargetPath() {
        return ''
      },
      isNativeSupported() {
        return true
      },
      ...(overrides.preview || {}),
    },
    compile: {
      getArtifactPath(filePath) {
        return filePath
      },
      getStatusText() {
        return ''
      },
      ...(overrides.compile || {}),
    },
    getProblems() {
      return []
    },
    getUiState(_filePath, context = {}) {
      return {
        kind: overrides.kind || 'markdown',
        previewKind: context.previewKind || 'html',
        phase: 'ready',
      }
    },
    ...overrides,
  }
}

function createRuntime({ workflowStore, latexStore, typstStore } = {}) {
  return createDocumentWorkflowBuildRuntime({
    getWorkflowStore: () => workflowStore || null,
    getLatexStore: () => latexStore || null,
    getTypstStore: () => typstStore || null,
  })
}

test('build runtime exposes a visible latex workspace preview when a compiled pdf exists', () => {
  const adapter = createAdapter({
    kind: 'latex',
    preview: {
      defaultKind: 'pdf',
      getTargetPath() {
        return '/workspace/build/paper.pdf'
      },
    },
    compile: {
      getArtifactPath() {
        return '/workspace/build/paper.pdf'
      },
    },
  })
  const runtime = createRuntime({
    latexStore: {
      stateForFile() {
        return { pdfPath: '/workspace/build/paper.pdf' }
      },
    },
  })

  const context = runtime.buildAdapterContext('/workspace/paper.tex', {
    adapter,
    workflowOnly: false,
  })

  assert.equal(context.previewState.useWorkspace, true)
  assert.equal(context.previewState.previewVisible, true)
  assert.equal(context.previewState.previewKind, 'pdf')
  assert.equal(context.previewState.previewMode, 'pdf')
  assert.equal(context.previewTargetPath, '/workspace/build/paper.pdf')
  assert.equal(context.targetResolution, 'resolved')
  assert.equal(context.workspacePreviewState, context.previewState)
})

test('build runtime keeps typst native preview inside the workspace when supported', () => {
  const adapter = createAdapter({
    kind: 'typst',
    preview: {
      defaultKind: 'native',
      getTargetPath() {
        return '/workspace/build/paper.pdf'
      },
      isNativeSupported() {
        return true
      },
    },
    compile: {
      getArtifactPath() {
        return '/workspace/build/paper.pdf'
      },
    },
  })
  const runtime = createRuntime({
    typstStore: {
      stateForFile() {
        return { pdfPath: '/workspace/build/paper.pdf' }
      },
    },
  })

  const context = runtime.buildAdapterContext('/workspace/paper.typ', {
    adapter,
    workflowOnly: false,
  })

  assert.equal(context.previewState.previewVisible, true)
  assert.equal(context.previewState.previewKind, 'native')
  assert.equal(context.previewState.previewMode, 'typst-native')
  assert.equal(context.previewTargetPath, '')
  assert.equal(context.targetResolution, 'not-needed')
})

test('build runtime falls back to typst pdf preview when native preview is unavailable', () => {
  const adapter = createAdapter({
    kind: 'typst',
    preview: {
      defaultKind: 'native',
      getTargetPath() {
        return '/workspace/build/paper.pdf'
      },
      isNativeSupported() {
        return false
      },
    },
    compile: {
      getArtifactPath() {
        return '/workspace/build/paper.pdf'
      },
    },
  })
  const runtime = createRuntime({
    typstStore: {
      stateForFile() {
        return { pdfPath: '/workspace/build/paper.pdf' }
      },
    },
  })

  const context = runtime.buildAdapterContext('/workspace/paper.typ', {
    adapter,
    workflowOnly: false,
  })

  assert.equal(context.previewState.previewVisible, true)
  assert.equal(context.previewState.previewKind, 'pdf')
  assert.equal(context.previewState.previewMode, 'pdf')
  assert.equal(context.previewTargetPath, '/workspace/build/paper.pdf')
  assert.equal(context.targetResolution, 'resolved')
})

test('build runtime respects user-hidden workspace previews while keeping the resolved target around', () => {
  const adapter = createAdapter({
    kind: 'latex',
    preview: {
      defaultKind: 'pdf',
      getTargetPath() {
        return '/workspace/build/paper.pdf'
      },
    },
    compile: {
      getArtifactPath() {
        return '/workspace/build/paper.pdf'
      },
    },
  })
  const runtime = createRuntime({
    workflowStore: {
      isWorkspacePreviewHiddenForFile(filePath) {
        return filePath === '/workspace/paper.tex'
      },
    },
    latexStore: {
      stateForFile() {
        return { pdfPath: '/workspace/build/paper.pdf' }
      },
    },
  })

  const context = runtime.buildAdapterContext('/workspace/paper.tex', {
    adapter,
    workflowOnly: false,
  })

  assert.equal(context.previewState.previewVisible, false)
  assert.equal(context.previewState.previewMode, null)
  assert.equal(context.previewState.reason, 'hidden-by-user')
  assert.equal(context.previewTargetPath, '/workspace/build/paper.pdf')
  assert.equal(context.targetResolution, 'resolved')
})
