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
const originalFetch = globalThis.fetch

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  mockWindows('main')

  const calls = []
  const releasePayload = {
    tag_name: 'v9.8.7',
    html_url: 'https://github.com/CaHLiNa/ScribeFlow/releases/tag/v9.8.7',
    published_at: '2026-05-13T00:00:00Z',
    assets: [
      {
        name: 'ScribeFlow-9.8.7-darwin-aarch64.dmg',
        browser_download_url:
          'https://github.com/CaHLiNa/ScribeFlow/releases/download/v9.8.7/ScribeFlow-9.8.7-darwin-aarch64.dmg',
        size: 100,
      },
    ],
  }
  const updateResult = {
    latestVersion: 'rust-owned-latest-version',
    releaseUrl: 'rust-owned-release-url',
    publishedAt: 'rust-owned-published-at',
    installerAsset: {
      name: 'rust-owned-installer',
      downloadUrl: 'rust-owned-download-url',
      size: 1,
      score: 99,
    },
    hasUpdate: 'rust-owned-has-update',
  }

  globalThis.fetch = async (url, options) => {
    calls.push({ kind: 'fetch', url: String(url), options })
    return {
      ok: true,
      async json() {
        return releasePayload
      },
    }
  }

  mockIPC(async (cmd, args) => {
    calls.push({ kind: 'ipc', cmd, args })

    if (cmd === 'app_update_release_resolve') {
      return updateResult
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { checkForAppUpdates } = await vite.ssrLoadModule('/src/services/appUpdater.js')
  const result = await checkForAppUpdates('1.2.3')

  assert.strictEqual(result, updateResult)
  assert.equal(calls[0].kind, 'fetch')
  assert.match(calls[0].url, /^https:\/\/api\.github\.com\/repos\/CaHLiNa\/ScribeFlow\/releases\/latest\?_ts=/)
  assert.equal(calls[0].options.cache, 'no-store')
  assert.equal(calls[0].options.headers.Accept, 'application/vnd.github+json')
  assert.deepEqual(calls[1], {
    kind: 'ipc',
    cmd: 'app_update_release_resolve',
    args: {
      currentVersion: '1.2.3',
      payload: releasePayload,
    },
  })

  console.log('app update rust normalization probe passed')
} finally {
  globalThis.fetch = originalFetch
  clearTauriMocks()
  await vite.close()
}
