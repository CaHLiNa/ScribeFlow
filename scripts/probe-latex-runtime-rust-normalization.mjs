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

    if (cmd === 'latex_runtime_schedule') {
      return {
        queueState: {
          targetPath: typeof args?.params?.targetPath === 'string' ? args.params.targetPath.trim() : '',
        },
      }
    }

    if (cmd === 'latex_runtime_lint_resolve') {
      return {
        status: typeof args?.params?.texPath === 'string' && args.params.texPath.trim()
          ? 'ready'
          : 'unavailable',
        diagnostics: [],
        error: null,
        updatedAt: 1,
      }
    }

    if (cmd === 'latex_runtime_compile_execute') {
      return {
        sourceState: {},
        targetState: {},
        queueState: null,
        result: {
          success: false,
          errors: [],
          warnings: [],
          log: '',
          durationMs: 0,
        },
      }
    }

    if (cmd === 'latex_runtime_cancel') {
      return null
    }

    if (cmd === 'latex_compile_execution_normalize') {
      return args?.execution
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    scheduleLatexRuntime,
    resolveLatexLintState,
    executeLatexRuntimeCompile,
    cancelLatexRuntime,
  } = await vite.ssrLoadModule('/src/services/latex/runtime.js')

  await scheduleLatexRuntime({
    sourcePath: 42,
    targetPath: ' /tmp/main.tex ',
    reason: false,
    buildExtraArgs: null,
    now: 'soon',
  })
  await resolveLatexLintState({
    texPath: 42,
    content: 123,
    customSystemTexPath: false,
    workspacePath: null,
  })
  await executeLatexRuntimeCompile({
    texPath: 42,
    targetPath: null,
    projectRootPath: false,
    projectPreviewPath: 17,
    reason: undefined,
    buildExtraArgs: ['--keep-logs'],
    now: 'later',
    compilerPreference: 123,
    enginePreference: false,
    customSystemTexPath: null,
    customTectonicPath: undefined,
  })
  await cancelLatexRuntime(42)

  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'latex_runtime_schedule',
      'latex_runtime_lint_resolve',
      'latex_runtime_compile_execute',
      'latex_compile_execution_normalize',
      'latex_runtime_cancel',
    ],
  )
  assert.deepEqual(calls[0].args.params, {
    sourcePath: 42,
    targetPath: ' /tmp/main.tex ',
    reason: false,
    buildExtraArgs: null,
    now: 'soon',
  })
  assert.deepEqual(calls[1].args.params, {
    texPath: 42,
    content: 123,
    customSystemTexPath: false,
    workspacePath: null,
  })
  assert.deepEqual(calls[2].args.params, {
    texPath: 42,
    targetPath: null,
    projectRootPath: false,
    projectPreviewPath: 17,
    reason: undefined,
    buildExtraArgs: ['--keep-logs'],
    now: 'later',
    compilerPreference: 123,
    enginePreference: false,
    customSystemTexPath: null,
    customTectonicPath: undefined,
  })
  assert.deepEqual(calls[4].args.params, { targetPaths: 42 })

  console.log('latex runtime rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
