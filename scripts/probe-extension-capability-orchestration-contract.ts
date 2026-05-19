import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const repoRoot = process.cwd()
const hostPath = path.join(repoRoot, 'src-tauri/resources/extension-host/extension-host.mjs')

const extensionSource = `
export async function activate(context) {
  context.views.registerViewProvider('exampleCapabilityOrchestrationContractExtension.resultView', async () => ({
    title: 'Capability Orchestration Contract',
    description: 'Baseline capability orchestration view',
    message: 'baseline message',
    statusLabel: 'Idle',
    statusTone: 'info',
    resultEntries: [],
    outputs: [],
    items: [],
  }))

  context.capabilities.registerProvider('document.orchestrate', async (payload = {}) => {
    const targetLabel = String(payload?.label || 'untitled-target')
    const runningTask = await context.tasks.update({
      state: 'running',
      progressLabel: \`Running orchestration for \${targetLabel}\`,
      outputs: [
        {
          id: 'running-output',
          type: 'inlineText',
          mediaType: 'text/plain',
          title: 'Running Output',
          text: \`running:\${targetLabel}\`,
        },
      ],
    })

    context.views.updateView('exampleCapabilityOrchestrationContractExtension.resultView', {
      message: \`Capability running for \${targetLabel}\`,
      statusLabel: 'Running',
      statusTone: 'warning',
      outputs: [
        {
          id: 'view-running-output',
          type: 'inlineText',
          mediaType: 'text/plain',
          title: 'View Running Output',
          text: \`view-running:\${targetLabel}\`,
        },
      ],
      resultEntries: [
        {
          id: 'view-running-entry',
          label: 'View Running Entry',
          action: 'open',
          previewMode: 'text',
          previewTitle: 'View Running Entry',
          mediaType: 'text/plain',
          payload: {
            text: \`entry:\${targetLabel}\`,
          },
        },
      ],
    })

    context.views.refresh('exampleCapabilityOrchestrationContractExtension.resultView')

    return {
      message: \`Capability orchestration completed for \${targetLabel}\`,
      progressLabel: 'Capability orchestration completed',
      taskState: 'succeeded',
      changedViews: ['exampleCapabilityOrchestrationContractExtension.manualView'],
      outputs: [
        {
          id: 'capability-orchestration-summary',
          type: 'inlineText',
          mediaType: 'application/json',
          title: 'Capability Orchestration Summary',
          text: JSON.stringify({
            targetLabel,
            runningTaskState: runningTask?.state || '',
            runningTaskOutputText: Array.isArray(runningTask?.outputs)
              ? String(runningTask.outputs.find((entry) => entry.id === 'running-output')?.text || '')
              : '',
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

function isTerminal(message) {
  return ['Activate', 'InvokeCapability', 'Error'].includes(message.kind)
}

function parseSummary(response) {
  const outputs = Array.isArray(response?.payload?.outputs) ? response.payload.outputs : []
  const text = String(outputs.find((entry) => entry.id === 'capability-orchestration-summary')?.text || '')
  return JSON.parse(text)
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'scribeflow-capability-orchestration-contract-'))
  const extensionPath = path.join(tempRoot, 'example-capability-orchestration-contract-extension')
  const manifestPath = path.join(extensionPath, 'package.json')
  const distDir = path.join(extensionPath, 'dist')
  const entryPath = path.join(distDir, 'extension.js')

  await mkdir(distDir, { recursive: true })
  await writeFile(entryPath, extensionSource, 'utf8')
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        name: 'example-capability-orchestration-contract-extension',
        displayName: 'Example Capability Orchestration Contract Extension',
        version: '0.1.0',
        type: 'module',
        main: './dist/extension.js',
        activationEvents: [
          'onCapability:document.orchestrate',
          'onView:exampleCapabilityOrchestrationContractExtension.resultView',
        ],
        contributes: {
          capabilities: [
            {
              id: 'document.orchestrate',
              inputs: {
                document: {
                  type: 'workspaceFile',
                  required: true,
                  extensions: ['.md'],
                },
              },
            },
          ],
          viewsContainers: {
            activitybar: [
              {
                id: 'exampleCapabilityOrchestrationContractExtension.tools',
                title: 'Capability Orchestration Tools',
              },
            ],
          },
          views: {
            'exampleCapabilityOrchestrationContractExtension.tools': [
              {
                id: 'exampleCapabilityOrchestrationContractExtension.resultView',
                name: 'Capability Orchestration Contract',
              },
            ],
          },
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

  const observed = []
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
        observed.push(message)

        if (message.kind === 'HostCallRequested') {
          if (String(message.payload?.kind || '') === 'tasks.update') {
            const taskId = String(message.payload?.payload?.taskId || '')
            const state = String(message.payload?.payload?.state || '')
            const progressLabel = String(message.payload?.payload?.progressLabel || '')
            const outputs = Array.isArray(message.payload?.payload?.outputs)
              ? message.payload.payload.outputs
              : []
            send('ResolveHostCall', {
              requestId: message.payload.requestId,
              accepted: true,
              result: {
                id: taskId,
                extensionId: 'example-capability-orchestration-contract-extension',
                commandId: '',
                capability: 'document.orchestrate',
                state,
                progress: {
                  label: progressLabel,
                  current: 0,
                  total: 0,
                },
                outputs,
                artifacts: [],
              },
            })
            newlineIndex = buffer.indexOf('\n')
            continue
          }

          send('ResolveHostCall', {
            requestId: message.payload.requestId,
            accepted: false,
            error: `Unhandled host call kind: ${message.payload.kind}`,
          })
          newlineIndex = buffer.indexOf('\n')
          continue
        }

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
    console.error(JSON.stringify({ timeout: true, observed }, null, 2))
    process.exitCode = 1
    child.kill()
  }, 8000)

  try {
    const activate = await call('Activate', {
      extensionId: 'example-capability-orchestration-contract-extension',
      activationEvent: 'onCapability:document.orchestrate',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      permissions: { readWorkspaceFiles: true },
      capabilities: [
        {
          id: 'document.orchestrate',
          inputs: {
            document: {
              type: 'workspaceFile',
              required: true,
              extensions: ['.md'],
            },
          },
        },
      ],
      activationState: {
        settings: {},
        globalState: {},
        workspaceState: {},
      },
    })

    const invokeResponse = await call('InvokeCapability', {
      activationEvent: 'onCapability:document.orchestrate',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      envelope: {
        taskId: 'task-capability-orchestration',
        extensionId: 'example-capability-orchestration-contract-extension',
        workspaceRoot: '/tmp/workspace',
        commandId: '',
        itemId: '',
        itemHandle: '',
        referenceId: '',
        capability: 'document.orchestrate',
        targetKind: 'workspace',
        targetPath: '/tmp/workspace/orchestrate.md',
        label: 'orchestration-target',
        settingsJson: '{}',
      },
    })

    const taskUpdateEvent = await waitForObserved(
      observed,
      (message) =>
        message.kind === 'HostCallRequested' &&
        String(message.payload?.kind || '') === 'tasks.update' &&
        String(message.payload?.payload?.state || '') === 'running',
    )

    const viewStateEvent = await waitForObserved(
      observed,
      (message) =>
        message.kind === 'ViewStateChanged' &&
        String(message.payload?.viewId || '') === 'exampleCapabilityOrchestrationContractExtension.resultView' &&
        String(message.payload?.message || '') === 'Capability running for orchestration-target',
    )

    const viewChangedEvent = await waitForObserved(
      observed,
      (message) =>
        message.kind === 'ViewChanged' &&
        Array.isArray(message.payload?.viewIds) &&
        message.payload.viewIds.includes('exampleCapabilityOrchestrationContractExtension.resultView'),
    )

    const summary = parseSummary(invokeResponse)
    const changedViews = Array.isArray(invokeResponse?.payload?.changedViews)
      ? invokeResponse.payload.changedViews
      : []

    ensure(activate?.payload?.activated === true, 'capability orchestration extension did not activate', activate?.payload || {})
    ensure(
      JSON.stringify(changedViews) === JSON.stringify([
        'exampleCapabilityOrchestrationContractExtension.manualView',
        'exampleCapabilityOrchestrationContractExtension.resultView',
      ]),
      'capability orchestration changedViews contract drifted',
      invokeResponse?.payload || {},
    )
    ensure(
      JSON.stringify(summary) === JSON.stringify({
        targetLabel: 'orchestration-target',
        runningTaskState: 'running',
        runningTaskOutputText: 'running:orchestration-target',
      }),
      'capability orchestration summary drifted',
      summary,
    )
    ensure(
      String(taskUpdateEvent?.payload?.payload?.progressLabel || '') === 'Running orchestration for orchestration-target',
      'capability orchestration task update progress drifted',
      taskUpdateEvent?.payload || {},
    )
    ensure(
      Array.isArray(viewStateEvent?.payload?.outputs) &&
        String(viewStateEvent.payload.outputs[0]?.text || '') === 'view-running:orchestration-target',
      'capability orchestration view state output drifted',
      viewStateEvent?.payload || {},
    )
    ensure(
      Array.isArray(viewStateEvent?.payload?.resultEntries) &&
        String(viewStateEvent.payload.resultEntries[0]?.id || '') === 'view-running-entry',
      'capability orchestration view state result entry drifted',
      viewStateEvent?.payload || {},
    )
    ensure(
      Array.isArray(viewChangedEvent?.payload?.viewIds) &&
        viewChangedEvent.payload.viewIds.length === 1,
      'capability orchestration view refresh payload drifted',
      viewChangedEvent?.payload || {},
    )

    console.log(
      JSON.stringify(
        {
          ok: true,
          summary: {
            changedViews,
            capabilitySummary: summary,
            taskUpdateState: String(taskUpdateEvent?.payload?.payload?.state || ''),
            viewStateMessage: String(viewStateEvent?.payload?.message || ''),
            viewRefreshIds: Array.isArray(viewChangedEvent?.payload?.viewIds)
              ? viewChangedEvent.payload.viewIds
              : [],
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
