import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const repoRoot = process.cwd()
const hostPath = path.join(repoRoot, 'src-tauri/resources/extension-host/extension-host.mjs')

const extensionSource = `
export async function activate(context) {
  context.commands.registerCommand('exampleExecuteCommandContractExtension.targetSuccess', async (label = 'default-label') => {
    context.views.refresh('exampleExecuteCommandContractExtension.resultView')
    return {
      message: 'target success executed',
      progressLabel: 'Target success executed',
      taskState: 'succeeded',
      changedViews: ['exampleExecuteCommandContractExtension.manualView'],
      outputs: [
        {
          id: 'target-success-output',
          type: 'inlineText',
          mediaType: 'text/plain',
          title: 'Target Success Output',
          text: String(label || ''),
        },
      ],
    }
  })

  context.commands.registerCommand('exampleExecuteCommandContractExtension.targetFailure', async () => {
    throw new Error('target failure from nested command')
  })

  context.commands.registerCommand('exampleExecuteCommandContractExtension.runner', async () => {
    const success = await context.commands.executeCommand(
      'exampleExecuteCommandContractExtension.targetSuccess',
      'runner-called',
    )

    let failureMessage = ''
    try {
      await context.commands.executeCommand('exampleExecuteCommandContractExtension.targetFailure')
    } catch (error) {
      failureMessage = error?.message || String(error)
    }

    let missingMessage = ''
    try {
      await context.commands.executeCommand('exampleExecuteCommandContractExtension.missing')
    } catch (error) {
      missingMessage = error?.message || String(error)
    }

    return {
      message: 'runner executed',
      progressLabel: 'Runner executed',
      taskState: 'succeeded',
      outputs: [
        {
          id: 'runner-summary',
          type: 'inlineText',
          mediaType: 'application/json',
          title: 'Runner Summary',
          text: JSON.stringify({
            successAccepted: Object.prototype.hasOwnProperty.call(success || {}, 'accepted')
              ? success?.accepted === true
              : null,
            successTaskState: success?.taskState || '',
            successOutputText: Array.isArray(success?.outputs)
              ? String(success.outputs.find((entry) => entry.id === 'target-success-output')?.text || '')
              : '',
            successChangedViews: Array.isArray(success?.changedViews) ? success.changedViews : [],
            failureMessage,
            missingMessage,
          }),
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

function isTerminal(message) {
  return ['Activate', 'ExecuteCommand', 'Error'].includes(message.kind)
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'scribeflow-execute-command-contract-'))
  const extensionPath = path.join(tempRoot, 'example-execute-command-contract-extension')
  const manifestPath = path.join(extensionPath, 'package.json')
  const distDir = path.join(extensionPath, 'dist')
  const entryPath = path.join(distDir, 'extension.js')

  await mkdir(distDir, { recursive: true })
  await writeFile(entryPath, extensionSource, 'utf8')
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        name: 'example-execute-command-contract-extension',
        displayName: 'Example Execute Command Contract Extension',
        version: '0.1.0',
        type: 'module',
        main: './dist/extension.js',
        activationEvents: [
          'onCommand:exampleExecuteCommandContractExtension.runner',
          'onCommand:exampleExecuteCommandContractExtension.targetSuccess',
          'onCommand:exampleExecuteCommandContractExtension.targetFailure',
        ],
        contributes: {
          commands: [
            {
              command: 'exampleExecuteCommandContractExtension.runner',
              title: 'Runner Command',
            },
            {
              command: 'exampleExecuteCommandContractExtension.targetSuccess',
              title: 'Target Success Command',
            },
            {
              command: 'exampleExecuteCommandContractExtension.targetFailure',
              title: 'Target Failure Command',
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
      extensionId: 'example-execute-command-contract-extension',
      activationEvent: 'onCommand:exampleExecuteCommandContractExtension.runner',
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

    const runnerResponse = await call('ExecuteCommand', {
      activationEvent: 'onCommand:exampleExecuteCommandContractExtension.runner',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      commandId: 'exampleExecuteCommandContractExtension.runner',
      envelope: {
        taskId: 'task-execute-command-runner',
        extensionId: 'example-execute-command-contract-extension',
        workspaceRoot: '/tmp/workspace',
        commandId: 'exampleExecuteCommandContractExtension.runner',
        itemId: '',
        itemHandle: '',
        referenceId: '',
        capability: '',
        targetKind: 'workspace',
        targetPath: '/tmp/workspace/note.md',
        settingsJson: '{}',
      },
    })

    const runnerSummary = parseRunnerSummary(runnerResponse)

    ensure(activate?.payload?.activated === true, 'executeCommand contract extension did not activate', activate?.payload || {})
    ensure(
      JSON.stringify(runnerSummary) === JSON.stringify({
        successAccepted: null,
        successTaskState: 'succeeded',
        successOutputText: 'runner-called',
        successChangedViews: [
          'exampleExecuteCommandContractExtension.manualView',
          'exampleExecuteCommandContractExtension.resultView',
        ],
        failureMessage: 'target failure from nested command',
        missingMessage: 'Command not registered: exampleExecuteCommandContractExtension.missing',
      }),
      'nested commands.executeCommand contract drifted',
      runnerSummary,
    )

    console.log(
      JSON.stringify(
        {
          ok: true,
          summary: {
            runnerSummary,
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
