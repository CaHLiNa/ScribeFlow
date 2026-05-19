import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const repoRoot = process.cwd()
const hostPath = path.join(repoRoot, 'src-tauri/resources/extension-host/extension-host.mjs')

const extensionSource = `
export async function activate(context) {
  context.commands.registerCommand('exampleQuickPickContractExtension.pickConfirm', async () => {
    const result = await context.window.showQuickPick([
      { id: 'alpha', label: 'Alpha', detail: 'first', value: { id: 'alpha' }, picked: true },
      { id: 'beta', label: 'Beta', description: 'second', value: { id: 'beta' } },
    ], {
      title: 'Pick Title',
      placeholder: 'Pick Placeholder',
      canPickMany: false,
    })
    return {
      message: 'quick pick confirm completed',
      progressLabel: 'Quick pick confirm completed',
      taskState: 'succeeded',
      outputs: [
        {
          id: 'quickpick-confirm-result',
          type: 'inlineText',
          mediaType: 'application/json',
          title: 'Quick Pick Confirm Result',
          text: JSON.stringify(result),
        },
      ],
    }
  })

  context.commands.registerCommand('exampleQuickPickContractExtension.pickCancel', async () => {
    const result = await context.window.showQuickPick([
      { id: 'gamma', label: 'Gamma', value: { id: 'gamma' } },
      { id: 'delta', label: 'Delta', value: { id: 'delta' }, picked: true },
    ], {
      title: 'Cancel Pick Title',
      placeholder: 'Cancel Pick Placeholder',
      canPickMany: false,
    })
    return {
      message: 'quick pick cancel completed',
      progressLabel: 'Quick pick cancel completed',
      taskState: 'succeeded',
      outputs: [
        {
          id: 'quickpick-cancel-result',
          type: 'inlineText',
          mediaType: 'text/plain',
          title: 'Quick Pick Cancel Result',
          text: result === undefined ? 'undefined' : JSON.stringify(result),
        },
      ],
    }
  })
}
`

