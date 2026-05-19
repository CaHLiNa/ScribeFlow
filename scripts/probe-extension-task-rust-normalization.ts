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
  const listedTasks = {
    items: [{ id: 'task-a', state: 'running' }],
    rustOwned: true,
  }
  const cancelledExtensionTasks = {
    items: [{ id: 'task-d', state: 'cancelled' }],
    rustOwned: true,
  }

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'extension_task_list') {
      return listedTasks
    }

    if (cmd === 'extension_task_get') {
      return { id: 'task-b', state: 'succeeded' }
    }

    if (cmd === 'extension_task_cancel') {
      return { id: 'task-c', state: 'cancelled' }
    }

    if (cmd === 'extension_task_cancel_extension') {
      return cancelledExtensionTasks
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    cancelExtensionTask,
    cancelExtensionTasksForExtension,
    getExtensionTask,
    listExtensionTasks,
  } = await vite.ssrLoadModule('/src/services/extensions/extensionTasks.ts')

  const listed = await listExtensionTasks(' /tmp/workspace-a ')
  const task = await getExtensionTask(42)
  const cancelled = await cancelExtensionTask(' task-c ')
  const cancelledForExtension = await cancelExtensionTasksForExtension(
    ' example-pdf-extension ',
    ' /tmp/workspace-b ',
  )

  assert.equal(listed, listedTasks)
  assert.equal(task.id, 'task-b')
  assert.equal(cancelled.state, 'cancelled')
  assert.equal(cancelledForExtension, cancelledExtensionTasks)
  assert.deepEqual(
    calls.map((call) => call.cmd),
    [
      'extension_task_list',
      'extension_task_get',
      'extension_task_cancel',
      'extension_task_cancel_extension',
    ],
  )
  assert.deepEqual(calls[0].args, {
    params: {
      workspaceRoot: ' /tmp/workspace-a ',
    },
  })
  assert.deepEqual(calls[1].args, {
    params: {
      taskId: 42,
    },
  })
  assert.deepEqual(calls[2].args, {
    params: {
      taskId: ' task-c ',
    },
  })
  assert.deepEqual(calls[3].args, {
    params: {
      extensionId: ' example-pdf-extension ',
      workspaceRoot: ' /tmp/workspace-b ',
    },
  })

  console.log('extension task rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
