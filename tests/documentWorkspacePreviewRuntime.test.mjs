import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createDocumentWorkspacePreviewAction,
  resolveDocumentPreviewCloseEffect,
  resolveDocumentWorkspacePreviewState,
  resolveDocumentWorkspaceTextRoute,
  shouldUseDocumentWorkspaceTab,
} from '../src/domains/document/documentWorkspacePreviewRuntime.js'

test('workspace preview runtime identifies document sources and keeps raw pdf tabs out of the split surface', () => {
  assert.equal(shouldUseDocumentWorkspaceTab('/tmp/note.md'), true)
  assert.equal(shouldUseDocumentWorkspaceTab('/tmp/paper.tex'), true)
  assert.equal(shouldUseDocumentWorkspaceTab('/tmp/paper.typ'), true)
  assert.equal(shouldUseDocumentWorkspaceTab('/tmp/paper.pdf'), false)
})

test('markdown preview defaults to a visible workspace split and can still be hidden by the user', () => {
  const visibleState = resolveDocumentWorkspacePreviewState({ path: '/tmp/note.md' })
  assert.equal(visibleState.useWorkspace, true)
  assert.equal(visibleState.previewVisible, true)
  assert.equal(visibleState.previewKind, 'html')
  assert.equal(visibleState.previewMode, 'markdown')
  assert.equal(visibleState.previewFilePath, 'preview:/tmp/note.md')
  assert.equal(visibleState.targetResolution, 'not-needed')

  const hiddenState = resolveDocumentWorkspacePreviewState({
    path: '/tmp/note.md',
    hiddenByUser: true,
  })
  assert.equal(hiddenState.previewVisible, false)
  assert.equal(hiddenState.previewMode, null)
  assert.equal(hiddenState.previewKind, 'html')
  assert.equal(hiddenState.reason, 'hidden-by-user')
})

test('latex preview stays source-only until a compiled artifact is actually ready', () => {
  const unresolvedState = resolveDocumentWorkspacePreviewState({
    path: '/tmp/paper.tex',
    targetResolution: 'unresolved',
    artifactReady: false,
  })
  assert.equal(unresolvedState.previewVisible, false)
  assert.equal(unresolvedState.previewKind, 'pdf')
  assert.equal(unresolvedState.previewMode, null)
  assert.equal(unresolvedState.reason, 'unresolved-target')

  const readyState = resolveDocumentWorkspacePreviewState({
    path: '/tmp/paper.tex',
    targetResolution: 'resolved',
    artifactReady: true,
    resolvedTargetPath: '/tmp/paper.pdf',
  })
  assert.equal(readyState.previewVisible, true)
  assert.equal(readyState.previewMode, 'pdf')
  assert.equal(readyState.previewTargetPath, '/tmp/paper.pdf')
  assert.equal(readyState.previewFilePath, '/tmp/paper.pdf')
})

test('typst prefers native preview and falls back to pdf when native rendering is unavailable', () => {
  const nativeState = resolveDocumentWorkspacePreviewState({ path: '/tmp/paper.typ' })
  assert.equal(nativeState.previewVisible, true)
  assert.equal(nativeState.previewKind, 'native')
  assert.equal(nativeState.previewMode, 'typst-native')
  assert.equal(nativeState.previewFilePath, 'typst-preview:/tmp/paper.typ')

  const pdfFallbackState = resolveDocumentWorkspacePreviewState({
    path: '/tmp/paper.typ',
    previewKind: 'pdf',
    nativePreviewSupported: false,
    artifactReady: true,
    resolvedTargetPath: '/tmp/paper.pdf',
  })
  assert.equal(pdfFallbackState.previewVisible, true)
  assert.equal(pdfFallbackState.previewKind, 'pdf')
  assert.equal(pdfFallbackState.previewMode, 'pdf')
  assert.equal(pdfFallbackState.previewTargetPath, '/tmp/paper.pdf')
  assert.equal(pdfFallbackState.previewFilePath, '/tmp/paper.pdf')
})

test('workspace text routing mirrors the resolved preview state for split editors', () => {
  const previewState = resolveDocumentWorkspacePreviewState({
    path: '/tmp/paper.typ',
    previewKind: 'pdf',
    nativePreviewSupported: false,
    artifactReady: true,
    resolvedTargetPath: '/tmp/paper.pdf',
  })
  const route = resolveDocumentWorkspaceTextRoute({
    activeTab: '/tmp/paper.typ',
    viewerType: 'text',
    documentPreviewState: previewState,
  })

  assert.equal(route.useWorkspaceSurface, true)
  assert.equal(route.previewVisible, true)
  assert.equal(route.previewMode, 'pdf')
  assert.equal(route.previewTargetPath, '/tmp/paper.pdf')
})

test('legacy preview tabs remain read-only and close effects only detach pane-bound previews', () => {
  const state = resolveDocumentWorkspacePreviewState({ path: 'preview:/tmp/note.md' })
  assert.equal(state.useWorkspace, false)
  assert.equal(state.previewVisible, true)
  assert.equal(state.legacyReadOnly, true)
  assert.equal(state.previewMode, 'markdown')

  assert.deepEqual(
    resolveDocumentPreviewCloseEffect('preview:/tmp/note.md'),
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

test('workspace preview actions keep the requested preview kind even before the target resolves', () => {
  const action = createDocumentWorkspacePreviewAction({
    path: '/tmp/paper.typ',
    sourcePaneId: 'pane-source',
    trigger: 'workflow-toggle-preview',
    previewKind: 'pdf',
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
