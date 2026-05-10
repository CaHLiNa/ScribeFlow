import assert from 'node:assert/strict'
import { computed } from 'vue'
import { createLogger, createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
  logLevel: 'error',
  customLogger: createLogger('error', {
    customConsole: {
      ...console,
      error(message, ...rest) {
        const rendered = String(message || '')
        if (rendered.includes('WebSocket server error:')) return
        console.error(message, ...rest)
      },
    },
  }),
})

try {
  const { resolveMarkdownPreviewInput, resolveWorkspacePreviewSourcePath } =
    await vite.ssrLoadModule('/src/domains/document/documentWorkspacePreviewAdapters.js')

  const directPreview = resolveMarkdownPreviewInput('preview:/tmp/scribeflow-preview/note.md')
  assert.equal(typeof directPreview?.then, 'undefined')
  assert.deepEqual(directPreview, {
    sourcePath: '/tmp/scribeflow-preview/note.md',
  })

  const sourceFile = resolveMarkdownPreviewInput('/tmp/scribeflow-preview/note.md')
  assert.equal(typeof sourceFile?.then, 'undefined')
  assert.deepEqual(sourceFile, {
    sourcePath: '/tmp/scribeflow-preview/note.md',
  })

  const explicitSource = resolveMarkdownPreviewInput('preview:stale.md', {
    sourcePath: '/tmp/scribeflow-preview/explicit.md',
  })
  assert.equal(typeof explicitSource?.then, 'undefined')
  assert.deepEqual(explicitSource, {
    sourcePath: '/tmp/scribeflow-preview/explicit.md',
  })

  const boundSource = resolveWorkspacePreviewSourcePath('preview:bound.md', {
    workflowStore: {
      getPreviewBinding(path) {
        assert.equal(path, 'preview:bound.md')
        return {
          sourcePath: '/tmp/scribeflow-preview/bound.md',
          previewKind: 'html',
        }
      },
    },
    previewKind: 'html',
  })
  assert.equal(typeof boundSource?.then, 'undefined')
  assert.equal(boundSource, '/tmp/scribeflow-preview/bound.md')

  const rejectedBinding = resolveWorkspacePreviewSourcePath('preview:/tmp/scribeflow-preview/fallback.md', {
    workflowStore: {
      getPreviewBinding() {
        return {
          sourcePath: '/tmp/scribeflow-preview/pdf-bound.md',
          previewKind: 'pdf',
        }
      },
    },
    previewKind: 'html',
  })
  assert.equal(typeof rejectedBinding?.then, 'undefined')
  assert.equal(rejectedBinding, '/tmp/scribeflow-preview/fallback.md')

  const computedSource = computed(
    () =>
      resolveMarkdownPreviewInput('preview:/tmp/scribeflow-preview/computed.md').sourcePath,
  )
  assert.equal(computedSource.value, '/tmp/scribeflow-preview/computed.md')

  console.log('markdown preview source contract probe passed')
} finally {
  await vite.close()
}
