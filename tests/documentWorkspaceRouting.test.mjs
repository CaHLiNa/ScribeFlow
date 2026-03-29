import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveDocumentWorkspacePreviewState,
  resolveDocumentWorkspaceTextRoute,
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

test('document workspace routing keeps markdown previews visible without extra pdf chrome', () => {
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

test('document workspace routing keeps typst native previews visible when supported', () => {
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

test('document workspace routing keeps latex source-only and relies on external output opening', () => {
  assert.deepEqual(getWorkspaceRouteContract({
    path: '/workspace/paper.tex',
    resolvedTargetPath: '/workspace/paper.pdf',
    artifactReady: true,
  }), {
    useWorkspace: true,
    previewVisible: false,
    previewKind: null,
    previewMode: null,
    targetResolution: 'resolved',
    reason: 'artifact-ready-external',
    toolbarTargetVisible: false,
    useWorkspaceSurface: true,
    previewTargetPath: '',
    previewFilePath: '',
  })
})

test('document workspace routing keeps typst source-only when native preview is unavailable', () => {
  assert.deepEqual(getWorkspaceRouteContract({
    path: '/workspace/paper.typ',
    nativePreviewSupported: false,
    resolvedTargetPath: '/workspace/paper.pdf',
    artifactReady: true,
  }), {
    useWorkspace: true,
    previewVisible: false,
    previewKind: null,
    previewMode: null,
    targetResolution: 'resolved',
    reason: 'artifact-ready-external',
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
