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

    if (cmd === 'workspace_create_dir') {
      return { ok: true, path: '/tmp/workspace/folder', code: null }
    }
    if (cmd === 'workspace_rename_path') {
      return { ok: true, code: null }
    }
    if (cmd === 'workspace_duplicate_path') {
      return { ok: true, path: '/tmp/workspace/note copy.md', isDir: false }
    }
    if (cmd === 'workspace_move_path') {
      return { ok: true, destPath: '/tmp/workspace/archive/note.md' }
    }
    if (cmd === 'workspace_copy_external_path') {
      return { ok: true, path: '/tmp/workspace/imported.pdf', isDir: false }
    }
    if (cmd === 'workspace_delete_path') {
      return { ok: true, path: '/tmp/workspace/note.md', isDir: false }
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    copyExternalWorkspaceFile,
    createWorkspaceFolder,
    deleteWorkspacePath,
    duplicateWorkspacePath,
    moveWorkspacePath,
    renameWorkspacePath,
  } = await vite.ssrLoadModule('/src/services/fileStoreIO.ts')

  await createWorkspaceFolder(' /tmp/workspace ', ' folder ')
  await renameWorkspacePath(' /tmp/workspace/old.md ', ' /tmp/workspace/new.md ')
  await duplicateWorkspacePath(' /tmp/workspace/note.md ')
  await moveWorkspacePath(' /tmp/workspace/note.md ', ' /tmp/workspace/archive ')
  await copyExternalWorkspaceFile(' /tmp/imported.pdf ', ' /tmp/workspace ')
  await deleteWorkspacePath(' /tmp/workspace/note.md ')

  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'workspace_create_dir',
      'workspace_rename_path',
      'workspace_duplicate_path',
      'workspace_move_path',
      'workspace_copy_external_path',
      'workspace_delete_path',
    ],
  )
  assert.deepEqual(calls[0].args.params, {
    dirPath: ' /tmp/workspace ',
    name: ' folder ',
  })
  assert.deepEqual(calls[1].args.params, {
    oldPath: ' /tmp/workspace/old.md ',
    newPath: ' /tmp/workspace/new.md ',
  })
  assert.deepEqual(calls[2].args.params, {
    path: ' /tmp/workspace/note.md ',
  })
  assert.deepEqual(calls[3].args.params, {
    srcPath: ' /tmp/workspace/note.md ',
    destDir: ' /tmp/workspace/archive ',
  })
  assert.deepEqual(calls[4].args.params, {
    srcPath: ' /tmp/imported.pdf ',
    destDir: ' /tmp/workspace ',
  })
  assert.deepEqual(calls[5].args.params, {
    path: ' /tmp/workspace/note.md ',
  })

  console.log('workspace path mutation rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
