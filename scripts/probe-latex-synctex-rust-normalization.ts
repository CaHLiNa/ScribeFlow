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

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'workspace_synctex_backward') {
      return {
        file: ' chapter/main.tex ',
        line: '12',
        strict_line: true,
      }
    }

    if (cmd === 'workspace_synctex_forward') {
      return {
        mode: 'rects',
        records: [
          {
            page: 2,
            x: 18.5,
            y: 24.25,
            h: 18.5,
            v: 24.25,
            W: 80,
            H: 12,
            indicator: true,
          },
        ],
        record: {
          page: 2,
          x: 18.5,
          y: 24.25,
          h: 18.5,
          v: 24.25,
          W: 80,
          H: 12,
          indicator: true,
        },
        strictLine: true,
      }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    requestLatexPdfBackwardSync,
    requestLatexPdfForwardSync,
  } = await vite.ssrLoadModule('/src/services/pdf/artifactPreview.ts')

  const backwardOptions = {
    synctexPath: 42,
    page: '2',
    x: '72.5',
    y: null,
    extra: false,
  }
  const forwardOptions = {
    synctexPath: ' /tmp/main.synctex.gz ',
    filePath: false,
    line: '9',
    column: 0,
  }

  const backward = await requestLatexPdfBackwardSync(backwardOptions)
  const forward = await requestLatexPdfForwardSync(forwardOptions)

  assert.deepEqual(
    calls.map((call) => call.cmd),
    ['workspace_synctex_backward', 'workspace_synctex_forward'],
  )
  assert.deepEqual(calls[0].args, { params: backwardOptions })
  assert.deepEqual(calls[1].args, { params: forwardOptions })
  assert.deepEqual(backward, {
    file: ' chapter/main.tex ',
    line: '12',
    strict_line: true,
  })
  assert.equal(forward.mode, 'rects')
  assert.equal(forward.strictLine, true)
  assert.equal(forward.records[0].page, 2)

  console.log('latex synctex rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
