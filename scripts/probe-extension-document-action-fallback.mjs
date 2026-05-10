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
          label: 'RetainPDF 面板已刷新',
          state: 'idle',
          current: 0,
          total: 0,
        },
      },
    },
  }

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
  assert.match(html, /Translate/)
  assert.doesNotMatch(html, /disabled/)

  console.log(JSON.stringify({
    ok: true,
    summary: {
      hasTarget: html.includes('paper.pdf'),
      hasTranslateButton: html.includes('Translate'),
      buttonEnabled: !html.includes('disabled'),
    },
  }, null, 2))
} finally {
  await vite.close()
}
