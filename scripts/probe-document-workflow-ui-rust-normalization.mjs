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

    if (cmd === 'document_workflow_ui_resolve') {
      return {
        kind: 'latex',
        phase: 'ready',
        rawArtifactPath: args?.params?.artifactPath,
      }
    }

    if (cmd === 'document_workflow_latex_problems_resolve') {
      return [
        {
          id: 'latex:error:/tmp/main.tex:0',
          sourcePath: '/tmp/main.tex',
          line: null,
          column: null,
          severity: 'error',
          message: 'Missing brace',
          origin: 'compile',
          actionable: true,
          raw: 'Missing brace',
        },
      ]
    }

    if (cmd === 'document_workflow_python_problems_resolve') {
      return 'not-an-array'
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const { resolveDocumentWorkflowUiState } = await vite.ssrLoadModule(
    '/src/services/documentWorkflow/workflowUiStateBridge.js',
  )
  const { resolveDocumentWorkflowLatexProblems } = await vite.ssrLoadModule(
    '/src/services/documentWorkflow/latexProblemsBridge.js',
  )
  const { resolveDocumentWorkflowPythonProblems } = await vite.ssrLoadModule(
    '/src/services/documentWorkflow/pythonProblemsBridge.js',
  )

  const uiParams = {
    filePath: 42,
    previewState: false,
    markdownState: 'invalid',
    latexState: { status: 'success' },
    queueState: ['queued'],
    artifactPath: ['/tmp/main.pdf'],
  }
  const latexParams = {
    sourcePath: 17,
    state: 'raw-state-for-rust',
  }

  const uiState = await resolveDocumentWorkflowUiState(uiParams)
  const latexProblems = await resolveDocumentWorkflowLatexProblems(latexParams)
  const pythonProblems = await resolveDocumentWorkflowPythonProblems(false)

  assert.deepEqual(calls.map((call) => call.cmd), [
    'document_workflow_ui_resolve',
    'document_workflow_latex_problems_resolve',
    'document_workflow_python_problems_resolve',
  ])
  assert.deepEqual(calls[0].args.params, uiParams)
  assert.deepEqual(calls[1].args.params, latexParams)
  assert.equal(calls[2].args.params, false)
  assert.equal(uiState.rawArtifactPath, uiParams.artifactPath)
  assert.equal(latexProblems[0].id, 'latex:error:/tmp/main.tex:0')
  assert.deepEqual(pythonProblems, [])

  console.log('document workflow ui rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
