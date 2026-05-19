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

    if (cmd === 'diagnostics_normalize_problems') {
      return args?.params?.problems || []
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    normalizeProblem,
    normalizeProblems,
  } = await vite.ssrLoadModule('/src/services/documentIntelligence/diagnostics.ts')

  const problem = {
    sourcePath: ' /tmp/main.tex ',
    line: 2,
    column: false,
    message: ' Missing brace ',
    severity: ' warning ',
  }
  const defaults = {
    sourcePath: 42,
    message: ' fallback ',
    severity: false,
  }

  const single = await normalizeProblem(problem, defaults)
  await normalizeProblems(42, false)

  assert.deepEqual(calls.map((call) => call.cmd), [
    'diagnostics_normalize_problems',
    'diagnostics_normalize_problems',
  ])
  assert.deepEqual(calls[0].args.params, {
    problems: [problem],
    defaults,
  })
  assert.equal(single, problem)
  assert.deepEqual(calls[1].args.params, {
    problems: 42,
    defaults: false,
  })

  console.log('diagnostics rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
