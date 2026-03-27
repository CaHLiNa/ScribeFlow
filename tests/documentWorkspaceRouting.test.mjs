import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveDocumentWorkspacePreviewState,
  resolveDocumentWorkspaceTextRoute,
  shouldShowPdfToolbarTarget,
  shouldUseDocumentWorkspaceTab,
} from '../src/domains/document/documentWorkspacePreviewRuntime.js'

test('document workspace routing identifies source documents for workspace composition', () => {
  assert.equal(shouldUseDocumentWorkspaceTab('/workspace/chapter.md'), true)
  assert.equal(shouldUseDocumentWorkspaceTab('/workspace/paper.tex'), true)
  assert.equal(shouldUseDocumentWorkspaceTab('/workspace/paper.typ'), true)
  assert.equal(shouldUseDocumentWorkspaceTab('/workspace/output.pdf'), false)
})

function getWorkspaceRouteContract(options) {
  const previewState = resolveDocumentWorkspacePreviewState(options)
  const textRoute = resolveDocumentWorkspaceTextRoute({
    activeTab: options.path || options.filePath || '',
    viewerType: 'text',
    documentPreviewState: previewState,
  })
  return {
    useWorkspace: previewState.useWorkspace,
    previewVisible: previewState.previewVisible,
    previewKind: previewState.previewKind,
    previewMode: previewState.previewMode,
    targetResolution: previewState.targetResolution,
    reason: previewState.reason,
    toolbarTargetVisible: textRoute.toolbarTargetVisible,
    useWorkspaceSurface: textRoute.useWorkspaceSurface,
    previewTargetPath: textRoute.previewTargetPath,
    previewFilePath: textRoute.previewFilePath,
  }
}

test('document workspace routing keeps markdown previews visible without a pdf toolbar target', () => {
  assert.deepEqual(getWorkspaceRouteContract({ path: '/workspace/chapter.md' }), {
    useWorkspace: true,
    previewVisible: true,
    previewKind: 'html',
    previewMode: 'markdown',
    targetResolution: 'not-needed',
    reason: 'workspace-markdown',
    toolbarTargetVisible: false,
    useWorkspaceSurface: true,
    previewTargetPath: '',
    previewFilePath: 'preview:/workspace/chapter.md',
  })
})

test('document workspace routing keeps typst native previews visible without degrading to pdf chrome', () => {
  assert.deepEqual(getWorkspaceRouteContract({ path: '/workspace/paper.typ' }), {
    useWorkspace: true,
    previewVisible: true,
    previewKind: 'native',
    previewMode: 'typst-native',
    targetResolution: 'not-needed',
    reason: 'workspace-typst-native',
    toolbarTargetVisible: false,
    useWorkspaceSurface: true,
    previewTargetPath: '',
    previewFilePath: 'typst-preview:/workspace/paper.typ',
  })
})

test('document workspace routing exposes pdf chrome when a workspace pdf preview is resolved', () => {
  assert.deepEqual(getWorkspaceRouteContract({
    path: '/workspace/paper.typ',
    nativePreviewSupported: false,
    resolvedTargetPath: '/workspace/paper.pdf',
  }), {
    useWorkspace: true,
    previewVisible: true,
    previewKind: 'pdf',
    previewMode: 'pdf',
    targetResolution: 'resolved',
    reason: 'workspace-typst-pdf-fallback',
    toolbarTargetVisible: true,
    useWorkspaceSurface: true,
    previewTargetPath: '/workspace/paper.pdf',
    previewFilePath: '/workspace/paper.pdf',
  })
})

test('document workspace routing degrades unresolved pdf previews to source-only workspace mode', () => {
  assert.deepEqual(getWorkspaceRouteContract({ path: '/workspace/paper.tex' }), {
    useWorkspace: true,
    previewVisible: false,
    previewKind: 'pdf',
    previewMode: null,
    targetResolution: 'unresolved',
    reason: 'unresolved-target',
    toolbarTargetVisible: false,
    useWorkspaceSurface: true,
    previewTargetPath: '',
    previewFilePath: '',
  })
})

test('document workspace text route keeps plain text files on the direct editor surface', () => {
  assert.deepEqual(resolveDocumentWorkspaceTextRoute({
    activeTab: '/workspace/notes.txt',
    viewerType: 'text',
    documentPreviewState: null,
  }), {
    useWorkspaceSurface: false,
    previewVisible: false,
    previewMode: null,
    previewTargetPath: '',
    previewFilePath: '',
    toolbarTargetVisible: false,
  })
})

test('document workspace text route only exposes pdf toolbar targets for pdf-bearing routes', () => {
  const markdownState = resolveDocumentWorkspacePreviewState({ path: '/workspace/chapter.md' })
  const resolvedPdfState = resolveDocumentWorkspacePreviewState({
    path: '/workspace/paper.tex',
    resolvedTargetPath: '/workspace/paper.pdf',
  })

  assert.equal(shouldShowPdfToolbarTarget('text', markdownState), false)
  assert.equal(shouldShowPdfToolbarTarget('text', resolvedPdfState), true)
  assert.equal(shouldShowPdfToolbarTarget('pdf', null), true)
})

test('document workspace text route contracts keep preview slot hidden when workspace preview is unavailable', () => {
  const unresolvedPdfState = resolveDocumentWorkspacePreviewState({ path: '/workspace/paper.tex' })

  assert.deepEqual(resolveDocumentWorkspaceTextRoute({
    activeTab: '/workspace/paper.tex',
    viewerType: 'text',
    documentPreviewState: unresolvedPdfState,
  }), {
    useWorkspaceSurface: true,
    previewVisible: false,
    previewMode: null,
    previewTargetPath: '',
    previewFilePath: '',
    toolbarTargetVisible: false,
  })
})
