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
  globalThis.isTauri = true
  mockWindows('main')

  const calls = []

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'external_http_url_resolve') {
      return String(args?.params?.url || '') === 'javascript:alert(1)'
        ? ''
        : 'https://rust.example/resolved'
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    normalizeExternalHttpUrl,
    openExternalHttpUrl,
    resolveExternalHttpAnchor,
    resolveExternalHttpUrl,
  } = await vite.ssrLoadModule('/src/services/externalLinks.ts')

  const anchor = {
    tagName: 'A',
    baseURI: 'https://docs.example/base/index.html',
    href: 'https://docs.example/paper',
    nodeType: 1,
    hasAttribute(name) {
      return name === 'download' ? false : false
    },
    getAttribute(name) {
      return name === 'href' ? '../paper' : ''
    },
    closest(selector) {
      return selector === 'a[href]' ? this : null
    },
  }

  assert.equal(
    normalizeExternalHttpUrl('../paper', 'https://docs.example/base/index.html'),
    'https://docs.example/paper',
  )
  assert.deepEqual(resolveExternalHttpAnchor(anchor), {
    anchor,
    url: 'https://docs.example/paper',
  })

  const resolved = await resolveExternalHttpUrl('../paper', 'https://docs.example/base/index.html')
  const rejected = await openExternalHttpUrl('javascript:alert(1)', 'https://docs.example/')

  assert.equal(resolved, 'https://rust.example/resolved')
  assert.equal(rejected, false)
  assert.deepEqual(
    calls.map((call) => call.cmd),
    ['external_http_url_resolve', 'external_http_url_resolve'],
  )
  assert.deepEqual(calls[0].args.params, {
    url: '../paper',
    base: 'https://docs.example/base/index.html',
  })
  assert.deepEqual(calls[1].args.params, {
    url: 'javascript:alert(1)',
    base: 'https://docs.example/',
  })

  console.log('external links rust normalization probe passed')
} finally {
  delete globalThis.isTauri
  clearTauriMocks()
  await vite.close()
}
