import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const repoRoot = process.cwd()
const hostPath = path.join(repoRoot, 'src-tauri/resources/extension-host/extension-host.mjs')

const extensionSource = `
export async function activate(context) {
  const viewId = 'exampleTreeViewContractExtension.contractView'
  const nodes = {
    group: { id: 'group', label: 'Group', kind: 'group' },
    subgroup: { id: 'subgroup', label: 'Subgroup', kind: 'subgroup' },
    leaf: { id: 'leaf', label: 'Leaf', kind: 'leaf', path: '/tmp/leaf.md' },
  }

  const childrenById = new Map([
    ['root', [nodes.group]],
    ['group', [nodes.subgroup]],
    ['subgroup', [nodes.leaf]],
    ['leaf', []],
  ])

  const treeView = context.views.createTreeView(viewId)
  treeView.onDidChangeSelection((event) => {
    context.views.updateView(viewId, {
      message: JSON.stringify({
        selectedIds: Array.isArray(event?.selection) ? event.selection.map((entry) => entry?.id || '') : [],
        selectedKinds: Array.isArray(event?.selection) ? event.selection.map((entry) => entry?.kind || '') : [],
        selectedPaths: Array.isArray(event?.selection) ? event.selection.map((entry) => entry?.path || '') : [],
        handles: Array.isArray(event?.handles) ? event.handles : [],
      }),
    })
  })

  context.views.registerTreeDataProvider(viewId, {
    getTitle() {
      return 'Tree Contract View'
    },
    getChildren(element) {
      if (!element) return childrenById.get('root') || []
      return childrenById.get(element.id) || []
    },
    getTreeItem(element) {
      return {
        id: element.id,
        handle: element.id,
        label: element.label,
        description: element.kind,
        contextValue: element.kind,
        collapsibleState: element.id === 'leaf' ? 'none' : 'collapsed',
      }
    },
  })

  context.commands.registerCommand('exampleTreeViewContractExtension.revealDefault', async () => {
    treeView.reveal(nodes.subgroup)
    return {
      message: 'default tree reveal emitted',
      progressLabel: 'Default tree reveal emitted',
      taskState: 'succeeded',
      outputs: [
        {
          id: 'default-tree-reveal',
          type: 'inlineText',
          mediaType: 'text/plain',
          title: 'Default Tree Reveal',
          text: 'subgroup',
        },
      ],
    }
  })

  context.commands.registerCommand('exampleTreeViewContractExtension.revealCustom', async () => {
    treeView.reveal(nodes.leaf, { focus: true, select: false, expand: false })
    return {
      message: 'custom tree reveal emitted',
      progressLabel: 'Custom tree reveal emitted',
      taskState: 'succeeded',
      outputs: [
        {
          id: 'custom-tree-reveal',
          type: 'inlineText',
          mediaType: 'text/plain',
          title: 'Custom Tree Reveal',
          text: 'leaf',
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
  return ['Activate', 'ExecuteCommand', 'ResolveView', 'AcknowledgeViewSelection', 'Error'].includes(message.kind)
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'scribeflow-treeview-contract-'))
  const extensionPath = path.join(tempRoot, 'example-treeview-contract-extension')
  const manifestPath = path.join(extensionPath, 'package.json')
  const distDir = path.join(extensionPath, 'dist')
  const entryPath = path.join(distDir, 'extension.js')
  const viewId = 'exampleTreeViewContractExtension.contractView'

  await mkdir(distDir, { recursive: true })
  await writeFile(entryPath, extensionSource, 'utf8')
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        name: 'example-treeview-contract-extension',
        displayName: 'Example TreeView Contract Extension',
        version: '0.1.0',
        type: 'module',
        main: './dist/extension.js',
        activationEvents: [
          `onView:${viewId}`,
          'onCommand:exampleTreeViewContractExtension.revealDefault',
          'onCommand:exampleTreeViewContractExtension.revealCustom',
        ],
        contributes: {
          commands: [
            {
              command: 'exampleTreeViewContractExtension.revealDefault',
              title: 'Reveal Default',
            },
            {
              command: 'exampleTreeViewContractExtension.revealCustom',
              title: 'Reveal Custom',
            },
          ],
          viewsContainers: {
            activitybar: [
              {
                id: 'exampleTreeViewContractExtension.tools',
                title: 'Tree Contract Tools',
              },
            ],
          },
          views: {
            'exampleTreeViewContractExtension.tools': [
              {
                id: viewId,
                name: 'Tree Contract View',
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

  function waitForObserved(predicate, timeoutMs = 4000) {
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

  const baseEnvelope = {
    taskId: 'tree-contract-task',
    extensionId: 'example-treeview-contract-extension',
    workspaceRoot: '/tmp/workspace',
    itemId: '',
    itemHandle: '',
    referenceId: '',
    capability: '',
    commandId: '',
    targetKind: 'workspace',
    targetPath: '/tmp/workspace',
    settingsJson: '{}',
  }

  try {
    const activate = await call('Activate', {
      extensionId: 'example-treeview-contract-extension',
      workspaceRoot: '/tmp/workspace',
      activationEvent: `onView:${viewId}`,
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

    const rootView = await call('ResolveView', {
      activationEvent: `onView:${viewId}`,
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      viewId,
      parentItemId: '',
      envelope: baseEnvelope,
    })

    const groupView = await call('ResolveView', {
      activationEvent: `onView:${viewId}`,
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      viewId,
      parentItemId: 'group',
      envelope: baseEnvelope,
    })

    const subgroupView = await call('ResolveView', {
      activationEvent: `onView:${viewId}`,
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      viewId,
      parentItemId: 'subgroup',
      envelope: baseEnvelope,
    })

    const selectionAck = await call('NotifyViewSelection', {
      extensionId: 'example-treeview-contract-extension',
      workspaceRoot: '/tmp/workspace',
      viewId,
      itemHandle: 'leaf',
    })

    const selectionChanged = await waitForObserved(
      (message) =>
        message.kind === 'ViewStateChanged' &&
        String(message.payload?.viewId || '') === viewId &&
        String(message.payload?.message || '').includes('"selectedIds":["leaf"]'),
    )

    const defaultRevealCommand = await call('ExecuteCommand', {
      activationEvent: 'onCommand:exampleTreeViewContractExtension.revealDefault',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      commandId: 'exampleTreeViewContractExtension.revealDefault',
      envelope: {
        ...baseEnvelope,
        commandId: 'exampleTreeViewContractExtension.revealDefault',
      },
    })

    const defaultReveal = await waitForObserved(
      (message) =>
        message.kind === 'ViewRevealRequested' &&
        String(message.payload?.viewId || '') === viewId &&
        String(message.payload?.itemHandle || '') === 'subgroup',
    )

    const customRevealCommand = await call('ExecuteCommand', {
      activationEvent: 'onCommand:exampleTreeViewContractExtension.revealCustom',
      extensionPath,
      manifestPath,
      mainEntry: './dist/extension.js',
      commandId: 'exampleTreeViewContractExtension.revealCustom',
      envelope: {
        ...baseEnvelope,
        commandId: 'exampleTreeViewContractExtension.revealCustom',
      },
    })

    const customReveal = await waitForObserved(
      (message) =>
        message.kind === 'ViewRevealRequested' &&
        String(message.payload?.viewId || '') === viewId &&
        String(message.payload?.itemHandle || '') === 'leaf',
    )

    const rootHandles = Array.isArray(rootView?.payload?.items) ? rootView.payload.items.map((item) => item.handle) : []
    const groupHandles = Array.isArray(groupView?.payload?.items) ? groupView.payload.items.map((item) => item.handle) : []
    const subgroupHandles = Array.isArray(subgroupView?.payload?.items)
      ? subgroupView.payload.items.map((item) => item.handle)
      : []

    let selectionPayload = {}
    try {
      selectionPayload = JSON.parse(String(selectionChanged?.payload?.message || '{}'))
    } catch (error) {
      throw new Error(`failed to parse tree selection payload: ${error?.message || String(error)}`)
    }

    ensure(activate?.payload?.activated === true, 'tree contract extension did not activate', activate?.payload || {})
    ensure(String(rootView?.payload?.title || '') === 'Tree Contract View', 'tree view title drifted', rootView?.payload || {})
    ensure(JSON.stringify(rootHandles) === JSON.stringify(['group']), 'root tree handles drifted', rootView?.payload || {})
    ensure(JSON.stringify(groupHandles) === JSON.stringify(['subgroup']), 'group tree handles drifted', groupView?.payload || {})
    ensure(JSON.stringify(subgroupHandles) === JSON.stringify(['leaf']), 'subgroup tree handles drifted', subgroupView?.payload || {})
    ensure(selectionAck?.payload?.accepted === true, 'tree selection was not accepted', selectionAck?.payload || {})
    ensure(
      JSON.stringify(selectionPayload) ===
        JSON.stringify({
          selectedIds: ['leaf'],
          selectedKinds: ['leaf'],
          selectedPaths: ['/tmp/leaf.md'],
          handles: ['leaf'],
        }),
      'tree selection payload drifted',
      selectionPayload,
    )
    ensure(
      defaultRevealCommand?.payload?.accepted === true,
      'default tree reveal command was not accepted',
      defaultRevealCommand?.payload || {},
    )
    ensure(
      JSON.stringify({
        itemHandle: String(defaultReveal?.payload?.itemHandle || ''),
        parentHandles: Array.isArray(defaultReveal?.payload?.parentHandles) ? defaultReveal.payload.parentHandles : [],
        focus: Boolean(defaultReveal?.payload?.focus),
        select: Boolean(defaultReveal?.payload?.select),
        expand: Boolean(defaultReveal?.payload?.expand),
      }) ===
        JSON.stringify({
          itemHandle: 'subgroup',
          parentHandles: ['group'],
          focus: false,
          select: true,
          expand: true,
        }),
      'default tree reveal payload drifted',
      defaultReveal?.payload || {},
    )
    ensure(
      customRevealCommand?.payload?.accepted === true,
      'custom tree reveal command was not accepted',
      customRevealCommand?.payload || {},
    )
    ensure(
      JSON.stringify({
        itemHandle: String(customReveal?.payload?.itemHandle || ''),
        parentHandles: Array.isArray(customReveal?.payload?.parentHandles) ? customReveal.payload.parentHandles : [],
        focus: Boolean(customReveal?.payload?.focus),
        select: Boolean(customReveal?.payload?.select),
        expand: Boolean(customReveal?.payload?.expand),
      }) ===
        JSON.stringify({
          itemHandle: 'leaf',
          parentHandles: ['group', 'subgroup'],
          focus: true,
          select: false,
          expand: false,
        }),
      'custom tree reveal payload drifted',
      customReveal?.payload || {},
    )

    console.log(
      JSON.stringify(
        {
          ok: true,
          summary: {
            rootHandles,
            groupHandles,
            subgroupHandles,
            selectionPayload,
            defaultReveal: {
              itemHandle: String(defaultReveal?.payload?.itemHandle || ''),
              parentHandles: Array.isArray(defaultReveal?.payload?.parentHandles)
                ? defaultReveal.payload.parentHandles
                : [],
              focus: Boolean(defaultReveal?.payload?.focus),
              select: Boolean(defaultReveal?.payload?.select),
              expand: Boolean(defaultReveal?.payload?.expand),
            },
            customReveal: {
              itemHandle: String(customReveal?.payload?.itemHandle || ''),
              parentHandles: Array.isArray(customReveal?.payload?.parentHandles)
                ? customReveal.payload.parentHandles
                : [],
              focus: Boolean(customReveal?.payload?.focus),
              select: Boolean(customReveal?.payload?.select),
              expand: Boolean(customReveal?.payload?.expand),
            },
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
