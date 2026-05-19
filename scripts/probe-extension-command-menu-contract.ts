import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const repoRoot = process.cwd()
const hostPath = path.join(repoRoot, 'src-tauri/resources/extension-host/extension-host.mjs')

const extensionSource = `
export async function activate(context) {
  let disposedViewItem = false
  let disposedCommandPalette = false

  context.commands.registerCommand('exampleCommandMenuContractExtension.target', async (label = 'default-label') => ({
    message: 'target command executed',
    progressLabel: 'Target command executed',
    taskState: 'succeeded',
    outputs: [
      {
        id: 'target-command-result',
        type: 'inlineText',
        mediaType: 'text/plain',
        title: 'Target Command Result',
        text: String(label || ''),
      },
    ],
  }), {
    title: 'Target Command',
    category: 'Contract',
  })

  context.commands.registerCommand('exampleCommandMenuContractExtension.runner', async () => {
    const executed = await context.commands.executeCommand(
      'exampleCommandMenuContractExtension.target',
      'runner-called',
    )

    const viewItemDisposable = context.menus.registerAction('exampleCommandMenuContractExtension.target', {
      surface: 'view/item/context',
      title: 'Temporary Item Action',
      category: 'Contract',
      when: 'viewItem.contextValue == contract-item',
    })
    viewItemDisposable.dispose()
    disposedViewItem = true

    const paletteDisposable = context.menus.registerAction('exampleCommandMenuContractExtension.target', {
      surface: 'commandPalette',
      title: 'Disposed Palette Action',
      category: 'Contract',
    })
    paletteDisposable.dispose()
    disposedCommandPalette = true

    return {
      message: 'runner command executed',
      progressLabel: 'Runner command executed',
      taskState: 'succeeded',
      outputs: [
        {
          id: 'runner-summary',
          type: 'inlineText',
          mediaType: 'application/json',
          title: 'Runner Summary',
          text: JSON.stringify({
            executedAccepted: Object.prototype.hasOwnProperty.call(executed || {}, 'accepted')
              ? executed?.accepted === true
              : null,
            executedTaskState: executed?.taskState || '',
            executedOutputText: Array.isArray(executed?.outputs)
              ? String(executed.outputs.find((entry) => entry.id === 'target-command-result')?.text || '')
              : '',
            disposedViewItem,
            disposedCommandPalette,
          }),
        },
      ],
    }
  }, {
    title: 'Runner Command',
    category: 'Contract',
  })

  context.menus.registerAction('exampleCommandMenuContractExtension.target', {
    surface: 'commandPalette',
    title: 'Palette Action',
    category: 'Contract',
    when: 'resource.kind == pdf',
  })
  context.menus.registerAction('exampleCommandMenuContractExtension.target', {
    surface: 'view/title',
    title: 'View Title Action',
    category: 'Contract',
    when: 'activeView == extension:exampleCommandMenuContractExtension.tools',
  })
  context.menus.registerAction('exampleCommandMenuContractExtension.target', {
    surface: 'view/item/context',
    title: 'Persistent Item Action',
    category: 'Contract',
    when: 'viewItem.contextValue == contract-item',
  })
}
`

function ensure(condition, message, details = null) {
  if (condition) return
  const error = new Error(message)
  error.details = details
  throw error
}

