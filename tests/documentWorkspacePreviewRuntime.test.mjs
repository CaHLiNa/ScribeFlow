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

test('latex stays source-only in the workspace even when a compiled output exists', () => {
  const state = resolveDocumentWorkspacePreviewState({
    path: '/tmp/paper.tex',
    targetResolution: 'resolved',
    artifactReady: true,
    resolvedTargetPath: '/tmp/paper.pdf',
  })

  assert.equal(state.previewVisible, false)
  assert.equal(state.previewKind, null)
  assert.equal(state.previewMode, null)
  assert.equal(state.reason, 'artifact-ready-external')
  assert.equal(state.previewTargetPath, '/tmp/paper.pdf')
  assert.equal(state.targetResolution, 'resolved')
})

test('latex can switch into an embedded pdf artifact preview when explicitly requested', () => {
  const state = resolveDocumentWorkspacePreviewState({
    path: '/tmp/paper.tex',
    previewKind: 'pdf',
    previewRequested: true,
    artifactReady: true,
    resolvedTargetPath: '/tmp/paper.pdf',
  })

  assert.equal(state.previewVisible, true)
  assert.equal(state.previewKind, 'pdf')
  assert.equal(state.previewMode, 'pdf-artifact')
  assert.equal(state.previewTargetPath, '/tmp/paper.pdf')
  assert.equal(state.reason, 'workspace-latex-pdf')
})

test('typst prefers native preview and falls back to source-only when native rendering is unavailable', () => {
  const nativeState = resolveDocumentWorkspacePreviewState({ path: '/tmp/paper.typ' })
  assert.equal(nativeState.previewVisible, true)
  assert.equal(nativeState.previewKind, 'native')
  assert.equal(nativeState.previewMode, 'typst-native')
  assert.equal(nativeState.previewFilePath, 'typst-preview:/tmp/paper.typ')

  const sourceOnlyState = resolveDocumentWorkspacePreviewState({
    path: '/tmp/paper.typ',
    previewKind: 'native',
    nativePreviewSupported: false,
    artifactReady: true,
    resolvedTargetPath: '/tmp/paper.pdf',
  })
  assert.equal(sourceOnlyState.previewVisible, false)
  assert.equal(sourceOnlyState.previewKind, null)
  assert.equal(sourceOnlyState.previewMode, null)
  assert.equal(sourceOnlyState.reason, 'artifact-ready-external')
})

test('typst can explicitly switch from native preview to pdf artifact preview', () => {
  const state = resolveDocumentWorkspacePreviewState({
    path: '/tmp/paper.typ',
    previewKind: 'pdf',
    previewRequested: true,
    artifactReady: true,
    resolvedTargetPath: '/tmp/paper.pdf',
  })

  assert.equal(state.previewVisible, true)
  assert.equal(state.previewKind, 'pdf')
  assert.equal(state.previewMode, 'pdf-artifact')
  assert.equal(state.previewTargetPath, '/tmp/paper.pdf')
  assert.equal(state.reason, 'workspace-typst-pdf')
})

test('workspace text routing mirrors the resolved preview state for split editors', () => {
  const previewState = resolveDocumentWorkspacePreviewState({
    path: '/tmp/paper.typ',
  })
  const route = resolveDocumentWorkspaceTextRoute({
    activeTab: '/tmp/paper.typ',
    viewerType: 'text',
    documentPreviewState: previewState,
  })

  assert.equal(route.useWorkspaceSurface, true)
  assert.equal(route.previewVisible, true)
  assert.equal(route.previewMode, 'typst-native')
  assert.equal(route.previewTargetPath, '')
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

test('workspace preview actions exist for supported inline workspace preview kinds', () => {
  const markdownAction = createDocumentWorkspacePreviewAction({
    path: '/tmp/note.md',
    sourcePaneId: 'pane-source',
    trigger: 'workflow-toggle-preview',
  })
  const latexAction = createDocumentWorkspacePreviewAction({
    path: '/tmp/paper.tex',
    sourcePaneId: 'pane-source',
    trigger: 'workflow-toggle-preview',
    previewKind: 'pdf',
    previewRequested: true,
    artifactReady: true,
    resolvedTargetPath: '/tmp/paper.pdf',
  })

  assert.deepEqual(markdownAction, {
    type: 'workspace-preview',
    kind: 'markdown',
    filePath: '/tmp/note.md',
    sourcePath: '/tmp/note.md',
    sourcePaneId: 'pane-source',
    previewKind: 'html',
    previewMode: 'markdown',
    previewTargetPath: '',
    targetResolution: 'not-needed',
    trigger: 'workflow-toggle-preview',
    state: 'workspace-preview',
    preserveOpenLegacy: false,
    legacyReadOnly: false,
    legacyPreviewPath: '',
    legacyPreviewPaneId: null,
  })
  assert.deepEqual(latexAction, {
    type: 'workspace-preview',
    kind: 'latex',
    filePath: '/tmp/paper.tex',
    sourcePath: '/tmp/paper.tex',
    sourcePaneId: 'pane-source',
    previewKind: 'pdf',
    previewMode: 'pdf-artifact',
    previewTargetPath: '/tmp/paper.pdf',
    targetResolution: 'resolved',
    trigger: 'workflow-toggle-preview',
    state: 'workspace-preview',
    preserveOpenLegacy: false,
    legacyReadOnly: false,
    legacyPreviewPath: '',
    legacyPreviewPaneId: null,
  })
})
