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

    if (cmd === 'workspace_read_text_file') {
      return 'text body'
    }
    if (cmd === 'workspace_write_text_file') {
      return null
    }
    if (cmd === 'workspace_read_file_base64') {
      return 'AAECA/8='
    }
    if (cmd === 'workspace_write_file_base64') {
      return null
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    readWorkspaceTextFile,
    writeTextFile,
  } = await vite.ssrLoadModule('/src/services/fileStoreIO.ts')
  const {
    readPdfArtifactBase64,
    writePdfArtifactBase64,
  } = await vite.ssrLoadModule('/src/services/pdf/artifactPreview.ts')

  await readWorkspaceTextFile(' /tmp/workspace/note.md ', '64')
  await readWorkspaceTextFile(' /tmp/workspace/default.md ')
  await writeTextFile(' /tmp/workspace/write.md ', '  body keeps spaces  ')
  await readPdfArtifactBase64(' /tmp/workspace/artifact.pdf ')
  await readPdfArtifactBase64(42)
  await writePdfArtifactBase64(' /tmp/workspace/artifact.pdf ', ' AAECA/8= ')

  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'workspace_read_text_file',
      'workspace_read_text_file',
      'workspace_write_text_file',
      'workspace_read_file_base64',
      'workspace_read_file_base64',
      'workspace_write_file_base64',
    ],
  )
  assert.deepEqual(calls[0].args.params, {
    path: ' /tmp/workspace/note.md ',
    maxBytes: '64',
  })
  assert.deepEqual(calls[1].args.params, {
    path: ' /tmp/workspace/default.md ',
    maxBytes: undefined,
  })
  assert.deepEqual(calls[2].args.params, {
    path: ' /tmp/workspace/write.md ',
    content: '  body keeps spaces  ',
  })
  assert.deepEqual(calls[3].args.params, {
    path: ' /tmp/workspace/artifact.pdf ',
  })
  assert.deepEqual(calls[4].args.params, {
    path: 42,
  })
  assert.deepEqual(calls[5].args.params, {
    path: ' /tmp/workspace/artifact.pdf ',
    data: ' AAECA/8= ',
  })

  console.log('workspace file io rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
