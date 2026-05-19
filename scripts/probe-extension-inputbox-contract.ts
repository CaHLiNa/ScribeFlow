import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const repoRoot = process.cwd()
const hostPath = path.join(repoRoot, 'src-tauri/resources/extension-host/extension-host.mjs')

const extensionSource = `
export async function activate(context) {
  context.commands.registerCommand('exampleInputBoxExtension.promptConfirm', async () => {
    const result = await context.window.showInputBox({
      title: 'Input Title',
      prompt: 'Input Prompt',
      placeholder: 'Input Placeholder',
      value: 'seed-value',
      password: true,
    })
    return {
      message: 'input confirm completed',
      progressLabel: 'Input confirm completed',
      taskState: 'succeeded',
      outputs: [
        {
          id: 'input-confirm-result',
          type: 'inlineText',
          mediaType: 'text/plain',
          title: 'Input Confirm Result',
          text: String(result ?? ''),
        },
      ],
    }
  })

  context.commands.registerCommand('exampleInputBoxExtension.promptCancel', async () => {
    const result = await context.window.showInputBox({
      title: 'Cancel Title',
      prompt: 'Cancel Prompt',
      placeholder: 'Cancel Placeholder',
      value: 'cancel-seed',
      password: false,
    })
    return {
      message: 'input cancel completed',
      progressLabel: 'Input cancel completed',
      taskState: 'succeeded',
      outputs: [
        {
          id: 'input-cancel-result',
          type: 'inlineText',
          mediaType: 'text/plain',
          title: 'Input Cancel Result',
          text: result === undefined ? 'undefined' : String(result),
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
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'scribeflow-inputbox-contract-'))
  const extensionPath = path.join(tempRoot, 'example-inputbox-extension')
  const manifestPath = path.join(extensionPath, 'package.json')
  const distDir = path.join(extensionPath, 'dist')
  const entryPath = path.join(distDir, 'extension.js')

  await import('node:fs/promises').then(({ mkdir }) => mkdir(distDir, { recursive: true }))
  await writeFile(entryPath, extensionSource, 'utf8')
  await writeFile(manifestPath, JSON.stringify({
    name: 'example-inputbox-extension',
    displayName: 'Example Input Box Extension',
    version: '0.1.0',
    type: 'module',
    main: './dist/extension.js',
    activationEvents: [
      'onCommand:exampleInputBoxExtension.promptConfirm',
      'onCommand:exampleInputBoxExtension.promptCancel',
    ],
    contributes: {
      commands: [
        {
          command: 'exampleInputBoxExtension.promptConfirm',
          title: 'Prompt Confirm',
        },
        {
          command: 'exampleInputBoxExtension.promptCancel',
          title: 'Prompt Cancel',
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
            cancelled: title === 'Cancel Title',
            result: title === 'Cancel Title' ? null : 'typed-confirm-value',
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
      extensionId: 'example-inputbox-extension',
      activationEvent: 'onCommand:exampleInputBoxExtension.promptConfirm',
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
      activationEvent: 'onCommand:exampleInputBoxExtension.promptConfirm',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      commandId: 'exampleInputBoxExtension.promptConfirm',
      envelope: {
        taskId: 'task-input-confirm',
        extensionId: 'example-inputbox-extension',
        workspaceRoot: '/tmp/workspace',
        itemId: '',
        itemHandle: '',
        referenceId: '',
        capability: '',
        commandId: 'exampleInputBoxExtension.promptConfirm',
        targetKind: 'workspace',
        targetPath: '/tmp/workspace',
        settingsJson: '{}',
      },
    })

    const cancel = await call('ExecuteCommand', {
      activationEvent: 'onCommand:exampleInputBoxExtension.promptCancel',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      commandId: 'exampleInputBoxExtension.promptCancel',
      envelope: {
        taskId: 'task-input-cancel',
        extensionId: 'example-inputbox-extension',
        workspaceRoot: '/tmp/workspace',
        itemId: '',
        itemHandle: '',
        referenceId: '',
        capability: '',
        commandId: 'exampleInputBoxExtension.promptCancel',
        targetKind: 'workspace',
        targetPath: '/tmp/workspace',
        settingsJson: '{}',
      },
    })

    const promptRequests = observed
      .filter((entry) => entry.kind === 'WindowInputRequested')
      .map((entry) => ({
        title: String(entry.payload?.title || ''),
        prompt: String(entry.payload?.prompt || ''),
        placeholder: String(entry.payload?.placeholder || ''),
        value: String(entry.payload?.value || ''),
        password: Boolean(entry.payload?.password),
      }))

    const confirmOutputs = Array.isArray(confirm?.payload?.outputs) ? confirm.payload.outputs : []
    const cancelOutputs = Array.isArray(cancel?.payload?.outputs) ? cancel.payload.outputs : []
    const confirmText = String(confirmOutputs.find((entry) => entry.id === 'input-confirm-result')?.text || '')
    const cancelText = String(cancelOutputs.find((entry) => entry.id === 'input-cancel-result')?.text || '')

    ensure(activate?.payload?.activated === true, 'input box extension did not activate', activate?.payload || {})
    ensure(promptRequests.length === 2, 'input box prompt count drifted', { promptRequests })
    ensure(
      JSON.stringify(promptRequests) === JSON.stringify([
        {
          title: 'Input Title',
          prompt: 'Input Prompt',
          placeholder: 'Input Placeholder',
          value: 'seed-value',
          password: true,
        },
        {
          title: 'Cancel Title',
          prompt: 'Cancel Prompt',
          placeholder: 'Cancel Placeholder',
          value: 'cancel-seed',
          password: false,
        },
      ]),
      'input box request payload drifted',
      { promptRequests },
    )
    ensure(confirm?.payload?.accepted === true, 'input confirm command was not accepted', confirm?.payload || {})
    ensure(cancel?.payload?.accepted === true, 'input cancel command was not accepted', cancel?.payload || {})
    ensure(confirmText === 'typed-confirm-value', 'input confirm result drifted', confirm?.payload || {})
    ensure(cancelText === 'undefined', 'input cancel result drifted', cancel?.payload || {})

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
