import test from 'node:test'
import assert from 'node:assert/strict'

import { createDocumentWorkflowBuildRuntime } from '../src/domains/document/documentWorkflowBuildRuntime.js'

function createAdapter(overrides = {}) {
  return {
    kind: 'markdown',
    preview: {
      defaultKind: 'html',
      supportedKinds: ['html'],
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

test('build runtime keeps latex source-only even when a compiled output exists', () => {
  const adapter = createAdapter({
    kind: 'latex',
    preview: {
      defaultKind: null,
      supportedKinds: [],
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
  assert.equal(context.previewState.previewVisible, false)
  assert.equal(context.previewState.previewKind, null)
  assert.equal(context.previewState.reason, 'artifact-ready-external')
  assert.equal(context.previewTargetPath, '/workspace/build/paper.pdf')
  assert.equal(context.targetResolution, 'resolved')
  assert.equal(context.artifactReady, true)
})

test('build runtime keeps typst native preview inside the workspace when supported', () => {
  const adapter = createAdapter({
    kind: 'typst',
    preview: {
      defaultKind: 'native',
      supportedKinds: ['native'],
      getTargetPath() {
        return ''
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
  assert.equal(context.nativePreviewSupported, true)
  assert.equal(context.artifactReady, true)
})

test('build runtime keeps typst source-only when native preview is unavailable', () => {
  const adapter = createAdapter({
    kind: 'typst',
    preview: {
      defaultKind: 'native',
      supportedKinds: ['native'],
      getTargetPath() {
        return ''
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

  assert.equal(context.previewState.previewVisible, false)
  assert.equal(context.previewState.previewKind, null)
  assert.equal(context.previewState.reason, 'artifact-ready-external')
  assert.equal(context.previewTargetPath, '')
  assert.equal(context.targetResolution, 'resolved')
  assert.equal(context.nativePreviewSupported, false)
  assert.equal(context.artifactReady, true)
})

test('build runtime normalizes stale pdf preview preferences back to supported typst preview kinds', () => {
  const adapter = createAdapter({
    kind: 'typst',
    preview: {
      defaultKind: 'native',
      supportedKinds: ['native', 'pdf'],
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
    workflowStore: {
      session: {
        activeFile: '/workspace/paper.typ',
        previewKind: 'pdf',
      },
      getPreferredPreviewKind() {
        return 'native'
      },
      isWorkspacePreviewHiddenForFile() {
        return false
      },
    },
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

  assert.equal(context.previewKind, 'native')
  assert.equal(context.previewState.previewMode, 'typst-native')
})

test('build runtime keeps typst pdf preview only while an explicit workspace request is active', () => {
  const adapter = createAdapter({
    kind: 'typst',
    preview: {
      defaultKind: 'native',
      supportedKinds: ['native', 'pdf'],
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
    workflowStore: {
      session: {
        activeFile: '/workspace/paper.typ',
        previewSourcePath: '/workspace/paper.typ',
        previewKind: 'pdf',
        state: 'workspace-preview',
      },
      getPreferredPreviewKind() {
        return 'native'
      },
      getWorkspacePreviewRequestForFile(filePath) {
        return filePath === '/workspace/paper.typ' ? 'pdf' : null
      },
      isWorkspacePreviewHiddenForFile() {
        return false
      },
    },
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

  assert.equal(context.previewKind, 'pdf')
  assert.equal(context.previewState.previewMode, 'pdf-artifact')
  assert.equal(context.previewState.previewTargetPath, '/workspace/build/paper.pdf')
})
