import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const repoRoot = process.cwd()
const hostPath = path.join(repoRoot, 'src-tauri/resources/extension-host/extension-host.mjs')

const extensionSource = `
export async function activate(context) {
  context.commands.registerCommand('exampleInvocationContractExtension.inspectWithWorkspace', async () => ({
    message: 'invocation with workspace inspected',
    progressLabel: 'Invocation with workspace inspected',
    taskState: 'succeeded',
    outputs: [
      {
        id: 'invocation-with-workspace',
        type: 'inlineText',
        mediaType: 'application/json',
        title: 'Invocation With Workspace',
        text: JSON.stringify({
          workspaceRoot: context.workspace.rootPath,
          hasWorkspace: context.workspace.hasWorkspace,
          workspaceCurrent: context.workspace.current,
          documentActive: context.documents.active,
          documentResource: context.documents.resource,
          documentTarget: context.documents.target,
          invocationCurrent: context.invocation.current,
        }),
      },
    ],
  }))

  context.commands.registerCommand('exampleInvocationContractExtension.inspectWithoutWorkspace', async () => ({
    message: 'invocation without workspace inspected',
    progressLabel: 'Invocation without workspace inspected',
    taskState: 'succeeded',
    outputs: [
      {
        id: 'invocation-without-workspace',
        type: 'inlineText',
        mediaType: 'application/json',
        title: 'Invocation Without Workspace',
        text: JSON.stringify({
          workspaceRoot: context.workspace.rootPath,
          hasWorkspace: context.workspace.hasWorkspace,
          workspaceCurrent: context.workspace.current,
          documentActive: context.documents.active,
          documentResource: context.documents.resource,
          documentTarget: context.documents.target,
          invocationCurrent: context.invocation.current,
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
  return ['Activate', 'ExecuteCommand', 'Error'].includes(message.kind)
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'scribeflow-invocation-contract-'))
  const extensionPath = path.join(tempRoot, 'example-invocation-contract-extension')
  const manifestPath = path.join(extensionPath, 'package.json')
  const distDir = path.join(extensionPath, 'dist')
  const entryPath = path.join(distDir, 'extension.js')

  await mkdir(distDir, { recursive: true })
  await writeFile(entryPath, extensionSource, 'utf8')
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        name: 'example-invocation-contract-extension',
        displayName: 'Example Invocation Contract Extension',
        version: '0.1.0',
        type: 'module',
        main: './dist/extension.js',
        activationEvents: [
          'onCommand:exampleInvocationContractExtension.inspectWithWorkspace',
          'onCommand:exampleInvocationContractExtension.inspectWithoutWorkspace',
        ],
        contributes: {
          commands: [
            {
              command: 'exampleInvocationContractExtension.inspectWithWorkspace',
              title: 'Inspect Invocation With Workspace',
            },
            {
              command: 'exampleInvocationContractExtension.inspectWithoutWorkspace',
              title: 'Inspect Invocation Without Workspace',
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

  function parseOutput(response, outputId) {
    const outputs = Array.isArray(response?.payload?.outputs) ? response.payload.outputs : []
    const text = String(outputs.find((entry) => entry.id === outputId)?.text || '')
    return JSON.parse(text)
  }

  try {
    const activate = await call('Activate', {
      extensionId: 'example-invocation-contract-extension',
      activationEvent: 'onCommand:exampleInvocationContractExtension.inspectWithWorkspace',
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

    const withWorkspaceResponse = await call('ExecuteCommand', {
      activationEvent: 'onCommand:exampleInvocationContractExtension.inspectWithWorkspace',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      commandId: 'exampleInvocationContractExtension.inspectWithWorkspace',
      envelope: {
        taskId: 'task-invocation-workspace',
        extensionId: 'example-invocation-contract-extension',
        workspaceRoot: '/tmp/workspace',
        commandId: 'exampleInvocationContractExtension.inspectWithWorkspace',
        itemId: '',
        itemHandle: '',
        referenceId: 'ref-123',
        capability: '',
        targetKind: 'pdf',
        targetPath: '/tmp/workspace/papers/demo.pdf',
        settingsJson: '{}',
        locale: 'en-US',
      },
    })

    const withoutWorkspaceResponse = await call('ExecuteCommand', {
      activationEvent: 'onCommand:exampleInvocationContractExtension.inspectWithoutWorkspace',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      commandId: 'exampleInvocationContractExtension.inspectWithoutWorkspace',
      envelope: {
        taskId: 'task-invocation-no-workspace',
        extensionId: 'example-invocation-contract-extension',
        workspaceRoot: '',
        commandId: 'exampleInvocationContractExtension.inspectWithoutWorkspace',
        itemId: '',
        itemHandle: '',
        referenceId: '',
        capability: '',
        targetKind: '',
        targetPath: '',
        settingsJson: '{}',
        locale: 'en-US',
      },
    })

    const withWorkspace = parseOutput(withWorkspaceResponse, 'invocation-with-workspace')
    const withoutWorkspace = parseOutput(withoutWorkspaceResponse, 'invocation-without-workspace')

    ensure(activate?.payload?.activated === true, 'invocation contract extension did not activate', activate?.payload || {})
    ensure(
      JSON.stringify(withWorkspace) === JSON.stringify({
        workspaceRoot: '/tmp/workspace',
        hasWorkspace: true,
        workspaceCurrent: {
          rootPath: '/tmp/workspace',
          hasWorkspace: true,
        },
        documentActive: {
          resource: {
            kind: 'pdf',
            targetKind: 'pdf',
            path: '/tmp/workspace/papers/demo.pdf',
            extname: '.pdf',
            filename: 'demo.pdf',
            dirname: '/tmp/workspace/papers',
            langId: 'pdf',
            isPdf: true,
            isMarkdown: false,
            isLatex: false,
            isPython: false,
          },
          target: {
            kind: 'pdf',
            referenceId: 'ref-123',
            path: '/tmp/workspace/papers/demo.pdf',
          },
        },
        documentResource: {
          kind: 'pdf',
          targetKind: 'pdf',
          path: '/tmp/workspace/papers/demo.pdf',
          extname: '.pdf',
          filename: 'demo.pdf',
          dirname: '/tmp/workspace/papers',
          langId: 'pdf',
          isPdf: true,
          isMarkdown: false,
          isLatex: false,
          isPython: false,
        },
        documentTarget: {
          kind: 'pdf',
          referenceId: 'ref-123',
          path: '/tmp/workspace/papers/demo.pdf',
        },
        invocationCurrent: {
          extensionId: 'example-invocation-contract-extension',
          workspaceRoot: '/tmp/workspace',
          taskId: 'task-invocation-workspace',
          commandId: 'exampleInvocationContractExtension.inspectWithWorkspace',
          capability: '',
          itemId: '',
          itemHandle: '',
          referenceId: 'ref-123',
          target: {
            kind: 'pdf',
            referenceId: 'ref-123',
            path: '/tmp/workspace/papers/demo.pdf',
          },
          resource: {
            kind: 'pdf',
            targetKind: 'pdf',
            path: '/tmp/workspace/papers/demo.pdf',
            extname: '.pdf',
            filename: 'demo.pdf',
            dirname: '/tmp/workspace/papers',
            langId: 'pdf',
            isPdf: true,
            isMarkdown: false,
            isLatex: false,
            isPython: false,
          },
          settingsJson: '{}',
          locale: 'en-US',
        },
      }),
      'invocation contract with workspace drifted',
      withWorkspace,
    )
    ensure(
      JSON.stringify(withoutWorkspace) === JSON.stringify({
        workspaceRoot: '',
        hasWorkspace: false,
        workspaceCurrent: {
          rootPath: '',
          hasWorkspace: false,
        },
        documentActive: {
          resource: {
            kind: '',
            targetKind: '',
            path: '',
            extname: '',
            filename: '',
            dirname: '',
            langId: '',
            isPdf: false,
            isMarkdown: false,
            isLatex: false,
            isPython: false,
          },
          target: {
            kind: '',
            referenceId: '',
            path: '',
          },
        },
        documentResource: {
          kind: '',
          targetKind: '',
          path: '',
          extname: '',
          filename: '',
          dirname: '',
          langId: '',
          isPdf: false,
          isMarkdown: false,
          isLatex: false,
          isPython: false,
        },
        documentTarget: {
          kind: '',
          referenceId: '',
          path: '',
        },
        invocationCurrent: {
          extensionId: 'example-invocation-contract-extension',
          workspaceRoot: '',
          taskId: 'task-invocation-no-workspace',
          commandId: 'exampleInvocationContractExtension.inspectWithoutWorkspace',
          capability: '',
          itemId: '',
          itemHandle: '',
          referenceId: '',
          target: {
            kind: '',
            referenceId: '',
            path: '',
          },
          resource: {
            kind: '',
            targetKind: '',
            path: '',
            extname: '',
            filename: '',
            dirname: '',
            langId: '',
            isPdf: false,
            isMarkdown: false,
            isLatex: false,
            isPython: false,
          },
          settingsJson: '{}',
          locale: 'en-US',
        },
      }),
      'invocation contract without workspace drifted',
      withoutWorkspace,
    )

    console.log(
      JSON.stringify(
        {
          ok: true,
          summary: {
            withWorkspace,
            withoutWorkspace,
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
