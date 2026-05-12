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

    if (cmd === 'latex_compile_result_normalize') {
      return args?.params?.result
    }
    if (cmd === 'latex_compile_execution_normalize') {
      return args?.params?.execution
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    normalizeLatexCompileResult,
    normalizeLatexCompileExecution,
  } = await vite.ssrLoadModule('/src/services/latex/compileNormalize.js')

  const result = {
    success: true,
    pdfPath: ' /tmp/out.pdf ',
    durationMs: 42,
    errors: [{ message: ' Missing brace ', severity: ' warning ' }],
  }
  const execution = {
    sourceState: false,
    targetState: { path: 42 },
    queueState: null,
    result: { log: ' raw log ' },
  }

  await normalizeLatexCompileResult(result)
  await normalizeLatexCompileExecution(execution)
  await normalizeLatexCompileResult(42)

  assert.deepEqual(calls.map((call) => call.cmd), [
    'latex_compile_result_normalize',
    'latex_compile_execution_normalize',
    'latex_compile_result_normalize',
  ])
  assert.deepEqual(calls[0].args.params.result, result)
  assert.deepEqual(calls[1].args.params.execution, execution)
  assert.deepEqual(calls[2].args.params.result, 42)

  console.log('latex compile normalize rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
