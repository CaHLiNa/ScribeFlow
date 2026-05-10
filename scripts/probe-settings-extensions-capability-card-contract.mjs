import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { readFile } from 'node:fs/promises'
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
        if (rendered.includes('WebSocket server error:')) return
        console.error(message, ...rest)
      },
    },
  }),
})

let clearTauriMocks = () => {}

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  mockWindows('main')

  const zhMessages = JSON.parse(await readFile(new URL('../src-tauri/resources/i18n/zh-CN.json', import.meta.url), 'utf8'))

  mockIPC((cmd, args) => {
    if (cmd === 'workspace_preferences_load') {
      return {
        preferredLocale: 'en-US',
      }
    }
    if (cmd === 'i18n_runtime_load') {
      const preferredLocale = String(args?.params?.preferredLocale || '')
      if (preferredLocale === 'zh-CN') {
        return {
          locale: 'zh-CN',
          systemLocale: 'zh-CN',
          messages: zhMessages,
          aliases: {},
        }
      }
      return {
        locale: 'en-US',
        systemLocale: 'en-US',
        messages: {},
        aliases: {},
      }
    }
    throw new Error(`Unexpected IPC command: ${cmd}`)
  }, { shouldMockEvents: true })

  const { createSSRApp } = await vite.ssrLoadModule('/node_modules/vue/dist/vue.runtime.esm-bundler.js')
  const { renderToString } = await vite.ssrLoadModule('/node_modules/@vue/server-renderer/dist/server-renderer.esm-browser.js')
  const { useExtensionsStore } = await vite.ssrLoadModule('/src/stores/extensions.js')
  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.js')
  const { useEditorStore } = await vite.ssrLoadModule('/src/stores/editor.js')
  const { useReferencesStore } = await vite.ssrLoadModule('/src/stores/references.js')
  const { applyLocalePreference } = await vite.ssrLoadModule('/src/i18n/index.js')
  const componentModule = await vite.ssrLoadModule('/src/components/settings/SettingsExtensions.vue')
  const SettingsExtensions = componentModule.default
  const settingsExtensionsSource = await readFile(
    new URL('../src/components/settings/SettingsExtensions.vue', import.meta.url),
    'utf8',
  )
  const settingsExtensionOptionsSource = await readFile(
    new URL('../src/components/settings/SettingsExtensionOptions.vue', import.meta.url),
    'utf8',
  )

  const pinia = createPinia()
  setActivePinia(pinia)

  const workspace = useWorkspaceStore(pinia)
  workspace.path = '/tmp/workspace-a'
  workspace.leftSidebarPanel = 'files'
  workspace.globalConfigDir = '/tmp/global-config'
  workspace.ensureGlobalConfigDir = async () => '/tmp/global-config'

  const editor = useEditorStore(pinia)
  editor.activePaneId = 'pane-1'
  editor.paneTree = {
    id: 'pane-1',
    type: 'leaf',
    tabs: ['/tmp/workspace-a/paper.pdf'],
    activeTab: '/tmp/workspace-a/paper.pdf',
  }

  const references = useReferencesStore(pinia)
  references.selectedReferenceId = 'ref-123'
  references.references = [{
    id: 'ref-123',
    title: 'Probe Reference',
    pdfPath: '/tmp/workspace-a/paper.pdf',
  }]
  references.resolvedQueryState = {
    ...references.resolvedQueryState,
    filteredReferences: references.references,
    sortedReferences: references.references,
  }

  const extensions = useExtensionsStore(pinia)
  extensions.loadingRegistry = false

  const blockedExtension = {
    id: 'blocked-extension',
    name: 'Blocked Extension',
    version: '0.1.0',
    description: 'Blocked capability',
    scope: 'workspace',
    status: 'available',
    manifestFormat: 'package.json',
    main: './dist/extension.js',
    activationEvents: [],
    capabilities: ['document.translate'],
    contributedCommands: [],
    contributedMenus: [],
    contributedKeybindings: [],
    contributedViewContainers: [],
    contributedViews: [],
    contributedViewTitleMenus: [],
    contributedViewItemMenus: [],
    contributedCapabilities: [
      {
        id: 'document.translate',
        inputs: {
          document: {
            type: 'workspaceFile',
            required: true,
            extensions: ['.pdf'],
          },
        },
        outputs: {
          summary: {
            type: 'inlineText',
            required: true,
          },
        },
      },
    ],
    warnings: [],
    errors: [],
    settingsSchema: {},
    runtime: {
      runtimeType: 'node',
    },
  }

  const readyExtension = {
    id: 'ready-extension',
    name: 'Ready Extension',
    version: '0.1.0',
    description: 'Ready capability',
    scope: 'workspace',
    status: 'available',
    manifestFormat: 'package.json',
    main: './dist/extension.js',
    activationEvents: [],
    capabilities: ['document.summarize'],
    contributedCommands: [],
    contributedMenus: [],
    contributedKeybindings: [],
    contributedViewContainers: [],
    contributedViews: [],
    contributedViewTitleMenus: [],
    contributedViewItemMenus: [],
    contributedCapabilities: [
      {
        id: 'document.summarize',
        inputs: {
          document: {
            type: 'workspaceFile',
            required: true,
            extensions: ['.pdf'],
          },
        },
        outputs: {
          summary: {
            type: 'inlineText',
            required: true,
          },
        },
      },
    ],
    warnings: [],
    errors: [],
    settingsSchema: {},
    runtime: {
      runtimeType: 'node',
    },
  }

  const localizedSettingsExtension = {
    id: 'retain-pdf',
    name: 'RetainPDF',
    version: '0.1.0',
    description: '从当前 ScribeFlow PDF 或文献上下文调用 RetainPDF，生成尽量保留版式的翻译结果。',
    scope: 'workspace',
    status: 'available',
    manifestFormat: 'package.json',
    main: './extension.js',
    activationEvents: [],
    capabilities: [],
    contributedCommands: [],
    contributedMenus: [],
    contributedKeybindings: [],
    contributedViewContainers: [],
    contributedViews: [],
    contributedViewTitleMenus: [],
    contributedViewItemMenus: [],
    contributedCapabilities: [],
    warnings: [],
    errors: [],
    settingsSchema: {
      'retainPdf.modelBaseUrl': {
        key: 'retainPdf.modelBaseUrl',
        type: 'string',
        default: 'https://api.deepseek.com/v1',
        label: '模型 API 地址',
        description: 'RetainPDF 翻译时使用的 OpenAI 兼容模型 API 地址。',
        secureStorage: false,
        options: [],
      },
      'retainPdf.modelApiKey': {
        key: 'retainPdf.modelApiKey',
        type: 'string',
        default: '',
        label: '模型 API 密钥',
        description: '翻译模型服务的 API 密钥。',
        secureStorage: true,
        options: [],
      },
      'retainPdf.developerMode': {
        key: 'retainPdf.developerMode',
        type: 'boolean',
        default: true,
        label: '开发者模式',
        description: '为本地工作区 PDF 启用 RetainPDF 开发者模式上传。',
        secureStorage: false,
        options: [],
      },
    },
    runtime: {
      runtimeType: 'node',
    },
  }

  async function renderCurrentState() {
    const app = createSSRApp(SettingsExtensions)
    app.use(pinia)
    return renderToString(app)
  }

  extensions.enabledExtensionIds = ['blocked-extension']
  extensions.registry = [blockedExtension]
  extensions.hostSummary = {
    available: true,
    runtime: 'node-extension-host-persistent',
    activatedExtensions: ['blocked-extension'],
    activeRuntimeSlots: [
      { extensionId: 'blocked-extension', workspaceRoot: '/tmp/workspace-a' },
    ],
    pendingPromptOwner: {
      extensionId: 'another-extension',
      workspaceRoot: '/tmp/workspace-b',
    },
  }
  extensions.runtimeRegistry = {
    'blocked-extension': {
      activated: true,
      registeredCommands: [],
      registeredViews: [],
      registeredCapabilities: ['document.translate'],
      registeredMenuActions: [],
    },
  }

  const blockedHtml = await renderCurrentState()
  assert.match(blockedHtml, /Blocked Extension/)
  assert.doesNotMatch(blockedHtml, /document\.translate/)
  assert.doesNotMatch(blockedHtml, /extension-blocked-status-chip/)
  assert.doesNotMatch(blockedHtml, /Run document\.translate/)
  assert.doesNotMatch(blockedHtml, /权限/)
  assert.doesNotMatch(blockedHtml, /安全设置/)
  assert.doesNotMatch(blockedHtml, /开发者信息/)

  extensions.enabledExtensionIds = ['ready-extension']
  extensions.registry = [readyExtension]
  extensions.hostSummary = {
    available: true,
    runtime: 'node-extension-host-persistent',
    activatedExtensions: ['ready-extension'],
    activeRuntimeSlots: [
      { extensionId: 'ready-extension', workspaceRoot: '/tmp/workspace-a' },
    ],
    pendingPromptOwner: null,
  }
  extensions.runtimeRegistry = {
    'ready-extension': {
      activated: true,
      registeredCommands: [],
      registeredViews: [],
      registeredCapabilities: ['document.summarize'],
      registeredMenuActions: [],
    },
  }

  const readyHtml = await renderCurrentState()
  assert.match(readyHtml, /Ready Extension/)
  assert.doesNotMatch(readyHtml, /document\.summarize/)
  assert.doesNotMatch(readyHtml, /extension-status-pill/)
  assert.doesNotMatch(readyHtml, /Run Summarize document/)
  assert.doesNotMatch(readyHtml, /开发者信息/)

  await applyLocalePreference('zh-CN')

  extensions.enabledExtensionIds = ['retain-pdf']
  extensions.registry = [localizedSettingsExtension]
  extensions.hostSummary = {
    available: true,
    runtime: 'node-extension-host-persistent',
    activatedExtensions: [],
    activeRuntimeSlots: [],
    pendingPromptOwner: null,
  }
  extensions.runtimeRegistry = {}

  const localizedHtml = await renderCurrentState()
  assert.match(localizedHtml, /已加载扩展/)
  assert.match(localizedHtml, /<h4[^>]*class="settings-group-title"[^>]*>已加载扩展<\/h4>/)
  assert.match(localizedHtml, /aria-label="刷新扩展"/)
  assert.match(localizedHtml, /aria-label="打开扩展安装目录"/)
  assert.match(localizedHtml, /aria-label="选项"/)
  assert.doesNotMatch(localizedHtml, /模型 API 地址/)
  assert.doesNotMatch(localizedHtml, /模型 API 密钥/)
  assert.doesNotMatch(localizedHtml, /开发者模式/)
  assert.doesNotMatch(localizedHtml, /钥匙串/)
  assert.doesNotMatch(localizedHtml, /extension-setting-row/)
  assert.doesNotMatch(localizedHtml, /extension-settings-panel/)
  assert.doesNotMatch(localizedHtml, /由主程序管理模型、接口地址和安全凭据。/)
  assert.doesNotMatch(localizedHtml, /不常用的插件专属选项。/)
  assert.doesNotMatch(localizedHtml, /权限/)
  assert.doesNotMatch(localizedHtml, /安全设置/)
  assert.doesNotMatch(localizedHtml, /开发者信息/)
  assert.doesNotMatch(localizedHtml, /PDF translation/)
  assert.doesNotMatch(localizedHtml, /运行 PDF translation/)
  assert.doesNotMatch(localizedHtml, /刷新扩展注册表/)
  assert.doesNotMatch(localizedHtml, /已安装扩展/)
  assert.doesNotMatch(localizedHtml, /RetainPDF API 密钥/)
  assert.doesNotMatch(localizedHtml, />apiKey</)
  assert.doesNotMatch(localizedHtml, />modelBaseUrl</)
  assert.doesNotMatch(localizedHtml, />developerMode</)
  assert.doesNotMatch(localizedHtml, /Keychain/)
  assert.doesNotMatch(localizedHtml, /Less common plugin-specific options/)
  assert.doesNotMatch(localizedHtml, /Host-managed model, endpoint, and secure credential values/)
  assert.match(
    settingsExtensionOptionsSource,
    /settingGroups\.length === 0 && actionGroups\.length === 0/,
  )

  console.log(JSON.stringify({
    ok: true,
    summary: {
      hiddenBlockedCapabilityCard: !blockedHtml.includes('extension-blocked-status-chip') &&
        !blockedHtml.includes('Run document.translate'),
      hiddenReadyCapabilityCard: !readyHtml.includes('extension-status-pill') &&
        !readyHtml.includes('Run Summarize document'),
      hiddenInternalSummaries: !localizedHtml.includes('权限') &&
        !localizedHtml.includes('安全设置') &&
        !localizedHtml.includes('开发者信息'),
      localizedHeaderActions: localizedHtml.includes('已加载扩展') &&
        localizedHtml.includes('aria-label="刷新扩展"') &&
        localizedHtml.includes('aria-label="打开扩展安装目录"'),
      collapsedSettingsByDefault: !localizedHtml.includes('模型 API 地址') &&
        !localizedHtml.includes('模型 API 密钥') &&
        !localizedHtml.includes('开发者模式'),
      localizedOptionsButton: localizedHtml.includes('aria-label="选项"'),
      runtimeOnlyActionsDoNotFallThroughEmptyState:
        settingsExtensionOptionsSource.includes('settingGroups.length === 0 && actionGroups.length === 0'),
    },
  }, null, 2))
} finally {
  clearTauriMocks()
  await vite.close()
}
