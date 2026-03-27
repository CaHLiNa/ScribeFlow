import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createDocumentWorkspacePreviewAction,
  resolveDocumentPreviewCloseEffect,
  resolveDocumentWorkspacePreviewState,
  shouldUseDocumentWorkspaceTab,
} from '../src/domains/document/documentWorkspacePreviewRuntime.js'

test('document workspace preview runtime identifies workspace document tabs', () => {
  assert.equal(shouldUseDocumentWorkspaceTab('/tmp/note.md'), true)
  assert.equal(shouldUseDocumentWorkspaceTab('/tmp/paper.tex'), true)
  assert.equal(shouldUseDocumentWorkspaceTab('/tmp/paper.typ'), true)
  assert.equal(shouldUseDocumentWorkspaceTab('/tmp/paper.pdf'), false)
})

test('document workspace preview runtime defaults markdown documents to workspace split preview', () => {
  const state = resolveDocumentWorkspacePreviewState({ path: '/tmp/note.md' })

  assert.equal(state.useWorkspace, true)
  assert.equal(state.previewVisible, true)
  assert.equal(state.previewKind, 'html')
  assert.equal(state.previewMode, 'markdown')
  assert.equal(state.targetResolution, 'not-needed')
  assert.equal(state.reason, 'workspace-markdown')
  assert.equal(state.legacyReadOnly, false)
  assert.equal(state.allowPreviewCreation, true)
  assert.equal(state.preserveOpenLegacy, false)
})

test('document workspace preview runtime keeps latex preview hidden until the target is resolved', () => {
  const state = resolveDocumentWorkspacePreviewState({ path: '/tmp/paper.tex' })

  assert.equal(state.useWorkspace, true)
  assert.equal(state.previewVisible, false)
  assert.equal(state.previewKind, 'pdf')
  assert.equal(state.previewMode, 'pdf')
  assert.equal(state.targetResolution, 'unresolved')
  assert.equal(state.reason, 'unresolved-target')
  assert.equal(state.legacyReadOnly, false)
  assert.equal(state.allowPreviewCreation, true)
  assert.equal(state.preserveOpenLegacy, false)
})

test('document workspace preview runtime prefers typst native preview and falls back to pdf', () => {
  const nativeState = resolveDocumentWorkspacePreviewState({ path: '/tmp/paper.typ' })
  assert.equal(nativeState.previewVisible, true)
  assert.equal(nativeState.previewKind, 'native')
  assert.equal(nativeState.previewMode, 'typst-native')
  assert.equal(nativeState.targetResolution, 'not-needed')
  assert.equal(nativeState.reason, 'workspace-typst-native')

  const pdfFallbackState = resolveDocumentWorkspacePreviewState({
    path: '/tmp/paper.typ',
    nativePreviewSupported: false,
    resolvedTargetPath: '/tmp/paper.pdf',
  })
  assert.equal(pdfFallbackState.previewVisible, true)
  assert.equal(pdfFallbackState.previewKind, 'pdf')
  assert.equal(pdfFallbackState.previewMode, 'pdf')
  assert.equal(pdfFallbackState.targetResolution, 'resolved')
  assert.equal(pdfFallbackState.reason, 'workspace-typst-pdf-fallback')
  assert.equal(pdfFallbackState.previewTargetPath, '/tmp/paper.pdf')
})

test('document workspace preview runtime keeps typst preview hidden when native preview is unavailable and no pdf target is resolved', () => {
  const state = resolveDocumentWorkspacePreviewState({
    path: '/tmp/paper.typ',
    nativePreviewSupported: false,
  })

  assert.equal(state.useWorkspace, true)
  assert.equal(state.previewVisible, false)
  assert.equal(state.previewKind, 'pdf')
  assert.equal(state.previewMode, 'pdf')
  assert.equal(state.targetResolution, 'unresolved')
  assert.equal(state.reason, 'unresolved-target')
})

test('document workspace preview runtime returns read-only compatibility state for legacy preview tabs', () => {
  const state = resolveDocumentWorkspacePreviewState({ path: 'preview:/tmp/note.md' })

  assert.equal(state.useWorkspace, false)
  assert.equal(state.previewVisible, true)
  assert.equal(state.previewKind, 'html')
  assert.equal(state.previewMode, 'markdown')
  assert.equal(state.targetResolution, 'legacy')
  assert.equal(state.reason, 'legacy-preview-tab')
  assert.equal(state.legacyReadOnly, true)
  assert.equal(state.allowPreviewCreation, false)
  assert.equal(state.preserveOpenLegacy, true)
  assert.equal(state.sourcePath, '/tmp/note.md')
})

test('document workspace preview runtime can preserve an already open legacy preview while using workspace mode', () => {
  const state = resolveDocumentWorkspacePreviewState({
    path: '/tmp/paper.tex',
    resolvedTargetPath: '/tmp/paper.pdf',
    hasOpenLegacyPreview: true,
  })

  assert.equal(state.useWorkspace, true)
  assert.equal(state.previewVisible, true)
  assert.equal(state.previewKind, 'pdf')
  assert.equal(state.previewMode, 'pdf')
  assert.equal(state.targetResolution, 'resolved')
  assert.equal(state.reason, 'workspace-latex')
  assert.equal(state.preserveOpenLegacy, true)
})

test('document workspace preview runtime creates explicit workspace-local preview actions', () => {
  const action = createDocumentWorkspacePreviewAction({
    path: '/tmp/paper.typ',
    sourcePaneId: 'pane-source',
    trigger: 'workflow-toggle-preview',
    nativePreviewSupported: false,
  })

  assert.deepEqual(action, {
    type: 'workspace-preview',
    kind: 'typst',
    filePath: '/tmp/paper.typ',
    sourcePath: '/tmp/paper.typ',
    sourcePaneId: 'pane-source',
    previewKind: 'pdf',
    previewMode: 'pdf',
    previewTargetPath: '',
    targetResolution: 'unresolved',
    trigger: 'workflow-toggle-preview',
    state: 'workspace-preview',
    preserveOpenLegacy: false,
    legacyReadOnly: false,
    legacyPreviewPath: '',
    legacyPreviewPaneId: null,
  })
})

test('document workspace preview runtime only detaches pane-first legacy preview closes', () => {
  assert.deepEqual(
    resolveDocumentPreviewCloseEffect('preview:/tmp/note.md'),
    { sourcePath: '/tmp/note.md', markDetached: false },
  )

  assert.deepEqual(
    resolveDocumentPreviewCloseEffect('preview:/tmp/note.md', {
      previewBinding: {
        sourcePath: '/tmp/note.md',
        detachOnClose: false,
      },
    }),
    { sourcePath: '/tmp/note.md', markDetached: false },
  )

  assert.deepEqual(
    resolveDocumentPreviewCloseEffect('preview:/tmp/note.md', {
      previewBinding: {
        sourcePath: '/tmp/note.md',
        detachOnClose: true,
      },
    }),
    { sourcePath: '/tmp/note.md', markDetached: true },
  )
})
