import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const repoRoot = process.cwd()
const hostPath = path.join(repoRoot, 'src-tauri/resources/extension-host/extension-host.mjs')

const extensionSource = `
export async function activate(context) {
  context.commands.registerCommand('exampleWindowMessageExtension.emitMessages', async () => {
    await context.window.showInformationMessage('info message')
    await context.window.showWarningMessage('warning message')
    await context.window.showErrorMessage('error message')
    return {
      message: 'window messages emitted',
      progressLabel: 'Window messages emitted',
      taskState: 'succeeded',
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
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'scribeflow-window-message-severity-'))
  const extensionPath = path.join(tempRoot, 'example-window-message-extension')
  const manifestPath = path.join(extensionPath, 'package.json')
  const distDir = path.join(extensionPath, 'dist')
  const entryPath = path.join(distDir, 'extension.js')

  await import('node:fs/promises').then(({ mkdir }) => mkdir(distDir, { recursive: true }))
  await writeFile(entryPath, extensionSource, 'utf8')
  await writeFile(manifestPath, JSON.stringify({
    name: 'example-window-message-extension',
    displayName: 'Example Window Message Extension',
    version: '0.1.0',
    type: 'module',
    main: './dist/extension.js',
    activationEvents: [
      'onCommand:exampleWindowMessageExtension.emitMessages',
    ],
    contributes: {
      commands: [
        {
          command: 'exampleWindowMessageExtension.emitMessages',
          title: 'Emit Window Messages',
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
        if (isTerminal(message)) {
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
      extensionId: 'example-window-message-extension',
      activationEvent: 'onCommand:exampleWindowMessageExtension.emitMessages',
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

    const command = await call('ExecuteCommand', {
      activationEvent: 'onCommand:exampleWindowMessageExtension.emitMessages',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      commandId: 'exampleWindowMessageExtension.emitMessages',
      envelope: {
        taskId: 'task-window-message',
        extensionId: 'example-window-message-extension',
        workspaceRoot: '/tmp/workspace',
        itemId: '',
        itemHandle: '',
        referenceId: '',
        capability: '',
        commandId: 'exampleWindowMessageExtension.emitMessages',
        targetKind: 'workspace',
        targetPath: '/tmp/workspace',
        settingsJson: '{}',
      },
    })

    const windowMessages = observed
      .filter((entry) => entry.kind === 'WindowMessage')
      .map((entry) => ({
        severity: String(entry.payload?.severity || ''),
        message: String(entry.payload?.message || ''),
      }))

    ensure(activate?.payload?.activated === true, 'window message extension did not activate', activate?.payload || {})
    ensure(command?.payload?.accepted === true, 'window message command was not accepted', command?.payload || {})
    ensure(windowMessages.length === 3, 'window message count drifted', { windowMessages })
    ensure(
      JSON.stringify(windowMessages) === JSON.stringify([
        { severity: 'info', message: 'info message' },
        { severity: 'warning', message: 'warning message' },
        { severity: 'error', message: 'error message' },
      ]),
      'window message severity ordering drifted',
      { windowMessages },
    )

    console.log(JSON.stringify({
      ok: true,
      summary: {
        windowMessages,
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
