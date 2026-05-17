import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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
  const {
    clearPendingMarkdownForwardSync,
    rememberPendingMarkdownForwardSync,
    takePendingMarkdownForwardSync,
  } = await vite.ssrLoadModule('/src/services/markdown/previewSync.js')

  clearPendingMarkdownForwardSync()

  const first = rememberPendingMarkdownForwardSync({
    sourcePath: '/tmp/scribeflow/a.md',
    line: 3,
    offset: 9,
  })
  const second = rememberPendingMarkdownForwardSync({
    sourcePath: '/tmp/scribeflow/b.md',
    line: 5,
    offset: 1,
  })

  assert.equal(first?.sourcePath, '/tmp/scribeflow/a.md')
  assert.equal(second?.sourcePath, '/tmp/scribeflow/b.md')

  clearPendingMarkdownForwardSync('/tmp/scribeflow/a.md')
  assert.equal(takePendingMarkdownForwardSync('/tmp/scribeflow/a.md'), null)
  assert.deepEqual(takePendingMarkdownForwardSync('/tmp/scribeflow/b.md'), second)

  rememberPendingMarkdownForwardSync({
    sourcePath: '/tmp/scribeflow/all.md',
    line: 7,
    offset: 2,
  })
  clearPendingMarkdownForwardSync()
  assert.equal(takePendingMarkdownForwardSync('/tmp/scribeflow/all.md'), null)

  const componentSource = await readFile('src/components/editor/MarkdownPreview.vue', 'utf8')
  assert.match(
    componentSource,
    /onUnmounted\(\(\) => \{[\s\S]*clearPendingMarkdownForwardSync\(resolvedSourcePath\.value\)/,
    'MarkdownPreview must clear source-scoped pending forward sync on unmount'
  )

  console.log(JSON.stringify({
    ok: true,
    summary: {
      stringSourceClear: true,
      sourceScopedIsolation: true,
      unmountWiring: true,
    },
  }, null, 2))
} finally {
  await vite.close()
}
