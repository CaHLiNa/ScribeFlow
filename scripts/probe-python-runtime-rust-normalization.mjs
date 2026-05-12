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

function normalizeString(value) {
  return typeof value === 'string' ? value : ''
}

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  mockWindows('main')

  const calls = []

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'python_runtime_list') {
      const runtime = {
        found: true,
        path: ' /usr/bin/python3 ',
        version: ' 3.13.0 ',
        source: ' python_runtime_list ',
      }
      return {
        interpreters: [runtime],
        selectedInterpreter: runtime,
        resolvedInterpreter: runtime,
        selectionValid: true,
      }
    }

    if (cmd === 'python_runtime_compile') {
      const filePath = normalizeString(args?.params?.filePath)
      const interpreterPath = normalizeString(args?.params?.interpreterPath)
      return {
        success: true,
        errors: [{ message: ' rust-owned raw error ' }],
        warnings: [{ message: ' rust-owned raw warning ' }],
        stdout: filePath ? 'ok' : '',
        stderr: '',
        commandPreview: `${interpreterPath || 'python3'} ${filePath}`,
        exitCode: 0,
        durationMs: 1,
        interpreter: {
          found: true,
          path: ' /usr/bin/python3 ',
          version: ' 3.13.0 ',
          source: ' python_runtime_compile ',
        },
        interpreterPath,
        interpreterVersion: interpreterPath ? '3.13.0' : '',
      }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { listPythonRuntimes, compilePythonFile } = await vite.ssrLoadModule(
    '/src/services/pythonRuntime.js',
  )

  const listResult = await listPythonRuntimes(42)
  const compileResult = await compilePythonFile(42, null)
  const validCompileResult = await compilePythonFile('/tmp/script.py', '/usr/bin/python3')

  assert.deepEqual(
    calls.map((call) => call.cmd),
    ['python_runtime_list', 'python_runtime_compile', 'python_runtime_compile'],
  )
  assert.deepEqual(calls[0].args.params, { interpreterPath: 42 })
  assert.deepEqual(calls[1].args.params, { filePath: 42, interpreterPath: null })
  assert.deepEqual(calls[2].args.params, {
    filePath: '/tmp/script.py',
    interpreterPath: '/usr/bin/python3',
  })
  assert.deepEqual(listResult.interpreters, [
    {
      found: true,
      path: ' /usr/bin/python3 ',
      version: ' 3.13.0 ',
      source: ' python_runtime_list ',
    },
  ])
  assert.equal(compileResult.success, true)
  assert.deepEqual(compileResult.errors, [{ message: ' rust-owned raw error ' }])
  assert.equal(validCompileResult.success, true)
  assert.deepEqual(validCompileResult.interpreter, {
    found: true,
    path: ' /usr/bin/python3 ',
    version: ' 3.13.0 ',
    source: ' python_runtime_compile ',
  })
  assert.equal(validCompileResult.interpreterPath, '/usr/bin/python3')

  console.log('python runtime rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
