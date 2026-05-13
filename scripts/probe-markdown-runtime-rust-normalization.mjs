import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { createLogger, createServer } from 'vite'

if (!globalThis.window) {
  globalThis.window = globalThis
}

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto
}

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

let clearTauriMocks = () => {}

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  mockWindows('main')

  const calls = []
  const wikiLinksResult = { items: [{ target: 'Topic' }], rustOwned: true }
  const linkIndexResult = 'rust-owned-link-index'

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'markdown_extract_headings') {
      return []
    }
    if (cmd === 'markdown_extract_diagnostics') {
      return []
    }
    if (cmd === 'markdown_extract_wiki_links') {
      return wikiLinksResult
    }
    if (cmd === 'markdown_link_index_resolve') {
      return linkIndexResult
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    extractMarkdownHeadingItems,
    extractMarkdownDraftProblems,
    extractMarkdownWikiLinks,
    resolveMarkdownLinkIndex,
  } = await vite.ssrLoadModule('/src/services/markdown/runtimeBridge.js')

  await extractMarkdownHeadingItems(42)
  await extractMarkdownDraftProblems(['raw-content'], false)
  const links = await extractMarkdownWikiLinks(null)
  const index = await resolveMarkdownLinkIndex(123, [
    { path: ['notes/index.md'], content: false },
    'loose-entry',
  ])

  assert.deepEqual(calls.map((call) => call.cmd), [
    'markdown_extract_headings',
    'markdown_extract_diagnostics',
    'markdown_extract_wiki_links',
    'markdown_link_index_resolve',
  ])
  assert.deepEqual(calls[0].args.params, { content: 42 })
  assert.deepEqual(calls[1].args.params, {
    content: ['raw-content'],
    sourcePath: false,
  })
  assert.deepEqual(calls[2].args.params, { content: null })
  assert.deepEqual(calls[3].args.params, {
    workspacePath: 123,
    files: [
      { path: ['notes/index.md'], content: false },
      'loose-entry',
    ],
  })
  assert.strictEqual(links, wikiLinksResult)
  assert.strictEqual(index, linkIndexResult)

  console.log('markdown runtime rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
