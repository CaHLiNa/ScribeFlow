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

    if (cmd === 'document_workflow_session_load') {
      return {
        rawWorkspaceDataDir: args?.params?.workspaceDataDir,
      }
    }

    if (cmd === 'document_workflow_session_save') {
      return {
        rawWorkspaceDataDir: args?.params?.workspaceDataDir,
        rawState: args?.params?.state,
      }
    }

    if (cmd === 'document_workflow_latex_preview_reconcile') {
      return {
        rawState: args?.params?.state,
      }
    }

    if (cmd === 'document_workflow_latex_preview_apply') {
      return {
        rawState: args?.params?.state,
        rawFilePath: args?.params?.filePath,
        rawPreviewState: args?.params?.previewState,
      }
    }

    if (cmd === 'document_workflow_preview_binding_apply') {
      return {
        rawState: args?.params?.state,
        rawIntent: args?.params?.intent,
        rawBinding: args?.params?.binding,
        rawPreviewPath: args?.params?.previewPath,
      }
    }

    if (cmd === 'document_workflow_preview_close_effect_resolve') {
      return {
        rawPreviewPath: args?.params?.previewPath,
        rawPreviewBinding: args?.params?.previewBinding,
      }
    }

    if (cmd === 'document_workflow_session_mutation_apply') {
      return {
        rawState: args?.params?.state,
        rawIntent: args?.params?.intent,
        rawFilePath: args?.params?.filePath,
        rawSourcePath: args?.params?.sourcePath,
        rawVisibility: args?.params?.visibility,
        rawPreviewKind: args?.params?.previewKind,
        rawSessionPatch: args?.params?.sessionPatch,
      }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    applyDocumentWorkflowLatexPreviewState,
    applyDocumentWorkflowPreviewBindingState,
    applyDocumentWorkflowSessionMutation,
    loadDocumentWorkflowSessionState,
    reconcileDocumentWorkflowLatexPreviewState,
    resolveDocumentWorkflowPreviewCloseEffect,
    saveDocumentWorkflowSessionState,
  } = await vite.ssrLoadModule('/src/services/documentWorkflow/sessionStateBridge.ts')

  const rawWorkspaceDataDir = 42
  const rawState = 'raw-state-for-rust'
  const rawFilePath = false
  const rawPreviewState = ['raw-preview-state-for-rust']
  const rawBinding = 'raw-binding-for-rust'
  const rawPreviewPath = 17
  const rawPreviewBinding = 'raw-preview-binding-for-rust'
  const rawMutation = {
    intent: false,
    filePath: 0,
    sourcePath: ['source-path'],
    visibility: null,
    previewKind: { kind: 'html' },
    sessionPatch: 'raw-session-patch-for-rust',
  }

  const loaded = await loadDocumentWorkflowSessionState(rawWorkspaceDataDir)
  const saved = await saveDocumentWorkflowSessionState(rawWorkspaceDataDir, rawState)
  const reconciled = await reconcileDocumentWorkflowLatexPreviewState(rawState)
  const latexApplied = await applyDocumentWorkflowLatexPreviewState(
    rawState,
    rawFilePath,
    rawPreviewState,
  )
  const bindingApplied = await applyDocumentWorkflowPreviewBindingState(
    rawState,
    rawMutation.intent,
    rawBinding,
    rawPreviewPath,
  )
  const closeEffect = await resolveDocumentWorkflowPreviewCloseEffect(
    rawPreviewPath,
    rawPreviewBinding,
  )
  const mutationApplied = await applyDocumentWorkflowSessionMutation(rawState, rawMutation)

  assert.deepEqual(calls.map((call) => call.cmd), [
    'document_workflow_session_load',
    'document_workflow_session_save',
    'document_workflow_latex_preview_reconcile',
    'document_workflow_latex_preview_apply',
    'document_workflow_preview_binding_apply',
    'document_workflow_preview_close_effect_resolve',
    'document_workflow_session_mutation_apply',
  ])
  assert.deepEqual(calls[0].args.params, { workspaceDataDir: rawWorkspaceDataDir })
  assert.deepEqual(calls[1].args.params, {
    workspaceDataDir: rawWorkspaceDataDir,
    state: rawState,
  })
  assert.deepEqual(calls[2].args.params, { state: rawState })
  assert.deepEqual(calls[3].args.params, {
    state: rawState,
    filePath: rawFilePath,
    previewState: rawPreviewState,
  })
  assert.deepEqual(calls[4].args.params, {
    state: rawState,
    intent: rawMutation.intent,
    binding: rawBinding,
    previewPath: rawPreviewPath,
  })
  assert.deepEqual(calls[5].args.params, {
    previewPath: rawPreviewPath,
    previewBinding: rawPreviewBinding,
  })
  assert.deepEqual(calls[6].args.params, {
    state: rawState,
    intent: rawMutation.intent,
    filePath: rawMutation.filePath,
    sourcePath: rawMutation.sourcePath,
    visibility: rawMutation.visibility,
    previewKind: rawMutation.previewKind,
    sessionPatch: rawMutation.sessionPatch,
  })

  assert.equal(loaded.rawWorkspaceDataDir, rawWorkspaceDataDir)
  assert.equal(saved.rawState, rawState)
  assert.equal(reconciled.rawState, rawState)
  assert.equal(latexApplied.rawFilePath, rawFilePath)
  assert.equal(bindingApplied.rawBinding, rawBinding)
  assert.equal(closeEffect.rawPreviewBinding, rawPreviewBinding)
  assert.equal(mutationApplied.rawSessionPatch, rawMutation.sessionPatch)

  console.log('document workflow session rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
