import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const repoRoot = process.cwd()
const hostPath = path.join(repoRoot, 'src-tauri/resources/extension-host/extension-host.mjs')

const extensionSource = `
export async function activate(context) {
  context.commands.registerCommand('exampleQuickPickExtension.pickMany', async () => {
    const selected = await context.window.showQuickPick([
      {
        id: 'alpha',
        label: 'Alpha',
        value: { id: 'alpha' },
        picked: true,
      },
      {
        id: 'beta',
        label: 'Beta',
        value: { id: 'beta' },
      },
      {
        id: 'gamma',
        label: 'Gamma',
        value: { id: 'gamma' },
        picked: true,
      },
    ], {
      title: 'Pick many',
      canPickMany: true,
      placeholder: 'Choose references',
    })

    return {
      message: 'multi-select completed',
      progressLabel: 'Multi-select completed',
      taskState: 'succeeded',
      outputs: [
        {
          id: 'picked-count',
          type: 'inlineText',
          mediaType: 'text/plain',
          title: 'Picked Count',
          text: String(Array.isArray(selected) ? selected.length : 0),
        },
        {
          id: 'picked-json',
          type: 'inlineText',
          mediaType: 'application/json',
          title: 'Picked JSON',
          text: JSON.stringify(selected),
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
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'scribeflow-quickpick-host-multi-'))
  const extensionPath = path.join(tempRoot, 'example-quickpick-extension')
  const manifestPath = path.join(extensionPath, 'package.json')
  const distDir = path.join(extensionPath, 'dist')
  const entryPath = path.join(distDir, 'extension.js')

  await import('node:fs/promises').then(({ mkdir }) => mkdir(distDir, { recursive: true }))
  await writeFile(entryPath, extensionSource, 'utf8')
  await writeFile(manifestPath, JSON.stringify({
    name: 'example-quickpick-extension',
    displayName: 'Example Quick Pick Extension',
    version: '0.1.0',
    type: 'module',
    main: './dist/extension.js',
    activationEvents: [
      'onCommand:exampleQuickPickExtension.pickMany',
    ],
    contributes: {
      commands: [
        {
          command: 'exampleQuickPickExtension.pickMany',
          title: 'Pick Many',
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
        if (message.kind === 'WindowInputRequested') {
          send('RespondUiRequest', {
            requestId: message.payload.requestId,
            cancelled: false,
            result: [{ id: 'alpha' }, { id: 'beta' }, { id: 'gamma' }],
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
      extensionId: 'example-quickpick-extension',
      activationEvent: 'onCommand:exampleQuickPickExtension.pickMany',
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
      activationEvent: 'onCommand:exampleQuickPickExtension.pickMany',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      commandId: 'exampleQuickPickExtension.pickMany',
      envelope: {
        taskId: 'task-quickpick-multi',
        extensionId: 'example-quickpick-extension',
        workspaceRoot: '/tmp/workspace',
        itemId: '',
        itemHandle: '',
        referenceId: '',
        capability: '',
        commandId: 'exampleQuickPickExtension.pickMany',
        targetKind: 'workspace',
        targetPath: '/tmp/workspace',
        settingsJson: '{}',
      },
    })

    const outputs = Array.isArray(command?.payload?.outputs) ? command.payload.outputs : []
    const pickedCount = String(outputs.find((entry) => entry.id === 'picked-count')?.text || '')
    const pickedJson = String(outputs.find((entry) => entry.id === 'picked-json')?.text || '')

    ensure(activate?.payload?.activated === true, 'quick pick multi-select extension did not activate', activate?.payload || {})
    ensure(command?.payload?.accepted === true, 'multi-select quick pick command was not accepted', command?.payload || {})
    ensure(pickedCount === '3', 'multi-select quick pick count drifted', command?.payload || {})
    ensure(
      pickedJson === JSON.stringify([{ id: 'alpha' }, { id: 'beta' }, { id: 'gamma' }]),
      'multi-select quick pick payload drifted',
      command?.payload || {},
    )

    console.log(JSON.stringify({
      ok: true,
      summary: {
        pickedCount,
        pickedJson,
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
