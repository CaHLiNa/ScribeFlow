import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const repoRoot = process.cwd()
const hostPath = path.join(repoRoot, 'src-tauri/resources/extension-host/extension-host.mjs')

const extensionSource = `
let eventCount = 0
let lastChange = null

function snapshotSettings(context) {
  return {
    targetLang: context.settings.get('exampleSettingsContractExtension.targetLang', '__missing__'),
    theme: context.settings.get('exampleSettingsContractExtension.theme', '__missing__'),
    obsolete: context.settings.get('exampleSettingsContractExtension.obsolete', '__missing__'),
    untouched: context.settings.get('exampleSettingsContractExtension.untouched', '__missing__'),
  }
}

export async function activate(context) {
  context.settings.onDidChange((event) => {
    eventCount += 1
    lastChange = {
      keys: Array.isArray(event?.keys) ? event.keys : [],
      values: event?.values && typeof event.values === 'object' ? { ...event.values } : {},
      current: snapshotSettings(context),
    }
  })

  context.commands.registerCommand('exampleSettingsContractExtension.inspect', async () => ({
    message: 'settings contract inspected',
    progressLabel: 'Settings contract inspected',
    taskState: 'succeeded',
    outputs: [
      {
        id: 'settings-contract-snapshot',
        type: 'inlineText',
        mediaType: 'application/json',
        title: 'Settings Contract Snapshot',
        text: JSON.stringify({
          current: snapshotSettings(context),
          eventCount,
          lastChange,
        }),
      },
    ],
  }))
}
`

function ensure(condition, message, details = null) {
  if (condition) return
  const error = new Error(message)
  error.details = details
  throw error
}