function isTerminal(message) {
  return ['Activate', 'ExecuteCommand', 'Error'].includes(message.kind)
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'scribeflow-command-menu-contract-'))
  const extensionPath = path.join(tempRoot, 'example-command-menu-contract-extension')
  const manifestPath = path.join(extensionPath, 'package.json')
  const distDir = path.join(extensionPath, 'dist')
  const entryPath = path.join(distDir, 'extension.js')

  await mkdir(distDir, { recursive: true })
  await writeFile(entryPath, extensionSource, 'utf8')
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        name: 'example-command-menu-contract-extension',
        displayName: 'Example Command Menu Contract Extension',
        version: '0.1.0',
        type: 'module',
        main: './dist/extension.js',
        activationEvents: [
          'onCommand:exampleCommandMenuContractExtension.target',
          'onCommand:exampleCommandMenuContractExtension.runner',
        ],
        contributes: {
          commands: [
            {
              command: 'exampleCommandMenuContractExtension.target',
              title: 'Target Command',
            },
            {
              command: 'exampleCommandMenuContractExtension.runner',
              title: 'Runner Command',
            },
          ],
        },
        permissions: {
          readWorkspaceFiles: true,
        },
      },
      null,
      2,
    ),
    'utf8',
  )

  const child = spawn('node', [hostPath], {
    cwd: repoRoot,
    stdio: ['pipe', 'pipe', 'inherit'],
  })

  let currentResolve = null

  function send(method, params) {
    child.stdin.write(`${JSON.stringify({ method, params })}\n`)
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

  function parseRunnerSummary(response) {
    const outputs = Array.isArray(response?.payload?.outputs) ? response.payload.outputs : []
    const text = String(outputs.find((entry) => entry.id === 'runner-summary')?.text || '')
    return JSON.parse(text)
  }

  try {
    const activate = await call('Activate', {
      extensionId: 'example-command-menu-contract-extension',
      activationEvent: 'onCommand:exampleCommandMenuContractExtension.runner',
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

    const registeredMenuActions = Array.isArray(activate?.payload?.registeredMenuActions)
      ? activate.payload.registeredMenuActions
      : []
    const initialActionSummary = registeredMenuActions.map((entry) => ({
      surface: String(entry.surface || ''),
      commandId: String(entry.commandId || ''),
      title: String(entry.title || ''),
      when: String(entry.when || ''),
    }))

    const runnerResponse = await call('ExecuteCommand', {
      activationEvent: 'onCommand:exampleCommandMenuContractExtension.runner',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      commandId: 'exampleCommandMenuContractExtension.runner',
      envelope: {
        taskId: 'task-command-menu-runner',
        extensionId: 'example-command-menu-contract-extension',
        workspaceRoot: '/tmp/workspace',
        commandId: 'exampleCommandMenuContractExtension.runner',
        itemId: '',
        itemHandle: '',
        referenceId: '',
        capability: '',
        targetKind: 'pdf',
        targetPath: '/tmp/workspace/papers/demo.pdf',
        settingsJson: '{}',
      },
    })

    const runnerSummary = parseRunnerSummary(runnerResponse)

    const reactivated = await call('Activate', {
      extensionId: 'example-command-menu-contract-extension',
      activationEvent: 'onCommand:exampleCommandMenuContractExtension.runner',
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

    const reactivatedMenuActions = Array.isArray(reactivated?.payload?.registeredMenuActions)
      ? reactivated.payload.registeredMenuActions
      : []
    const reactivatedActionSummary = reactivatedMenuActions.map((entry) => ({
      surface: String(entry.surface || ''),
      commandId: String(entry.commandId || ''),
      title: String(entry.title || ''),
      when: String(entry.when || ''),
    }))

    ensure(activate?.payload?.activated === true, 'command/menu contract extension did not activate', activate?.payload || {})
    ensure(
      JSON.stringify(initialActionSummary) === JSON.stringify([
        {
          surface: 'commandPalette',
          commandId: 'exampleCommandMenuContractExtension.target',
          title: 'Palette Action',
          when: 'resource.kind == pdf',
        },
        {
          surface: 'view/title',
          commandId: 'exampleCommandMenuContractExtension.target',
          title: 'View Title Action',
          when: 'activeView == extension:exampleCommandMenuContractExtension.tools',
        },
        {
          surface: 'view/item/context',
          commandId: 'exampleCommandMenuContractExtension.target',
          title: 'Persistent Item Action',
          when: 'viewItem.contextValue == contract-item',
        },
      ]),
      'initial registered menu action contract drifted',
      initialActionSummary,
    )
    ensure(
      JSON.stringify(runnerSummary) === JSON.stringify({
        executedAccepted: null,
        executedTaskState: 'succeeded',
        executedOutputText: 'runner-called',
        disposedViewItem: true,
        disposedCommandPalette: true,
      }),
      'commands.executeCommand contract drifted',
      runnerSummary,
    )
    ensure(
      JSON.stringify(reactivatedActionSummary) === JSON.stringify([
        {
          surface: 'commandPalette',
          commandId: 'exampleCommandMenuContractExtension.target',
          title: 'Palette Action',
          when: 'resource.kind == pdf',
        },
        {
          surface: 'view/title',
          commandId: 'exampleCommandMenuContractExtension.target',
          title: 'View Title Action',
          when: 'activeView == extension:exampleCommandMenuContractExtension.tools',
        },
        {
          surface: 'view/item/context',
          commandId: 'exampleCommandMenuContractExtension.target',
          title: 'Persistent Item Action',
          when: 'viewItem.contextValue == contract-item',
        },
      ]),
      'disposed menu actions were not cleaned up from runtime registration',
      reactivatedActionSummary,
    )

    console.log(
      JSON.stringify(
        {
          ok: true,
          summary: {
            initialActionSummary,
            runnerSummary,
            reactivatedActionSummary,
          },
        },
        null,
        2,
      ),
    )
  } finally {
    child.kill()
  }
}

void main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error?.message || String(error),
        details: error?.details || null,
      },
      null,
      2,
    ),
  )
  process.exitCode = 1
})
