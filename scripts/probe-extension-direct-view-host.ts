import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const repoRoot = process.cwd()
const hostPath = path.join(repoRoot, 'src-tauri/resources/extension-host/extension-host.mjs')

const extensionSource = `
export async function activate(context) {
  context.commands.registerCommand('exampleDirectViewExtension.emitArtifact', async () => {
    context.views.updateView('exampleDirectViewExtension.resultView', {
      message: 'direct command pushed view artifact',
      artifacts: [
        {
          id: 'direct-view-artifact',
          extensionId: 'example-direct-view-extension',
          taskId: 'external-view-task',
          capability: 'document.transform',
          kind: 'translated-text',
          mediaType: 'text/plain',
          path: '/tmp/direct-view-output.txt',
          sourcePath: '/tmp/direct-source.md',
        },
      ],
    })

    return {
      message: 'direct command artifact emitted',
      progressLabel: 'Direct command completed',
      taskState: 'succeeded',
      artifacts: [
        {
          id: 'command-artifact',
          extensionId: 'spoofed-extension',
          taskId: 'spoofed-task',
          capability: 'spoofed.capability',
          kind: 'translated-text',
          mediaType: 'text/plain',
          path: '/tmp/command-output.txt',
          sourcePath: '/tmp/direct-source.md',
        },
      ],
    }
  })

  context.capabilities.registerProvider('document.transform', async () => ({
    message: 'direct capability artifact emitted',
    progressLabel: 'Direct capability completed',
    taskState: 'succeeded',
    artifacts: [
      {
        id: 'capability-artifact',
        extensionId: 'spoofed-extension',
        taskId: 'spoofed-task',
        capability: 'spoofed.capability',
        kind: 'translated-text',
        mediaType: 'text/plain',
        path: '/tmp/capability-output.txt',
        sourcePath: '/tmp/direct-source.md',
      },
    ],
    outputs: [
      {
        id: 'capability-summary',
        type: 'inlineText',
        mediaType: 'text/plain',
        title: 'Capability Summary',
        text: 'capability summary',
      },
    ],
  }))

  context.views.registerViewProvider('exampleDirectViewExtension.resultView', async () => ({
    title: 'Direct Result View',
    description: 'Direct host view provider contract',
    message: 'Direct view resolved',
    badgeValue: 1,
    badgeTooltip: 'One direct view result is available.',
    statusLabel: 'Ready',
    statusTone: 'success',
    actionLabel: 'Inspect direct outputs',
    sections: [
      {
        id: 'target',
        kind: 'context',
        title: 'Target',
        value: context.documents?.resource?.path || 'none',
      },
    ],
    resultEntries: [
      {
        id: 'open-source',
        label: 'Open Source File',
        path: '/tmp/direct-source.md',
        action: 'open',
        previewMode: 'text',
        previewPath: '/tmp/direct-source.md',
        previewTitle: 'Source File',
        mediaType: 'text/plain',
      },
    ],
    artifacts: [
      {
        id: 'direct-artifact',
        extensionId: 'example-direct-view-extension',
        taskId: 'external-task',
        capability: 'document.transform',
        kind: 'translated-text',
        mediaType: 'text/plain',
        path: '/tmp/direct-output.txt',
        sourcePath: '/tmp/direct-source.md',
      },
    ],
    outputs: [
      {
        id: 'direct-summary',
        type: 'inlineText',
        mediaType: 'text/plain',
        title: 'Direct Summary',
        description: 'Direct view summary',
        text: 'summary from direct view',
      },
      {
        id: 'direct-card',
        type: 'inlineHtml',
        mediaType: 'text/html',
        title: 'Direct HTML Card',
        description: 'Direct view html',
        html: '<p>direct html</p>',
      },
    ],
    items: [],
  }))
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
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'scribeflow-direct-view-'))
  const extensionPath = path.join(tempRoot, 'example-direct-view-extension')
  const manifestPath = path.join(extensionPath, 'package.json')
  const distDir = path.join(extensionPath, 'dist')
  const entryPath = path.join(distDir, 'extension.js')

  await import('node:fs/promises').then(({ mkdir }) => mkdir(distDir, { recursive: true }))
  await writeFile(entryPath, extensionSource, 'utf8')
  const manifest = {
    name: 'example-direct-view-extension',
    displayName: 'Example Direct View Extension',
    version: '0.1.0',
    type: 'module',
    main: './dist/extension.js',
    activationEvents: [
      'onView:exampleDirectViewExtension.resultView',
      'onCommand:exampleDirectViewExtension.emitArtifact',
      'onCapability:document.transform',
    ],
    contributes: {
      commands: [
        {
          command: 'exampleDirectViewExtension.emitArtifact',
          title: 'Emit Direct Artifact',
        },
      ],
      capabilities: [
        {
          id: 'document.transform',
        },
      ],
      viewsContainers: {
        activitybar: [
          {
            id: 'exampleDirectViewExtension.tools',
            title: 'Direct View Tools',
          },
        ],
      },
      views: {
        'exampleDirectViewExtension.tools': [
          {
            id: 'exampleDirectViewExtension.resultView',
            name: 'Direct Result View',
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
        if (['Activate', 'ResolveView', 'ExecuteCommand', 'InvokeCapability', 'Error'].includes(message.kind)) {
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
      extensionId: 'example-direct-view-extension',
      activationEvent: 'onView:exampleDirectViewExtension.resultView',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      permissions: { readWorkspaceFiles: true },
      capabilities: manifest.contributes.capabilities,
      activationState: {
        settings: {},
        globalState: {},
        workspaceState: {},
      },
    })

    const resolved = await call('ResolveView', {
      activationEvent: 'onView:exampleDirectViewExtension.resultView',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      viewId: 'exampleDirectViewExtension.resultView',
      parentItemId: '',
      envelope: {
        taskId: 'direct-task',
        extensionId: 'example-direct-view-extension',
        workspaceRoot: '/tmp/workspace',
        itemId: '',
        itemHandle: '',
        referenceId: '',
        capability: '',
        targetKind: 'workspace',
        targetPath: '/tmp/direct-source.md',
        settingsJson: '{}',
      },
    })

    const executed = await call('ExecuteCommand', {
      activationEvent: 'onCommand:exampleDirectViewExtension.emitArtifact',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      commandId: 'exampleDirectViewExtension.emitArtifact',
      envelope: {
        taskId: 'command-task',
        extensionId: 'example-direct-view-extension',
        workspaceRoot: '/tmp/workspace',
        itemId: '',
        itemHandle: '',
        referenceId: '',
        capability: '',
        commandId: 'exampleDirectViewExtension.emitArtifact',
        targetKind: 'workspace',
        targetPath: '/tmp/direct-source.md',
        settingsJson: '{}',
      },
    })
    const commandViewStateChanged = await waitForObserved(
      observed,
      (message) =>
        message.kind === 'ViewStateChanged' &&
        String(message.payload?.viewId || '') === 'exampleDirectViewExtension.resultView' &&
        String(message.payload?.message || '') === 'direct command pushed view artifact',
    )

    const invoked = await call('InvokeCapability', {
      activationEvent: 'onCapability:document.transform',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      envelope: {
        taskId: 'capability-task',
        extensionId: 'example-direct-view-extension',
        workspaceRoot: '/tmp/workspace',
        itemId: '',
        itemHandle: '',
        referenceId: '',
        capability: 'document.transform',
        targetKind: 'workspace',
        targetPath: '/tmp/direct-source.md',
        settingsJson: '{}',
      },
    })

    ensure(activate?.payload?.registeredViews?.includes('exampleDirectViewExtension.resultView'), 'direct view was not registered', activate?.payload || {})
    ensure(activate?.payload?.registeredCommands?.includes('exampleDirectViewExtension.emitArtifact'), 'direct command was not registered', activate?.payload || {})
    ensure(activate?.payload?.registeredCapabilities?.includes('document.transform'), 'direct capability was not registered', activate?.payload || {})
    ensure(Array.isArray(resolved?.payload?.resultEntries) && resolved.payload.resultEntries.length === 1, 'direct view did not return baseline result entries', resolved?.payload || {})
    ensure(Array.isArray(resolved?.payload?.artifacts) && resolved.payload.artifacts.length === 1, 'direct view did not return artifacts', resolved?.payload || {})
    ensure(Array.isArray(resolved?.payload?.outputs) && resolved.payload.outputs.length === 2, 'direct view did not return outputs', resolved?.payload || {})
    ensure(String(resolved?.payload?.artifacts?.[0]?.path || '') === '/tmp/direct-output.txt', 'direct view artifact path drifted', resolved?.payload || {})
    ensure(String(resolved?.payload?.artifacts?.[0]?.taskId || '') === 'external-task', 'direct view artifact task id drifted', resolved?.payload || {})
    ensure(String(resolved?.payload?.artifacts?.[0]?.capability || '') === 'document.transform', 'direct view artifact capability drifted', resolved?.payload || {})
    ensure(String(resolved?.payload?.outputs?.[0]?.type || '').toLowerCase() === 'inlinetext', 'direct view text output drifted', resolved?.payload || {})
    ensure(String(resolved?.payload?.outputs?.[1]?.type || '').toLowerCase() === 'inlinehtml', 'direct view html output drifted', resolved?.payload || {})
    ensure(Array.isArray(executed?.payload?.artifacts) && executed.payload.artifacts.length === 1, 'direct command did not return artifacts', executed?.payload || {})
    ensure(String(executed?.payload?.artifacts?.[0]?.taskId || '') === 'command-task', 'direct command artifact task id was not anchored to envelope', executed?.payload || {})
    ensure(String(executed?.payload?.artifacts?.[0]?.capability || '') === 'exampleDirectViewExtension.emitArtifact', 'direct command artifact capability was not anchored to envelope', executed?.payload || {})
    ensure(String(executed?.payload?.artifacts?.[0]?.extensionId || '') === 'example-direct-view-extension', 'direct command artifact extension id was not anchored to envelope', executed?.payload || {})
    ensure(Array.isArray(commandViewStateChanged?.payload?.artifacts) && commandViewStateChanged.payload.artifacts.length === 1, 'direct command view state did not return artifacts', commandViewStateChanged?.payload || {})
    ensure(String(commandViewStateChanged?.payload?.artifacts?.[0]?.taskId || '') === 'external-view-task', 'direct command view artifact task id drifted', commandViewStateChanged?.payload || {})
    ensure(String(commandViewStateChanged?.payload?.artifacts?.[0]?.capability || '') === 'document.transform', 'direct command view artifact capability drifted', commandViewStateChanged?.payload || {})
    ensure(String(commandViewStateChanged?.payload?.artifacts?.[0]?.extensionId || '') === 'example-direct-view-extension', 'direct command view artifact extension id drifted', commandViewStateChanged?.payload || {})
    ensure(Array.isArray(invoked?.payload?.artifacts) && invoked.payload.artifacts.length === 1, 'direct capability did not return artifacts', invoked?.payload || {})
    ensure(Array.isArray(invoked?.payload?.outputs) && invoked.payload.outputs.length === 1, 'direct capability did not return outputs', invoked?.payload || {})
    ensure(String(invoked?.payload?.artifacts?.[0]?.taskId || '') === 'capability-task', 'direct capability artifact task id was not anchored to envelope', invoked?.payload || {})
    ensure(String(invoked?.payload?.artifacts?.[0]?.capability || '') === 'document.transform', 'direct capability artifact capability was not anchored to envelope', invoked?.payload || {})
    ensure(String(invoked?.payload?.artifacts?.[0]?.extensionId || '') === 'example-direct-view-extension', 'direct capability artifact extension id was not anchored to envelope', invoked?.payload || {})

    console.log(JSON.stringify({
      ok: true,
      summary: {
        registeredViews: activate?.payload?.registeredViews || [],
        registeredCommands: activate?.payload?.registeredCommands || [],
        registeredCapabilities: activate?.payload?.registeredCapabilities || [],
        resultEntryIds: resolved.payload.resultEntries.map((entry) => entry.id),
        artifactIds: resolved.payload.artifacts.map((entry) => entry.id),
        artifactTaskIds: resolved.payload.artifacts.map((entry) => entry.taskId),
        artifactCapabilities: resolved.payload.artifacts.map((entry) => entry.capability),
        outputIds: resolved.payload.outputs.map((entry) => entry.id),
        commandArtifactTaskIds: executed.payload.artifacts.map((entry) => entry.taskId),
        commandArtifactCapabilities: executed.payload.artifacts.map((entry) => entry.capability),
        commandViewArtifactTaskIds: commandViewStateChanged.payload.artifacts.map((entry) => entry.taskId),
        commandViewArtifactCapabilities: commandViewStateChanged.payload.artifacts.map((entry) => entry.capability),
        capabilityArtifactTaskIds: invoked.payload.artifacts.map((entry) => entry.taskId),
        capabilityArtifactCapabilities: invoked.payload.artifacts.map((entry) => entry.capability),
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