function ensure(condition, message, details = null) {
  if (condition) return
  const error = new Error(message)
  error.details = details
  throw error
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'scribeflow-quickpick-contract-'))
  const extensionPath = path.join(tempRoot, 'example-quickpick-contract-extension')
  const manifestPath = path.join(extensionPath, 'package.json')
  const distDir = path.join(extensionPath, 'dist')
  const entryPath = path.join(distDir, 'extension.js')

  await import('node:fs/promises').then(({ mkdir }) => mkdir(distDir, { recursive: true }))
  await writeFile(entryPath, extensionSource, 'utf8')
  await writeFile(manifestPath, JSON.stringify({
    name: 'example-quickpick-contract-extension',
    displayName: 'Example Quick Pick Contract Extension',
    version: '0.1.0',
    type: 'module',
    main: './dist/extension.js',
    activationEvents: [
      'onCommand:exampleQuickPickContractExtension.pickConfirm',
      'onCommand:exampleQuickPickContractExtension.pickCancel',
    ],
    contributes: {
      commands: [
        {
          command: 'exampleQuickPickContractExtension.pickConfirm',
          title: 'Pick Confirm',
        },
        {
          command: 'exampleQuickPickContractExtension.pickCancel',
          title: 'Pick Cancel',
        },
      ],
    },
    permissions: {
      readWorkspaceFiles: true,
    },
  }, null, 2), 'utf8')

  const child = spawn('node', [hostPath], {
    cwd: repoRoot,
    stdio: ['pipe', 'pipe', 'inherit'],
  })

  const observed = []
  let currentResolve = null

  function send(method, params) {
    child.stdin.write(`${JSON.stringify({ method, params })}\n`)
  }

  function isTerminal(message) {
    return ['Activate', 'ExecuteCommand', 'Error'].includes(message.kind)
  }

  function call(method, params) {
    if (currentResolve) {
      throw new Error('probe does not support concurrent calls')
    }
    send(method, params)
    return new Promise((resolve, reject) => {
      currentResolve = { resolve, reject }
    })
  }

  child.stdout.setEncoding('utf8')
  let buffer = ''
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)
      if (line) {
        const message = JSON.parse(line)
        observed.push(message)
        if (message.kind === 'WindowInputRequested') {
          const title = String(message.payload?.title || '')
          send('RespondUiRequest', {
            requestId: message.payload.requestId,
            cancelled: title === 'Cancel Pick Title',
            result: title === 'Cancel Pick Title' ? null : { id: 'beta' },
          })
        } else if (isTerminal(message)) {
          if (!currentResolve) {
            throw new Error(`unexpected terminal message without waiter: ${message.kind}`)
          }
          const { resolve, reject } = currentResolve
          currentResolve = null
          if (message.kind === 'Error') {
            reject(new Error(String(message.payload?.message || 'Unknown extension host error')))
          } else {
            resolve(message)
          }
        }
      }
      newlineIndex = buffer.indexOf('\n')
    }
  })

  child.on('exit', (code) => {
    if (currentResolve) {
      const { reject } = currentResolve
      currentResolve = null
      reject(new Error(`extension host exited early with code ${code ?? 'unknown'}`))
    }
  })

  setTimeout(() => {
    if (!currentResolve) return
    process.exitCode = 1
    child.kill()
  }, 8000)

  try {
    const activate = await call('Activate', {
      extensionId: 'example-quickpick-contract-extension',
      activationEvent: 'onCommand:exampleQuickPickContractExtension.pickConfirm',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      permissions: { readWorkspaceFiles: true },
      capabilities: [],
      activationState: {
        settings: {},
        globalState: {},
        workspaceState: {},
      },
    })

    const confirm = await call('ExecuteCommand', {
      activationEvent: 'onCommand:exampleQuickPickContractExtension.pickConfirm',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      commandId: 'exampleQuickPickContractExtension.pickConfirm',
      envelope: {
        taskId: 'task-quickpick-confirm',
        extensionId: 'example-quickpick-contract-extension',
        workspaceRoot: '/tmp/workspace',
        itemId: '',
        itemHandle: '',
        referenceId: '',
        capability: '',
        commandId: 'exampleQuickPickContractExtension.pickConfirm',
        targetKind: 'workspace',
        targetPath: '/tmp/workspace',
        settingsJson: '{}',
      },
    })

    const cancel = await call('ExecuteCommand', {
      activationEvent: 'onCommand:exampleQuickPickContractExtension.pickCancel',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      commandId: 'exampleQuickPickContractExtension.pickCancel',
      envelope: {
        taskId: 'task-quickpick-cancel',
        extensionId: 'example-quickpick-contract-extension',
        workspaceRoot: '/tmp/workspace',
        itemId: '',
        itemHandle: '',
        referenceId: '',
        capability: '',
        commandId: 'exampleQuickPickContractExtension.pickCancel',
        targetKind: 'workspace',
        targetPath: '/tmp/workspace',
        settingsJson: '{}',
      },
    })

    const promptRequests = observed
      .filter((entry) => entry.kind === 'WindowInputRequested')
      .map((entry) => ({
        title: String(entry.payload?.title || ''),
        placeholder: String(entry.payload?.placeholder || ''),
        canPickMany: Boolean(entry.payload?.canPickMany),
        itemCount: Array.isArray(entry.payload?.items) ? entry.payload.items.length : 0,
        pickedIds: Array.isArray(entry.payload?.items)
          ? entry.payload.items.filter((item) => item?.picked).map((item) => item.id)
          : [],
      }))

    const confirmOutputs = Array.isArray(confirm?.payload?.outputs) ? confirm.payload.outputs : []
    const cancelOutputs = Array.isArray(cancel?.payload?.outputs) ? cancel.payload.outputs : []
    const confirmText = String(confirmOutputs.find((entry) => entry.id === 'quickpick-confirm-result')?.text || '')
    const cancelText = String(cancelOutputs.find((entry) => entry.id === 'quickpick-cancel-result')?.text || '')

    ensure(activate?.payload?.activated === true, 'quick pick contract extension did not activate', activate?.payload || {})
    ensure(promptRequests.length === 2, 'quick pick request count drifted', { promptRequests })
    ensure(
      JSON.stringify(promptRequests) === JSON.stringify([
        {
          title: 'Pick Title',
          placeholder: 'Pick Placeholder',
          canPickMany: false,
          itemCount: 2,
          pickedIds: ['alpha'],
        },
        {
          title: 'Cancel Pick Title',
          placeholder: 'Cancel Pick Placeholder',
          canPickMany: false,
          itemCount: 2,
          pickedIds: ['delta'],
        },
      ]),
      'quick pick request payload drifted',
      { promptRequests },
    )
    ensure(confirm?.payload?.accepted === true, 'quick pick confirm command was not accepted', confirm?.payload || {})
    ensure(cancel?.payload?.accepted === true, 'quick pick cancel command was not accepted', cancel?.payload || {})
    ensure(confirmText === JSON.stringify({ id: 'beta' }), 'quick pick confirm result drifted', confirm?.payload || {})
    ensure(cancelText === 'undefined', 'quick pick cancel result drifted', cancel?.payload || {})

    console.log(JSON.stringify({
      ok: true,
      summary: {
        promptRequests,
        confirmText,
        cancelText,
      },
    }, null, 2))
  } finally {
    child.kill()
  }
}

void main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error?.message || String(error),
    details: error?.details || null,
  }, null, 2))
  process.exitCode = 1
})
