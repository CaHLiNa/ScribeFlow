import test from 'node:test'
import assert from 'node:assert/strict'

import {
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
  const sourcePath = resolveWorkspacePreviewSourcePath('typst-preview:/workspace/paper.typ', {
    previewKind: 'html',
    workflowStore: {
      getPreviewBinding(previewPath) {
        if (previewPath !== 'typst-preview:/workspace/paper.typ') return null
        return {
          previewPath,
          sourcePath: '/workspace/paper.typ',
          previewKind: 'native',
        }
      },
    },
  })

  assert.equal(sourcePath, '/workspace/paper.typ')
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
