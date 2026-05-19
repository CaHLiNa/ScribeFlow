import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const repoRoot = process.cwd()
const hostPath = path.join(repoRoot, 'src-tauri/resources/extension-host/extension-host.mjs')

const extensionSource = `
export async function activate(context) {
  let resolveCount = 0

  context.commands.registerCommand('exampleViewStateContractExtension.pushState', async () => {
    context.views.updateView('exampleViewStateContractExtension.resultView', {
      message: 'pushed message',
          statusLabel: 'Streaming',
          presentation: {
            mode: 'documentAction',
            target: {
              label: 'pushed.pdf',
              path: '/tmp/pushed.pdf',
            },
            action: {
              label: 'Translate',
              commandId: 'exampleViewStateContractExtension.pushState',
            },
            progress: {
              label: 'Streaming',
              state: 'running',
              current: 1,
              total: 3,
            },
          },
          resultEntries: [
        {
          id: 'pushed-entry',
          label: 'Pushed Entry',
          action: 'open',
          path: '/tmp/pushed.txt',
          previewMode: 'text',
          previewPath: '/tmp/pushed.txt',
          previewTitle: 'Pushed Entry',
          mediaType: 'text/plain',
        },
      ],
      outputs: [
        {
          id: 'pushed-output',
          type: 'inlineText',
          mediaType: 'text/plain',
          title: 'Pushed Output',
          text: 'stream payload',
        },
      ],
    })

    return {
      message: 'view state pushed',
      progressLabel: 'View state pushed',
      taskState: 'succeeded',
    }
  })

  context.views.registerViewProvider('exampleViewStateContractExtension.resultView', async () => {
    resolveCount += 1
    return {
      title: 'Contract View',
      description: \`baseline description #\${resolveCount}\`,
      message: \`baseline message #\${resolveCount}\`,
      badgeValue: resolveCount,
      badgeTooltip: \`badge #\${resolveCount}\`,
      statusLabel: 'Idle',
      statusTone: 'info',
      actionLabel: 'Inspect',
      presentation: {
        mode: 'documentAction',
        target: {
          label: 'baseline.pdf',
          path: '/tmp/baseline.pdf',
        },
        action: {
          label: 'Translate',
          commandId: 'exampleViewStateContractExtension.pushState',
        },
        progress: {
          label: 'Idle',
          state: 'idle',
          current: 0,
          total: 0,
        },
      },
      sections: [
        {
          id: 'baseline',
          kind: 'context',
          title: 'Baseline',
          value: \`section #\${resolveCount}\`,
        },
      ],
      resultEntries: [
        {
          id: 'baseline-entry',
          label: 'Baseline Entry',
          action: 'open',
          path: '/tmp/baseline.txt',
          previewMode: 'text',
          previewPath: '/tmp/baseline.txt',
          previewTitle: 'Baseline Entry',
          mediaType: 'text/plain',
        },
      ],
      outputs: [
        {
          id: 'baseline-output',
          type: 'inlineText',
          mediaType: 'text/plain',
          title: 'Baseline Output',
          text: \`baseline output #\${resolveCount}\`,
        },
      ],
      items: [],
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

function waitForObserved(observed, predicate, timeoutMs = 4000) {
  const existing = observed.find((message) => predicate(message))
  if (existing) {
    return Promise.resolve(existing)
  }
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const interval = setInterval(() => {
      const match = observed.find((message) => predicate(message))
      if (match) {
        clearInterval(interval)
        resolve(match)
        return
      }
      if (Date.now() >= deadline) {
        clearInterval(interval)
        reject(new Error('timed out waiting for observed host message'))
      }
    }, 10)
  })
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'scribeflow-view-state-contract-'))
  const extensionPath = path.join(tempRoot, 'example-view-state-contract-extension')
  const manifestPath = path.join(extensionPath, 'package.json')
  const distDir = path.join(extensionPath, 'dist')
  const entryPath = path.join(distDir, 'extension.js')

  await mkdir(distDir, { recursive: true })
  await writeFile(entryPath, extensionSource, 'utf8')

  const manifest = {
    name: 'example-view-state-contract-extension',
    displayName: 'Example View State Contract Extension',
    version: '0.1.0',
    type: 'module',
    main: './dist/extension.js',
    activationEvents: [
      'onView:exampleViewStateContractExtension.resultView',
      'onCommand:exampleViewStateContractExtension.pushState',
    ],
    contributes: {
      commands: [
        {
          command: 'exampleViewStateContractExtension.pushState',
          title: 'Push View State',
        },
      ],
      viewsContainers: {
        activitybar: [
          {
            id: 'exampleViewStateContractExtension.tools',
            title: 'View State Tools',
          },
        ],
      },
      views: {
        'exampleViewStateContractExtension.tools': [
          {
            id: 'exampleViewStateContractExtension.resultView',
            name: 'View State Contract',
          },
        ],
      },
    },
    permissions: {
      readWorkspaceFiles: true,
    },
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')

  const child = spawn('node', [hostPath], {
    cwd: repoRoot,
    stdio: ['pipe', 'pipe', 'inherit'],
  })

  let currentResolve = null
  const observed = []

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
        observed.push(message)
        if (['Activate', 'ResolveView', 'ExecuteCommand', 'Error'].includes(message.kind)) {
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
    console.error(JSON.stringify({ timeout: true, observed }, null, 2))
    process.exitCode = 1
    child.kill()
  }, 8000)

  try {
    const activationParams = {
      extensionId: 'example-view-state-contract-extension',
      activationEvent: 'onView:exampleViewStateContractExtension.resultView',
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
    }

    const envelope = {
      taskId: 'view-contract-task',
      extensionId: 'example-view-state-contract-extension',
      workspaceRoot: '/tmp/workspace',
      itemId: '',
      itemHandle: '',
      referenceId: '',
      capability: '',
      commandId: '',
      targetKind: 'workspace',
      targetPath: '/tmp/view-state-source.md',
      settingsJson: '{}',
    }

    const activate = await call('Activate', activationParams)
    const firstResolve = await call('ResolveView', {
      activationEvent: 'onView:exampleViewStateContractExtension.resultView',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      viewId: 'exampleViewStateContractExtension.resultView',
      parentItemId: '',
      envelope,
    })

    const pushed = await call('ExecuteCommand', {
      activationEvent: 'onCommand:exampleViewStateContractExtension.pushState',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      commandId: 'exampleViewStateContractExtension.pushState',
      envelope: {
        ...envelope,
        commandId: 'exampleViewStateContractExtension.pushState',
      },
    })

    const pushedEvent = await waitForObserved(
      observed,
      (message) =>
        message.kind === 'ViewStateChanged' &&
        String(message.payload?.viewId || '') === 'exampleViewStateContractExtension.resultView' &&
        String(message.payload?.message || '') === 'pushed message',
    )

    const secondResolve = await call('ResolveView', {
      activationEvent: 'onView:exampleViewStateContractExtension.resultView',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      viewId: 'exampleViewStateContractExtension.resultView',
      parentItemId: '',
      envelope,
    })

    ensure(activate?.payload?.registeredViews?.includes('exampleViewStateContractExtension.resultView'), 'contract view was not registered', activate?.payload || {})
    ensure(String(firstResolve?.payload?.message || '') === 'baseline message #1', 'baseline resolve message drifted', firstResolve?.payload || {})
    ensure(String(firstResolve?.payload?.description || '') === 'baseline description #1', 'baseline resolve description drifted', firstResolve?.payload || {})
    ensure(String(firstResolve?.payload?.presentation?.mode || '') === 'documentAction', 'baseline resolve presentation mode drifted', firstResolve?.payload || {})
    ensure(String(firstResolve?.payload?.presentation?.target?.label || '') === 'baseline.pdf', 'baseline resolve presentation target drifted', firstResolve?.payload || {})
    ensure(String(firstResolve?.payload?.resultEntries?.[0]?.id || '') === 'baseline-entry', 'baseline resolve result entry drifted', firstResolve?.payload || {})
    ensure(String(firstResolve?.payload?.outputs?.[0]?.id || '') === 'baseline-output', 'baseline resolve output drifted', firstResolve?.payload || {})

    ensure(String(pushed?.payload?.taskState || '') === 'succeeded', 'push state command did not succeed', pushed?.payload || {})
    ensure(String(pushedEvent?.payload?.message || '') === 'pushed message', 'pushed view event message drifted', pushedEvent?.payload || {})
    ensure(String(pushedEvent?.payload?.statusLabel || '') === 'Streaming', 'pushed view event status drifted', pushedEvent?.payload || {})
    ensure(String(pushedEvent?.payload?.presentation?.progress?.state || '') === 'running', 'pushed view event presentation progress drifted', pushedEvent?.payload || {})
    ensure(String(pushedEvent?.payload?.description || '') === 'baseline description #1', 'pushed view event should preserve prior baseline description', pushedEvent?.payload || {})

    ensure(String(secondResolve?.payload?.message || '') === 'pushed message', 'resolved view lost pushed message after refresh', secondResolve?.payload || {})
    ensure(String(secondResolve?.payload?.statusLabel || '') === 'Streaming', 'resolved view lost pushed status after refresh', secondResolve?.payload || {})
    ensure(String(secondResolve?.payload?.description || '') === 'baseline description #2', 'resolved view did not refresh untouched baseline description', secondResolve?.payload || {})
    ensure(Number(secondResolve?.payload?.badgeValue ?? NaN) === 2, 'resolved view did not refresh untouched baseline badge value', secondResolve?.payload || {})
    ensure(String(secondResolve?.payload?.resultEntries?.[0]?.id || '') === 'pushed-entry', 'resolved view did not preserve pushed result entries', secondResolve?.payload || {})
    ensure(String(secondResolve?.payload?.outputs?.[0]?.id || '') === 'pushed-output', 'resolved view did not preserve pushed outputs', secondResolve?.payload || {})
    ensure(String(secondResolve?.payload?.presentation?.target?.label || '') === 'pushed.pdf', 'resolved view did not preserve pushed presentation', secondResolve?.payload || {})
    ensure(String(secondResolve?.payload?.actionLabel || '') === 'Inspect', 'resolved view lost untouched baseline action label', secondResolve?.payload || {})

    console.log(JSON.stringify({
      ok: true,
      summary: {
        firstResolve: {
          message: firstResolve.payload.message,
          description: firstResolve.payload.description,
          badgeValue: firstResolve.payload.badgeValue,
          resultEntryIds: firstResolve.payload.resultEntries.map((entry) => entry.id),
          outputIds: firstResolve.payload.outputs.map((entry) => entry.id),
        },
        pushedEvent: {
          message: pushedEvent.payload.message,
          description: pushedEvent.payload.description,
          statusLabel: pushedEvent.payload.statusLabel,
          resultEntryIds: pushedEvent.payload.resultEntries.map((entry) => entry.id),
          outputIds: pushedEvent.payload.outputs.map((entry) => entry.id),
        },
        secondResolve: {
          message: secondResolve.payload.message,
          description: secondResolve.payload.description,
          badgeValue: secondResolve.payload.badgeValue,
          statusLabel: secondResolve.payload.statusLabel,
          actionLabel: secondResolve.payload.actionLabel,
          resultEntryIds: secondResolve.payload.resultEntries.map((entry) => entry.id),
          outputIds: secondResolve.payload.outputs.map((entry) => entry.id),
        },
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
