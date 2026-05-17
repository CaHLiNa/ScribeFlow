import assert from 'node:assert/strict'
import { createPinia } from 'pinia'
import { createLogger, createServer } from 'vite'

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

try {
  const { createSSRApp, h } = await vite.ssrLoadModule('/node_modules/vue/dist/vue.runtime.esm-bundler.js')
  const { renderToString } = await vite.ssrLoadModule('/node_modules/@vue/server-renderer/dist/server-renderer.esm-browser.js')
  const { useExtensionsStore } = await vite.ssrLoadModule('/src/stores/extensions.js')
  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.js')
  const DocumentPluginsPanel = (await vite.ssrLoadModule('/src/components/sidebar/DocumentPluginsPanel.vue')).default

  const pinia = createPinia()
  const workspace = useWorkspaceStore(pinia)
  workspace.path = '/tmp/workspace'

  const extensions = useExtensionsStore(pinia)
  extensions.hostSummary = {
    available: true,
    runtime: 'node-extension-host-persistent',
    activatedExtensions: [],
    activeRuntimeSlots: [{
      extensionId: 'retain-pdf',
      workspaceRoot: '/tmp/other-workspace',
      active: true,
    }],
    pendingPromptOwner: null,
  }
  extensions.enabledExtensionIds = ['retain-pdf']
  extensions.registry = [{
    id: 'retain-pdf',
    name: 'RetainPDF',
    status: 'available',
    contributedCommands: [
      {
        commandId: 'retainPdf.translateCurrent',
        title: 'Translate Current PDF',
        category: 'RetainPDF',
      },
    ],
    contributedMenus: [],
    contributedKeybindings: [],
    contributedViewContainers: [
      {
        id: 'retainPdf.tools',
        panelId: 'extension:retainPdf.tools',
        title: 'RetainPDF',
      },
    ],
    contributedViews: [
      {
        id: 'retainPdf.panel',
        containerId: 'retainPdf.tools',
        panelId: 'extension:retainPdf.tools',
        title: 'RetainPDF',
        presentation: 'documentAction',
        when: 'resourceExtname == .pdf || resource.kind == pdf',
      },
    ],
    contributedViewTitleMenus: [],
    contributedViewItemMenus: [],
    capabilities: [],
    settingsSchema: {},
    warnings: [],
    errors: [],
  }]
  extensions.runtimeRegistry = {
    'retain-pdf': {
      activated: true,
      registeredCommands: ['retainPdf.translateCurrent'],
      registeredViews: ['retainPdf.panel'],
    },
  }
  extensions.sidebarTargets = {
    'extension:retainPdf.tools': {
      kind: 'pdf',
      referenceId: '',
      path: '/tmp/workspace/paper.pdf',
    },
  }
  extensions.viewState = {
    'retain-pdf:retainPdf.panel': {
      viewId: 'retainPdf.panel',
      title: 'RetainPDF',
      presentation: {
        mode: 'documentAction',
        target: {
          label: '',
          path: '',
          emptyLabel: 'No active PDF',
        },
        action: {
          label: 'Translate',
          commandId: 'retainPdf.translateCurrent',
          disabled: true,
        },
        progress: {
          label: 'Idle',
          state: 'idle',
          current: 0,
          total: 0,
        },
      },
    },
  }
  extensions.upsertTask({
    id: 'task-running',
    extensionId: 'retain-pdf',
    workspaceRoot: '/tmp/workspace',
    commandId: 'retainPdf.translateCurrent',
    state: 'running',
    createdAt: '2026-05-12T10:00:00Z',
    startedAt: '2026-05-12T10:00:05Z',
    progress: {
      label: 'Translating',
      current: 1,
      total: 2,
    },
    target: {
      kind: 'pdf',
      path: '/tmp/workspace/paper.pdf',
    },
    outputs: [
      {
        id: 'translated-text',
        type: 'inlineText',
        title: 'Translated Text',
        text: 'Translated excerpt',
      },
    ],
  })

  const app = createSSRApp({
    render() {
      return h(DocumentPluginsPanel, {
        filePath: '/tmp/workspace/paper.pdf',
        panelId: 'extension:retainPdf.tools',
      })
    },
  })
  app.use(pinia)

  const html = await renderToString(app)
  assert.match(html, /paper\.pdf/)
  assert.match(html, /RetainPDF/)
  assert.match(html, /Target: \/tmp\/workspace\/paper\.pdf/)
  assert.match(html, /Host Runtime/)
  assert.match(html, /Runtime activated but no active slot is attached to this workspace/)
  assert.match(html, /Translate/)
  assert.doesNotMatch(html, /disabled/)
  assert.match(html, /Plugin Tasks/)
  assert.match(html, /Running/)
  assert.match(html, /Translating/)
  assert.match(html, /Translated Text/)
  assert.match(html, /Cancel/)

  console.log(JSON.stringify({
    ok: true,
    summary: {
      hasTarget: html.includes('paper.pdf'),
      hasContainerHeader: html.includes('RetainPDF'),
      hasTargetSummary: html.includes('Target: /tmp/workspace/paper.pdf'),
      hasHostDiagnostic: html.includes('Runtime activated but no active slot is attached to this workspace'),
      hasTranslateButton: html.includes('Translate'),
      hasTaskPanel: html.includes('Plugin Tasks'),
      hasRunningTask: html.includes('Running'),
      hasResultEntry: html.includes('Translated Text'),
    },
  }, null, 2))
} finally {
  await vite.close()
}