function isTerminal(message) {
  return ['Activate', 'ExecuteCommand', 'AcknowledgeSettingsUpdate', 'Error'].includes(message.kind)
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'scribeflow-settings-contract-'))
  const extensionPath = path.join(tempRoot, 'example-settings-contract-extension')
  const manifestPath = path.join(extensionPath, 'package.json')
  const distDir = path.join(extensionPath, 'dist')
  const entryPath = path.join(distDir, 'extension.js')

  await mkdir(distDir, { recursive: true })
  await writeFile(entryPath, extensionSource, 'utf8')
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        name: 'example-settings-contract-extension',
        displayName: 'Example Settings Contract Extension',
        version: '0.1.0',
        type: 'module',
        main: './dist/extension.js',
        activationEvents: ['onCommand:exampleSettingsContractExtension.inspect'],
        contributes: {
          commands: [
            {
              command: 'exampleSettingsContractExtension.inspect',
              title: 'Inspect Settings Contract',
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

  const initialSettings = {
    'exampleSettingsContractExtension.targetLang': 'zh-CN',
    'exampleSettingsContractExtension.obsolete': 'legacy-token',
    'exampleSettingsContractExtension.untouched': 'keep-me',
  }

  const updatedSettings = {
    'exampleSettingsContractExtension.targetLang': 'en',
    'exampleSettingsContractExtension.theme': 'solarized-light',
    'exampleSettingsContractExtension.untouched': 'keep-me',
  }

  const baseEnvelope = {
    taskId: 'settings-contract-task',
    extensionId: 'example-settings-contract-extension',
    workspaceRoot: '/tmp/workspace',
    itemId: '',
    itemHandle: '',
    referenceId: '',
    capability: '',
    commandId: 'exampleSettingsContractExtension.inspect',
    targetKind: 'workspace',
    targetPath: '/tmp/workspace',
    settingsJson: '{}',
  }

  function parseInspectResult(result, label) {
    const outputs = Array.isArray(result?.payload?.outputs) ? result.payload.outputs : []
    const text = String(outputs.find((entry) => entry.id === 'settings-contract-snapshot')?.text || '')
    try {
      return JSON.parse(text)
    } catch (error) {
      throw new Error(`${label} payload was not valid JSON: ${error?.message || String(error)}`)
    }
  }

  try {
    const activate = await call('Activate', {
      extensionId: 'example-settings-contract-extension',
      workspaceRoot: '/tmp/workspace',
      activationEvent: 'onCommand:exampleSettingsContractExtension.inspect',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      permissions: { readWorkspaceFiles: true },
      capabilities: [],
      activationState: {
        settings: initialSettings,
        globalState: {},
        workspaceState: {},
      },
    })

    const beforeUpdateResult = await call('ExecuteCommand', {
      activationEvent: 'onCommand:exampleSettingsContractExtension.inspect',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      commandId: 'exampleSettingsContractExtension.inspect',
      envelope: baseEnvelope,
    })

    const updateAck = await call('UpdateSettings', {
      extensionId: 'example-settings-contract-extension',
      workspaceRoot: '/tmp/workspace',
      settings: updatedSettings,
    })

    const afterUpdateResult = await call('ExecuteCommand', {
      activationEvent: 'onCommand:exampleSettingsContractExtension.inspect',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      commandId: 'exampleSettingsContractExtension.inspect',
      envelope: baseEnvelope,
    })

    const noOpAck = await call('UpdateSettings', {
      extensionId: 'example-settings-contract-extension',
      workspaceRoot: '/tmp/workspace',
      settings: updatedSettings,
    })

    const afterNoOpResult = await call('ExecuteCommand', {
      activationEvent: 'onCommand:exampleSettingsContractExtension.inspect',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      commandId: 'exampleSettingsContractExtension.inspect',
      envelope: baseEnvelope,
    })

    const beforeUpdate = parseInspectResult(beforeUpdateResult, 'before update')
    const afterUpdate = parseInspectResult(afterUpdateResult, 'after update')
    const afterNoOp = parseInspectResult(afterNoOpResult, 'after no-op update')

    ensure(
      activate?.payload?.activated === true,
      'settings contract extension did not activate',
      activate?.payload || {},
    )
    ensure(
      JSON.stringify(beforeUpdate) ===
        JSON.stringify({
          current: {
            targetLang: 'zh-CN',
            theme: '__missing__',
            obsolete: 'legacy-token',
            untouched: 'keep-me',
          },
          eventCount: 0,
          lastChange: null,
        }),
      'initial settings snapshot drifted',
      beforeUpdate,
    )
    ensure(
      updateAck?.payload?.accepted === true,
      'settings update was not accepted',
      updateAck?.payload || {},
    )
    ensure(
      JSON.stringify(updateAck?.payload?.changedKeys || []) ===
        JSON.stringify([
          'exampleSettingsContractExtension.targetLang',
          'exampleSettingsContractExtension.theme',
          'exampleSettingsContractExtension.obsolete',
        ]),
      'settings update changed keys drifted',
      updateAck?.payload || {},
    )
    ensure(
      JSON.stringify(afterUpdate) ===
        JSON.stringify({
          current: {
            targetLang: 'en',
            theme: 'solarized-light',
            obsolete: '__missing__',
            untouched: 'keep-me',
          },
          eventCount: 1,
          lastChange: {
            keys: [
              'exampleSettingsContractExtension.targetLang',
              'exampleSettingsContractExtension.theme',
              'exampleSettingsContractExtension.obsolete',
            ],
            values: {
              'exampleSettingsContractExtension.targetLang': 'en',
              'exampleSettingsContractExtension.theme': 'solarized-light',
              'exampleSettingsContractExtension.untouched': 'keep-me',
            },
            current: {
              targetLang: 'en',
              theme: 'solarized-light',
              obsolete: '__missing__',
              untouched: 'keep-me',
            },
          },
        }),
      'settings change event contract drifted',
      afterUpdate,
    )
    ensure(
      noOpAck?.payload?.accepted === true,
      'no-op settings update was not accepted',
      noOpAck?.payload || {},
    )
    ensure(
      JSON.stringify(noOpAck?.payload?.changedKeys || []) === JSON.stringify([]),
      'no-op settings update unexpectedly reported changed keys',
      noOpAck?.payload || {},
    )
    ensure(
      JSON.stringify(afterNoOp) === JSON.stringify(afterUpdate),
      'no-op settings update unexpectedly changed runtime snapshot',
      afterNoOp,
    )

    console.log(
      JSON.stringify(
        {
          ok: true,
          summary: {
            beforeUpdate,
            updateChangedKeys: updateAck?.payload?.changedKeys || [],
            afterUpdate,
            noOpChangedKeys: noOpAck?.payload?.changedKeys || [],
            afterNoOp,
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
