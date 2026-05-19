import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const repoRoot = process.cwd()
const hostPath = path.join(repoRoot, 'src-tauri/resources/extension-host/extension-host.mjs')

const extensionSource = `
let activationCount = 0
let deactivationCount = 0

export async function activate(context) {
  activationCount += 1
  context.commands.registerCommand('exampleLifecycleExtension.report', async () => ({
    message: 'lifecycle extension executed',
    progressLabel: 'Lifecycle command completed',
    taskState: 'succeeded',
    outputs: [
      {
        id: 'activation-count',
        type: 'inlineText',
        mediaType: 'text/plain',
        title: 'Activation Count',
        text: String(activationCount),
      },
      {
        id: 'deactivation-count',
        type: 'inlineText',
        mediaType: 'text/plain',
        title: 'Deactivation Count',
        text: String(deactivationCount),
      },
    ],
  }))
}

export async function deactivate() {
  deactivationCount += 1
}
`

function ensure(condition, message, details = null) {
  if (condition) return
  const error = new Error(message)
  error.details = details
  throw error
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'scribeflow-deactivation-host-'))
  const workspaceA = path.join(tempRoot, 'workspace-a')
  const workspaceB = path.join(tempRoot, 'workspace-b')
  const extensionPath = path.join(workspaceA, '.scribeflow', 'extensions', 'example-lifecycle-extension')
  const extensionPathB = path.join(workspaceB, '.scribeflow', 'extensions', 'example-lifecycle-extension')
  const manifestPath = path.join(extensionPath, 'package.json')
  const manifestPathB = path.join(extensionPathB, 'package.json')
  const distDir = path.join(extensionPath, 'dist')
  const distDirB = path.join(extensionPathB, 'dist')
  const entryPath = path.join(distDir, 'extension.js')
  const entryPathB = path.join(distDirB, 'extension.js')

  await import('node:fs/promises').then(({ mkdir }) => Promise.all([
    mkdir(distDir, { recursive: true }),
    mkdir(distDirB, { recursive: true }),
  ]))
  await writeFile(entryPath, extensionSource, 'utf8')
  await writeFile(entryPathB, extensionSource, 'utf8')
  await writeFile(manifestPath, JSON.stringify({
    name: 'example-lifecycle-extension',
    displayName: 'Example Lifecycle Extension',
    version: '0.1.0',
    type: 'module',
    main: './dist/extension.js',
    activationEvents: [
      'onCommand:exampleLifecycleExtension.report',
    ],
    contributes: {
      commands: [
        {
          command: 'exampleLifecycleExtension.report',
          title: 'Lifecycle Report',
        },
      ],
    },
    permissions: {
      readWorkspaceFiles: true,
    },
  }, null, 2), 'utf8')
  await writeFile(manifestPathB, JSON.stringify({
    name: 'example-lifecycle-extension',
    displayName: 'Example Lifecycle Extension',
    version: '0.1.0',
    type: 'module',
    main: './dist/extension.js',
    activationEvents: [
      'onCommand:exampleLifecycleExtension.report',
    ],
    contributes: {
      commands: [
        {
          command: 'exampleLifecycleExtension.report',
          title: 'Lifecycle Report',
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
        if (['Activate', 'ExecuteCommand', 'AcknowledgeDeactivation', 'Error'].includes(message.kind)) {
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
      extensionId: 'example-lifecycle-extension',
      workspaceRoot: workspaceA,
      activationEvent: 'onCommand:exampleLifecycleExtension.report',
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
    const activateWorkspaceB = await call('Activate', {
      extensionId: 'example-lifecycle-extension',
      activationEvent: 'onCommand:exampleLifecycleExtension.report',
      extensionPath: extensionPathB,
      manifestPath: manifestPathB,
      mainEntry: './dist/extension.js',
      permissions: { readWorkspaceFiles: true },
      capabilities: [],
      activationState: {
        settings: {},
        globalState: {},
        workspaceState: {},
      },
      workspaceRoot: workspaceB,
    })

    const firstRun = await call('ExecuteCommand', {
      activationEvent: 'onCommand:exampleLifecycleExtension.report',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      commandId: 'exampleLifecycleExtension.report',
      envelope: {
        taskId: 'task-1',
        extensionId: 'example-lifecycle-extension',
        workspaceRoot: workspaceA,
        itemId: '',
        itemHandle: '',
        referenceId: '',
        capability: '',
        commandId: 'exampleLifecycleExtension.report',
        targetKind: 'workspace',
        targetPath: '/tmp/file.txt',
        settingsJson: '{}',
      },
    })
    const firstRunWorkspaceB = await call('ExecuteCommand', {
      activationEvent: 'onCommand:exampleLifecycleExtension.report',
      extensionPath: extensionPathB,
      manifestPath: manifestPathB,
      mainEntry: './dist/extension.js',
      commandId: 'exampleLifecycleExtension.report',
      envelope: {
        taskId: 'task-b-1',
        extensionId: 'example-lifecycle-extension',
        workspaceRoot: workspaceB,
        itemId: '',
        itemHandle: '',
        referenceId: '',
        capability: '',
        commandId: 'exampleLifecycleExtension.report',
        targetKind: 'workspace',
        targetPath: '/tmp/file.txt',
        settingsJson: '{}',
      },
    })

    const deactivated = await call('Deactivate', {
      extensionId: 'example-lifecycle-extension',
      workspaceRoot: workspaceA,
    })

    const secondRun = await call('ExecuteCommand', {
      activationEvent: 'onCommand:exampleLifecycleExtension.report',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      commandId: 'exampleLifecycleExtension.report',
      envelope: {
        taskId: 'task-2',
        extensionId: 'example-lifecycle-extension',
        workspaceRoot: workspaceA,
        itemId: '',
        itemHandle: '',
        referenceId: '',
        capability: '',
        commandId: 'exampleLifecycleExtension.report',
        targetKind: 'workspace',
        targetPath: '/tmp/file.txt',
        settingsJson: '{}',
      },
    })
    const secondRunWorkspaceB = await call('ExecuteCommand', {
      activationEvent: 'onCommand:exampleLifecycleExtension.report',
      extensionPath: extensionPathB,
      manifestPath: manifestPathB,
      mainEntry: './dist/extension.js',
      commandId: 'exampleLifecycleExtension.report',
      envelope: {
        taskId: 'task-b-2',
        extensionId: 'example-lifecycle-extension',
        workspaceRoot: workspaceB,
        itemId: '',
        itemHandle: '',
        referenceId: '',
        capability: '',
        commandId: 'exampleLifecycleExtension.report',
        targetKind: 'workspace',
        targetPath: '/tmp/file.txt',
        settingsJson: '{}',
      },
    })

    const firstOutputs = Array.isArray(firstRun?.payload?.outputs) ? firstRun.payload.outputs : []
    const firstOutputsWorkspaceB = Array.isArray(firstRunWorkspaceB?.payload?.outputs) ? firstRunWorkspaceB.payload.outputs : []
    const secondOutputs = Array.isArray(secondRun?.payload?.outputs) ? secondRun.payload.outputs : []
    const secondOutputsWorkspaceB = Array.isArray(secondRunWorkspaceB?.payload?.outputs) ? secondRunWorkspaceB.payload.outputs : []
    const firstActivationCount = String(firstOutputs.find((entry) => entry.id === 'activation-count')?.text || '')
    const firstDeactivationCount = String(firstOutputs.find((entry) => entry.id === 'deactivation-count')?.text || '')
    const firstActivationCountWorkspaceB = String(firstOutputsWorkspaceB.find((entry) => entry.id === 'activation-count')?.text || '')
    const firstDeactivationCountWorkspaceB = String(firstOutputsWorkspaceB.find((entry) => entry.id === 'deactivation-count')?.text || '')
    const secondActivationCount = String(secondOutputs.find((entry) => entry.id === 'activation-count')?.text || '')
    const secondDeactivationCount = String(secondOutputs.find((entry) => entry.id === 'deactivation-count')?.text || '')
    const secondActivationCountWorkspaceB = String(secondOutputsWorkspaceB.find((entry) => entry.id === 'activation-count')?.text || '')
    const secondDeactivationCountWorkspaceB = String(secondOutputsWorkspaceB.find((entry) => entry.id === 'deactivation-count')?.text || '')

    ensure(activate?.payload?.activated === true, 'lifecycle extension did not activate', activate?.payload || {})
    ensure(activateWorkspaceB?.payload?.activated === true, 'lifecycle extension did not activate for workspace B', activateWorkspaceB?.payload || {})
    ensure(firstRun?.payload?.accepted === true, 'first lifecycle command was not accepted', firstRun?.payload || {})
    ensure(firstRunWorkspaceB?.payload?.accepted === true, 'first workspace B lifecycle command was not accepted', firstRunWorkspaceB?.payload || {})
    ensure(firstActivationCount === '1', 'first activation count drifted', firstRun?.payload || {})
    ensure(firstDeactivationCount === '0', 'first deactivation count drifted', firstRun?.payload || {})
    ensure(firstActivationCountWorkspaceB === '1', 'first workspace B activation count drifted', firstRunWorkspaceB?.payload || {})
    ensure(firstDeactivationCountWorkspaceB === '0', 'first workspace B deactivation count drifted', firstRunWorkspaceB?.payload || {})
    ensure(deactivated?.payload?.accepted === true, 'lifecycle extension was not deactivated', deactivated?.payload || {})
    ensure(secondRun?.payload?.accepted === true, 'second lifecycle command was not accepted', secondRun?.payload || {})
    ensure(secondRunWorkspaceB?.payload?.accepted === true, 'second workspace B lifecycle command was not accepted', secondRunWorkspaceB?.payload || {})
    ensure(secondActivationCount === '2', 'second activation count did not prove reactivation', secondRun?.payload || {})
    ensure(secondDeactivationCount === '1', 'second deactivation count did not prove deactivation', secondRun?.payload || {})
    ensure(secondActivationCountWorkspaceB === '1', 'workspace B should not be reactivated by workspace A deactivation', secondRunWorkspaceB?.payload || {})
    ensure(secondDeactivationCountWorkspaceB === '0', 'workspace B should not observe workspace A deactivation', secondRunWorkspaceB?.payload || {})

    console.log(JSON.stringify({
      ok: true,
      summary: {
        firstActivationCount,
        firstDeactivationCount,
        firstActivationCountWorkspaceB,
        firstDeactivationCountWorkspaceB,
        secondActivationCount,
        secondDeactivationCount,
        secondActivationCountWorkspaceB,
        secondDeactivationCountWorkspaceB,
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
