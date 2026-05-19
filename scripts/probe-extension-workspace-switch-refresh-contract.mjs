import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { createLogger, createServer } from 'vite'

if (!globalThis.window) {
  globalThis.window = globalThis
}

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto
}

const vite = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
  logLevel: 'error',
  customLogger: createLogger('error', {
    customConsole: {
      ...console,
      error(message, ...rest) {
        const rendered = String(message || '')
        if (rendered.includes('WebSocket server error:')) {
          return
        }
        console.error(message, ...rest)
      },
    },
  }),
})

const probeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'scribeflow-extension-workspace-switch-'))
let clearTauriMocks = () => {}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(value, null, 2))
}

async function writeWorkspaceExtension(workspaceRoot, extensionId, title) {
  const extensionRoot = path.join(workspaceRoot, '.scribeflow', 'extensions', extensionId)
  await writeJson(path.join(extensionRoot, 'package.json'), {
    id: extensionId,
    name: extensionId,
    version: '0.0.1',
    engines: { scribeflow: '^1.1.0' },
    runtime: { type: 'extensionHost' },
    main: './dist/extension.js',
    contributes: {
      commands: [{
        command: `${extensionId}.command`,
        title,
      }],
    },
  })
}

try {
  const globalConfigDir = path.join(probeRoot, 'global')
  const workspaceA = path.join(probeRoot, 'workspace-a')
  const workspaceB = path.join(probeRoot, 'workspace-b')
  await fs.mkdir(globalConfigDir, { recursive: true })
  await fs.mkdir(workspaceA, { recursive: true })
  await fs.mkdir(workspaceB, { recursive: true })
  await writeWorkspaceExtension(workspaceA, 'workspace-a-extension', 'Workspace A Command')
  await writeWorkspaceExtension(workspaceB, 'workspace-b-extension', 'Workspace B Command')
  await writeJson(path.join(workspaceA, '.scribeflow', 'extension-settings.json'), {
    enabledExtensionIds: ['workspace-a-extension'],
    extensionConfig: {
      'workspace-a-extension': {
        label: 'workspace-a-setting',
      },
    },
  })
  await writeJson(path.join(workspaceB, '.scribeflow', 'extension-settings.json'), {
    enabledExtensionIds: ['workspace-b-extension'],
    extensionConfig: {
      'workspace-b-extension': {
        label: 'workspace-b-setting',
      },
    },
  })

  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  mockWindows('main')
  const ipcCalls = []
  mockIPC((cmd, args) => {
    ipcCalls.push([cmd, args])
    const workspaceRoot = String(args?.params?.workspaceRoot || '')
    if (cmd === 'extension_registry_list') {
      if (workspaceRoot === workspaceA) {
        return [{
          id: 'workspace-a-extension',
          name: 'workspace-a-extension',
          version: '0.0.1',
          description: '',
          scope: 'workspace',
          status: 'available',
          manifestFormat: 'canonical',
          manifest: {
            main: './dist/extension.js',
            activationEvents: [],
            extensionKind: ['workspace'],
            contributes: {
              commands: [{
                command: 'workspace-a-extension.command',
                title: 'Workspace A Command',
              }],
            },
          },
          capabilities: [],
          warnings: [],
          errors: [],
        }]
      }
      if (workspaceRoot === workspaceB) {
        return [{
          id: 'workspace-b-extension',
          name: 'workspace-b-extension',
          version: '0.0.1',
          description: '',
          scope: 'workspace',
          status: 'available',
          manifestFormat: 'canonical',
          manifest: {
            main: './dist/extension.js',
            activationEvents: [],
            extensionKind: ['workspace'],
            contributes: {
              commands: [{
                command: 'workspace-b-extension.command',
                title: 'Workspace B Command',
              }],
            },
          },
          capabilities: [],
          warnings: [],
          errors: [],
        }]
      }
      return []
    }
    if (cmd === 'extension_settings_load') {
      if (workspaceRoot === workspaceA) {
        return {
          settingsExists: true,
          enabledExtensionIds: ['workspace-a-extension'],
          extensionConfig: {
            'workspace-a-extension': {
              label: 'workspace-a-setting',
            },
          },
        }
      }
      if (workspaceRoot === workspaceB) {
        return {
          settingsExists: true,
          enabledExtensionIds: ['workspace-b-extension'],
          extensionConfig: {
            'workspace-b-extension': {
              label: 'workspace-b-setting',
            },
          },
        }
      }
      return {
        settingsExists: false,
        enabledExtensionIds: [],
        extensionConfig: {},
      }
    }
    if (cmd === 'extension_host_activate') {
      return {
        activated: true,
        reason: 'workspace-switch-probe',
        registeredCommands: [],
        registeredCapabilities: [],
        registeredViews: [],
        registeredCommandDetails: [],
        registeredMenuActions: [],
        registeredViewDetails: [],
      }
    }
    if (cmd === 'extension_host_status') {
      return {
        available: true,
        runtime: 'node-extension-host-persistent',
        activatedExtensions: workspaceRoot === workspaceB
          ? ['workspace-b-extension']
          : ['workspace-a-extension'],
        activeRuntimeSlots: workspaceRoot === workspaceB
          ? [
            {
              extensionId: 'workspace-b-extension',
              workspaceRoot: workspaceB,
            },
          ]
          : [
            {
              extensionId: 'workspace-a-extension',
              workspaceRoot: workspaceA,
            },
          ],
        pendingPromptOwner: null,
      }
    }
    if (cmd === 'extension_host_deactivate') {
      return {
        extensionId: String(args?.params?.extensionId || ''),
        accepted: true,
      }
    }
    if (cmd === 'extension_task_list') {
      return []
    }
    throw new Error(`Unexpected IPC command: ${cmd}`)
  }, { shouldMockEvents: true })

  const { useExtensionsStore } = await vite.ssrLoadModule('/src/stores/extensions.ts')
  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.ts')

  const pinia = createPinia()
  setActivePinia(pinia)

  const workspace = useWorkspaceStore(pinia)
  workspace.globalConfigDir = globalConfigDir
  workspace.ensureGlobalConfigDir = async () => globalConfigDir

  const extensions = useExtensionsStore(pinia)

  workspace.path = workspaceA
  await extensions.refreshRegistry({ forceSettingsReload: true })

  const workspaceARegistryIds = extensions.registry.map((entry) => entry.id)
  const workspaceAEnabledIds = [...extensions.enabledExtensionIds]
  const workspaceASetting = extensions.extensionConfig?.['workspace-a-extension']?.label || ''

  assert.ok(workspaceARegistryIds.includes('workspace-a-extension'))
  assert.ok(!workspaceARegistryIds.includes('workspace-b-extension'))
  assert.deepEqual(workspaceAEnabledIds, ['workspace-a-extension'])
  assert.equal(workspaceASetting, 'workspace-a-setting')

  extensions.setSidebarTarget('extension:workspace-a', {
    kind: 'pdf',
    path: path.join(workspaceA, 'paper.pdf'),
  })
  extensions.deferViewRequest({
    kind: 'resolveView',
    extensionId: 'workspace-a-extension',
    workspaceRoot: workspaceA,
    viewId: 'workspaceA.view',
  })

  workspace.path = workspaceB
  await extensions.teardownWorkspaceRuntimeSlots(workspaceA)
  extensions.resetWorkspaceSessionState()
  await extensions.refreshRegistry({ forceSettingsReload: true })

  const workspaceBRegistryIds = extensions.registry.map((entry) => entry.id)
  const workspaceBEnabledIds = [...extensions.enabledExtensionIds]
  const workspaceBSetting = extensions.extensionConfig?.['workspace-b-extension']?.label || ''

  assert.ok(!workspaceBRegistryIds.includes('workspace-a-extension'))
  assert.ok(workspaceBRegistryIds.includes('workspace-b-extension'))
  assert.deepEqual(workspaceBEnabledIds, ['workspace-b-extension'])
  assert.equal(workspaceBSetting, 'workspace-b-setting')
  assert.deepEqual(extensions.tasks, [])
  assert.deepEqual(extensions.deferredViewRequests, {})
  assert.deepEqual(extensions.sidebarTargets, {})
  assert.ok(
    ipcCalls.some(([cmd, args]) =>
      cmd === 'extension_host_deactivate' &&
      String(args?.params?.extensionId || '') === 'workspace-a-extension' &&
      String(args?.params?.workspaceRoot || '') === workspaceA
    ),
  )

  console.log(JSON.stringify({
    ok: true,
    summary: {
      workspaceARegistryIds,
      workspaceAEnabledIds,
      workspaceASetting,
      workspaceBRegistryIds,
      workspaceBEnabledIds,
      workspaceBSetting,
      deactivatedWorkspaceARuntime: ipcCalls.some(([cmd]) => cmd === 'extension_host_deactivate'),
      deferredAfterReset: Object.keys(extensions.deferredViewRequests).length,
      sidebarTargetsAfterReset: Object.keys(extensions.sidebarTargets).length,
    },
  }, null, 2))
} finally {
  clearTauriMocks()
  await vite.close()
  await fs.rm(probeRoot, { recursive: true, force: true })
}
