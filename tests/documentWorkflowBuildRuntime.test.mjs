import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createDocumentWorkflowBuildRuntime,
  getDocumentWorkflowStatusTone,
} from '../src/domains/document/documentWorkflowBuildRuntime.js'

function createBuildRuntime(overrides = {}) {
  const workflowStore = {
    session: {
      activeFile: null,
      previewKind: null,
    },
    markdownPreviewState: {},
    getPreferredPreviewKind(kind) {
      if (kind === 'latex') return 'pdf'
      if (kind === 'typst') return 'native'
      if (kind === 'markdown') return 'html'
      return null
    },
    hasPreviewForSource() {
      return false
    },
    ...overrides.workflowStore,
  }

  const latexStore = {
    openCompileLogCalls: [],
    stateForFile() {
      return null
    },
    queueStateForFile() {
      return null
    },
    lintDiagnosticsForFile() {
      return []
    },
    buildRecipeLabelFor(value) {
      return value
    },
    openCompileLog(filePath) {
      this.openCompileLogCalls.push(filePath)
    },
    ...overrides.latexStore,
  }

  const typstStore = {
    openCompileLogCalls: [],
    stateForFile() {
      return null
    },
    queueStateForFile() {
      return null
    },
    liveStateForFile() {
      return null
    },
    openCompileLog(filePath) {
      this.openCompileLogCalls.push(filePath)
    },
    ...overrides.typstStore,
  }

  const filesStore = {
    fileContents: {},
    ...overrides.filesStore,
  }

  const referencesStore = {
    allKeys: [],
    getByKey() {
      return null
    },
    ...overrides.referencesStore,
  }

  const runtime = createDocumentWorkflowBuildRuntime({
    getWorkflowStore: () => workflowStore,
    getEditorStore: () => overrides.editorStore || {},
    getFilesStore: () => filesStore,
    getWorkspaceStore: () => overrides.workspace || {},
    getLatexStore: () => latexStore,
    getTypstStore: () => typstStore,
    getReferencesStore: () => referencesStore,
  })

  return {
    runtime,
    workflowStore,
    latexStore,
    typstStore,
    filesStore,
    referencesStore,
  }
}

test('document workflow build runtime builds latex adapter context from workflow preview state', () => {
  const { runtime } = createBuildRuntime({
    workflowStore: {
      session: {
        activeFile: '/workspace/main.tex',
        previewKind: 'pdf',
      },
    },
    latexStore: {
      stateForFile() {
        return {
          pdfPath: '/workspace/main.pdf',
        }
      },
    },
  })

  const context = runtime.buildAdapterContext('/workspace/main.tex')

  assert.equal(context.adapter?.kind, 'latex')
  assert.equal(context.previewKind, 'pdf')
  assert.equal(context.previewVisible, true)
  assert.equal(context.previewAvailable, true)
  assert.equal(context.previewTargetPath, '/workspace/main.pdf')
  assert.equal(context.targetResolution, 'resolved')
})

test('document workflow build runtime defaults markdown workspace preview to visible without preview binding inference', () => {
  const { runtime } = createBuildRuntime()

  const context = runtime.buildAdapterContext('/workspace/chapter.md')

  assert.equal(context.adapter?.kind, 'markdown')
  assert.equal(context.previewKind, 'html')
  assert.equal(context.previewVisible, true)
  assert.equal(context.previewAvailable, true)
  assert.equal(context.targetResolution, 'not-needed')
})

test('document workflow build runtime keeps latex workspace preview hidden when the preview target is unresolved', () => {
  const { runtime } = createBuildRuntime()

  const context = runtime.buildAdapterContext('/workspace/main.tex')

  assert.equal(context.adapter?.kind, 'latex')
  assert.equal(context.previewKind, 'pdf')
  assert.equal(context.previewVisible, false)
  assert.equal(context.previewAvailable, false)
  assert.equal(context.targetResolution, 'unresolved')
})

