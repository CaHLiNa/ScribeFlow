import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveDocumentPdfPreviewInput,
  resolveMarkdownPreviewInput,
  resolveTypstNativePreviewInput,
  resolveWorkspacePreviewSourcePath,
} from '../src/domains/document/documentWorkspacePreviewAdapters.js'

test('markdown preview adapters accept direct source paths without preview wrappers', () => {
  const input = resolveMarkdownPreviewInput('/workspace/chapter.md')

  assert.equal(input.sourcePath, '/workspace/chapter.md')
  assert.equal(input.legacyPreviewPath, '')
})

test('workspace preview adapters keep legacy preview wrapper compatibility', () => {
  const sourcePath = resolveWorkspacePreviewSourcePath('preview:/workspace/chapter.md', {
    previewKind: 'html',
  })

  assert.equal(sourcePath, '/workspace/chapter.md')
})

test('workspace preview adapters ignore bindings when preview kind does not match', () => {
  const sourcePath = resolveWorkspacePreviewSourcePath('/workspace/paper.pdf', {
    previewKind: 'pdf',
    workflowStore: {
      getPreviewBinding(previewPath) {
        if (previewPath !== '/workspace/paper.pdf') return null
        return {
          previewPath,
          sourcePath: '/workspace/paper.typ',
          previewKind: 'native',
        }
      },
    },
  })

  assert.equal(sourcePath, '')
})

test('typst native preview adapters honor source-driven source and root context', async () => {
  const input = await resolveTypstNativePreviewInput('/workspace/paper.typ', {
    sourcePath: '/workspace/paper.typ',
    rootPath: '/workspace/main.typ',
  })

  assert.deepEqual(input, {
    sourcePath: '/workspace/paper.typ',
    rootPath: '/workspace/main.typ',
  })
})

test('typst native preview adapters resolve root from source-driven files when explicit root is absent', async () => {
  const input = await resolveTypstNativePreviewInput('/workspace/sections/intro.typ', {
    resolveCachedTypstRootPathImpl: () => '/workspace/main.typ',
    resolveTypstCompileTargetImpl: async () => '/workspace/main.typ',
    filesStore: {
      fileContents: {
        '/workspace/sections/intro.typ': '= Intro',
      },
    },
    workspacePath: '/workspace',
  })

  assert.deepEqual(input, {
    sourcePath: '/workspace/sections/intro.typ',
    rootPath: '/workspace/main.typ',
  })
})

test('typst native preview adapters fall back to cached root when compile target resolution fails', async () => {
  const input = await resolveTypstNativePreviewInput('/workspace/sections/intro.typ', {
    resolveCachedTypstRootPathImpl: () => '/workspace/fallback.typ',
    resolveTypstCompileTargetImpl: async () => {
      throw new Error('tinymist unavailable')
    },
    filesStore: {
      fileContents: {
        '/workspace/sections/intro.typ': '= Intro',
      },
    },
    workspacePath: '/workspace',
  })

  assert.deepEqual(input, {
    sourcePath: '/workspace/sections/intro.typ',
    rootPath: '/workspace/fallback.typ',
  })
})

test('document pdf viewer adapters accept source-driven artifact context', () => {
  const input = resolveDocumentPdfPreviewInput('/workspace/paper.typ', {
    sourcePath: '/workspace/paper.typ',
    previewTargetPath: '/workspace/build/paper.pdf',
  })

  assert.equal(input.sourcePath, '/workspace/paper.typ')
  assert.equal(input.artifactPath, '/workspace/build/paper.pdf')
  assert.equal(input.sourceKind, 'typst')
  assert.equal(input.resolvedKind, 'typst')
  assert.equal(input.resolutionState, 'resolved-from-source')
})

test('document pdf viewer adapters still resolve legacy pdf preview bindings', () => {
  const input = resolveDocumentPdfPreviewInput('/workspace/build/paper.pdf', {
    workflowStore: {
      getPreviewBinding(previewPath) {
        if (previewPath !== '/workspace/build/paper.pdf') return null
        return {
          previewPath,
          sourcePath: '/workspace/paper.tex',
          previewKind: 'pdf',
        }
      },
    },
  })

  assert.equal(input.sourcePath, '/workspace/paper.tex')
  assert.equal(input.artifactPath, '/workspace/build/paper.pdf')
  assert.equal(input.sourceKind, 'latex')
  assert.equal(input.resolvedKind, 'latex')
  assert.equal(input.resolutionState, 'resolved-from-source')
})

test('document pdf viewer adapters surface unresolved pdf source detection state', () => {
  const input = resolveDocumentPdfPreviewInput('/workspace/build/paper.pdf', {
    filesStore: {
      getPdfSourceState() {
        return {
          status: 'loading',
          kind: 'plain',
        }
      },
    },
  })

  assert.equal(input.sourcePath, '')
  assert.equal(input.artifactPath, '/workspace/build/paper.pdf')
  assert.equal(input.sourceKind, null)
  assert.equal(input.resolvedKind, 'plain')
  assert.equal(input.resolutionState, 'loading')
})
