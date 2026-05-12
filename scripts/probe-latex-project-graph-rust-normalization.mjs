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

    if (cmd === 'latex_compile_request_resolve') {
      return {
        sourcePath: typeof args?.params?.sourcePath === 'string' ? args.params.sourcePath : '',
        rootPath: '/tmp/main.tex',
        previewPath: '/tmp/main.pdf',
      }
    }

    if (cmd === 'latex_compile_targets_resolve') {
      return [
        {
          sourcePath: typeof args?.params?.changedPath === 'string' ? args.params.changedPath : '',
          rootPath: '/tmp/main.tex',
          previewPath: '/tmp/main.pdf',
        },
      ]
    }

    if (cmd === 'latex_project_graph_resolve') {
      return {
        sourcePath: typeof args?.params?.sourcePath === 'string' ? args.params.sourcePath : '',
        rootPath: '/tmp/main.tex',
        previewPath: '/tmp/main.pdf',
        outlineItems: [],
      }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    resolveLatexCompileRequest,
    resolveLatexCompileTargets,
  } = await vite.ssrLoadModule('/src/services/latex/runtime.js')
  const { resolveLatexProjectGraph } = await vite.ssrLoadModule('/src/services/latex/projectGraph.js')

  await resolveLatexCompileRequest({
    sourcePath: 42,
    workspacePath: false,
    flatFiles: 17,
    contentOverrides: null,
  })
  await resolveLatexCompileTargets({
    changedPath: 42,
    workspacePath: false,
    flatFiles: 17,
    contentOverrides: null,
  })
  await resolveLatexProjectGraph(' /tmp/chapter.tex ', {
    workspacePath: ' /tmp/workspace ',
    flatFiles: [
      ' /tmp/main.tex ',
      { path: ' /tmp/refs.bib ' },
    ],
    contentOverrides: {
      ' /tmp/chapter.tex ': '  body keeps spaces  ',
    },
  })

  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'latex_compile_request_resolve',
      'latex_compile_targets_resolve',
      'latex_project_graph_resolve',
    ],
  )
  assert.deepEqual(calls[0].args.params, {
    sourcePath: 42,
    workspacePath: false,
    flatFiles: 17,
    contentOverrides: null,
  })
  assert.deepEqual(calls[1].args.params, {
    changedPath: 42,
    workspacePath: false,
    flatFiles: 17,
    contentOverrides: null,
  })
  assert.deepEqual(calls[2].args.params, {
    sourcePath: ' /tmp/chapter.tex ',
    workspacePath: '/tmp/workspace',
    flatFiles: [
      '/tmp/main.tex',
      '/tmp/refs.bib',
    ],
    contentOverrides: {
      ' /tmp/chapter.tex ': '  body keeps spaces  ',
    },
  })

  console.log('latex project graph rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