test('document workflow build runtime prefers typst native preview and falls back to pdf workspace state', () => {
  const { runtime } = createBuildRuntime({
    typstStore: {
      stateForFile() {
        return {
          pdfPath: '/workspace/main.pdf',
        }
      },
    },
  })

  const nativeContext = runtime.buildAdapterContext('/workspace/main.typ')
  assert.equal(nativeContext.previewKind, 'native')
  assert.equal(nativeContext.previewVisible, true)
  assert.equal(nativeContext.targetResolution, 'not-needed')

  const pdfFallbackContext = runtime.buildAdapterContext('/workspace/main.typ', {
    nativePreviewSupported: false,
  })
  assert.equal(pdfFallbackContext.previewKind, 'pdf')
  assert.equal(pdfFallbackContext.previewVisible, true)
  assert.equal(pdfFallbackContext.previewTargetPath, '/workspace/main.pdf')
  assert.equal(pdfFallbackContext.targetResolution, 'resolved')
})

test('document workflow build runtime resolves preview target through adapter preview seam instead of compile state shape', () => {
  const { runtime } = createBuildRuntime()
  const adapter = {
    kind: 'latex',
    preview: {
      defaultKind: 'pdf',
      supportedKinds: ['pdf'],
      createPath() {
        return null
      },
      inferKind() {
        return null
      },
      getTargetPath() {
        return '/workspace/seam.pdf'
      },
    },
    citationSyntax: {
      supportsInsertion() {
        return false
      },
      buildText() {
        return ''
      },
    },
    compile: {
      stateForFile() {
        throw new Error('build runtime should not read compile state shape directly')
      },
    },
    getProblems() {
      return []
    },
    getUiState() {
      return null
    },
  }

  const context = runtime.buildAdapterContext('/workspace/main.tex', { adapter })

  assert.equal(context.previewTargetPath, '/workspace/seam.pdf')
  assert.equal(context.previewVisible, true)
  assert.equal(context.previewAvailable, true)
})

test('document workflow build runtime preserves adapter-specific compile log opening', () => {
  const { runtime, latexStore } = createBuildRuntime()

  runtime.openLogForFile('/workspace/main.tex')

  assert.deepEqual(latexStore.openCompileLogCalls, ['/workspace/main.tex'])
})

test('document workflow build runtime preserves markdown draft and preview problems', () => {
  const { runtime } = createBuildRuntime({
    filesStore: {
      fileContents: {
        '/workspace/chapter.md': 'See @missing for details.',
      },
    },
    workflowStore: {
      markdownPreviewState: {
        '/workspace/chapter.md': {
          problems: [
            {
              id: 'preview-1',
              severity: 'error',
              message: 'Preview failed.',
              origin: 'preview',
            },
          ],
        },
      },
    },
  })

  const problems = runtime.getProblemsForFile('/workspace/chapter.md')

  assert.ok(problems.some(problem => (
    problem.origin === 'draft'
    && problem.message.includes('Prefer [@missing]')
  )))
  assert.ok(problems.some(problem => (
    problem.origin === 'draft'
    && problem.message.includes('Unknown citation key: missing')
  )))
  assert.ok(problems.some(problem => (
    problem.origin === 'preview'
    && problem.message === 'Preview failed.'
  )))
})

test('document workflow build runtime exposes queued latex ui state and status tone outside the store shell', () => {
  const { runtime } = createBuildRuntime({
    latexStore: {
      stateForFile() {
        return {
          status: 'idle',
          pdfPath: '/workspace/main.pdf',
        }
      },
      queueStateForFile() {
        return { phase: 'queued' }
      },
    },
  })

  const uiState = runtime.getUiStateForFile('/workspace/main.tex')

  assert.equal(uiState?.kind, 'latex')
  assert.equal(uiState?.phase, 'queued')
  assert.equal(uiState?.canRevealPreview, true)
  assert.equal(runtime.getStatusTextForFile('/workspace/main.tex'), 'Queued')
  assert.equal(getDocumentWorkflowStatusTone(uiState), 'warning')
})

test('document workflow build runtime exposes adapter-specific artifact paths outside the store shell', () => {
  const { runtime } = createBuildRuntime({
    typstStore: {
      stateForFile() {
        return {
          pdfPath: '/workspace/main-built.pdf',
        }
      },
    },
  })

  assert.equal(
    runtime.getArtifactPathForFile('/workspace/main.typ'),
    '/workspace/main-built.pdf',
  )
})
