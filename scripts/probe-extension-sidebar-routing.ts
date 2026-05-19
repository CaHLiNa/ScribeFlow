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
        if (rendered.includes('WebSocket server error:')) {
          return
        }
        console.error(message, ...rest)
      },
    },
  }),
})

try {
  const { useExtensionsStore } = await vite.ssrLoadModule('/src/stores/extensions.ts')
  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.ts')
  const { buildExtensionContext } = await vite.ssrLoadModule('/src/domains/extensions/extensionContext.ts')
  const { buildExtensionPluginContainerPresentation } = await vite.ssrLoadModule('/src/domains/extensions/extensionPluginContainerPresentation.ts')
  const { documentDockPageRegistry } = await vite.ssrLoadModule('/src/components/sidebar/documentDockPageRegistry.ts')

  const pinia = createPinia()
  const workspace = useWorkspaceStore(pinia)
  workspace.primarySurface = 'settings'
  workspace.leftSidebarPanel = 'references'
  workspace.path = '/tmp/workspace'

  const workspaceCalls = []
  workspace.openWorkspaceSurface = async () => {
    workspaceCalls.push(['openWorkspaceSurface'])
    workspace.primarySurface = 'workspace'
  }
  workspace.setLeftSidebarPanel = async (panel) => {
    workspaceCalls.push(['setLeftSidebarPanel', panel])
    workspace.leftSidebarPanel = String(panel || '')
  }
  workspace.openDocumentDock = async () => {
    workspaceCalls.push(['openDocumentDock'])
    workspace.documentDockOpen = true
  }
  workspace.setDocumentDockActivePage = async (page) => {
    workspaceCalls.push(['setDocumentDockActivePage', page])
    workspace.documentDockActivePage = String(page || '')
  }

  const extensions = useExtensionsStore(pinia)
  extensions.enabledExtensionIds = ['example-pdf-extension']
  extensions.registry = [{
    id: 'example-pdf-extension',
    name: 'Example PDF Extension',
    status: 'available',
    contributedCommands: [
      {
        commandId: 'scribeflow.pdf.translate',
        title: 'Translate',
        category: 'PDF',
      },
      {
        commandId: 'examplePdfExtension.refreshTranslateView',
        title: 'Refresh Translate View',
        category: 'PDF',
      },
    ],
    contributedMenus: [],
    contributedKeybindings: [],
    contributedViewContainers: [
      {
        id: 'examplePdfExtension.tools',
        panelId: 'extension:examplePdfExtension.tools',
        title: 'PDF Tools',
      },
    ],
    contributedViews: [
      {
        id: 'examplePdfExtension.translateView',
        containerId: 'examplePdfExtension.tools',
        panelId: 'extension:examplePdfExtension.tools',
        title: 'Translate PDF',
        contextualTitle: '',
        presentation: 'documentAction',
        when: 'resourceExtname == .pdf || resource.kind == pdf',
      },
    ],
    contributedViewTitleMenus: [
      {
        surface: 'view/title',
        commandId: 'examplePdfExtension.refreshTranslateView',
        title: 'Refresh Translate View',
        when: 'activeView == extension:examplePdfExtension.tools',
      },
    ],
    contributedViewItemMenus: [],
    capabilities: [],
    settingsSchema: {},
    warnings: [],
    errors: [],
  }]

  const target = {
    kind: 'pdf',
    referenceId: 'ref-123',
    path: '/tmp/paper.pdf',
  }

  const routedContainer = await extensions.routeActionToSidebar({
    extensionId: 'example-pdf-extension',
    commandId: 'scribeflow.pdf.translate',
  }, target)

  assert.equal(routedContainer?.panelId, 'extension:examplePdfExtension.tools')
  assert.deepEqual(extensions.sidebarTargetForPanel('extension:examplePdfExtension.tools'), target)
  assert.equal(workspace.primarySurface, 'workspace')
  assert.equal(workspace.leftSidebarPanel, 'files')
  assert.equal(workspace.documentDockOpen, true)
  assert.equal(workspace.documentDockActivePage, 'extension:examplePdfExtension.tools')
  assert.deepEqual(workspaceCalls, [
    ['openWorkspaceSurface'],
    ['setLeftSidebarPanel', 'files'],
    ['openDocumentDock'],
    ['setDocumentDockActivePage', 'extension:examplePdfExtension.tools'],
  ])

  const context = buildExtensionContext(target, {
    workbench: {
      surface: 'workspace',
      panel: 'documentDock',
      activeView: 'extension:examplePdfExtension.tools',
      hasWorkspace: true,
      workspaceFolder: '/tmp/workspace',
    },
  })

  const views = extensions.viewsForContainer('examplePdfExtension.tools', context)
  assert.equal(views.length, 1)
  assert.equal(views[0].panelId, 'extension:examplePdfExtension.tools')
  assert.equal(views[0].presentation, 'documentAction')

  const titleActions = extensions.viewTitleActionsForView(views[0], context)
  assert.equal(titleActions.length, 1)
  assert.equal(titleActions[0].commandId, 'examplePdfExtension.refreshTranslateView')

  const pages = documentDockPageRegistry.resolvePages({
    allowedPageIds: ['preview', 'references', 'extension:', 'extension:examplePdfExtension.tools'],
    filePath: '/tmp/paper.pdf',
    pluginContainers: [
      {
        id: 'examplePdfExtension.tools',
        panelId: 'extension:examplePdfExtension.tools',
        title: 'PDF Tools',
        badgeValue: 1,
      },
    ],
    hasPluginViews: true,
    comparisonTabs: [],
    pageDefinitions: [
      { id: 'preview', permanent: true, dynamic: false, closeable: true, fallbackPage: 'file' },
      { id: 'references', permanent: true, dynamic: false, closeable: false, fallbackPage: 'preview' },
      { id: 'extension:', permanent: false, dynamic: true, closeable: false, fallbackPage: 'preview' },
      { id: 'problems', permanent: false, dynamic: true, closeable: true, fallbackPage: 'preview' },
      { id: 'file', permanent: false, dynamic: true, closeable: true, fallbackPage: 'preview' },
    ],
    t: (value) => value,
  })

  const pluginPage = pages.find((page) => page.key === 'extension:examplePdfExtension.tools')
  assert.ok(pluginPage)
  assert.equal(pluginPage.type, 'extension:examplePdfExtension.tools')
  assert.equal(pluginPage.label, undefined)
  assert.equal(pluginPage.componentProps?.panelId, 'extension:examplePdfExtension.tools')
  const pluginPresentation = buildExtensionPluginContainerPresentation(
    {
      id: 'examplePdfExtension.tools',
      title: 'PDF Tools',
    },
    {
      badgeValue: 1,
      badgeTooltip: 'One quick action is available for the active PDF.',
    },
    (value) => value,
  )
  assert.equal(pluginPresentation.title, 'PDF Tools (1)')

  const markdownPages = documentDockPageRegistry.resolvePages({
    allowedPageIds: ['preview', 'references', 'extension:', 'extension:examplePdfExtension.tools'],
    filePath: '/tmp/notes.md',
    pluginContainers: [],
    hasPluginViews: false,
    comparisonTabs: [],
    pageDefinitions: [
      { id: 'preview', permanent: true, dynamic: false, closeable: true, fallbackPage: 'file' },
      { id: 'references', permanent: true, dynamic: false, closeable: false, fallbackPage: 'preview' },
      { id: 'extension:', permanent: false, dynamic: true, closeable: false, fallbackPage: 'preview' },
      { id: 'problems', permanent: false, dynamic: true, closeable: true, fallbackPage: 'preview' },
      { id: 'file', permanent: false, dynamic: true, closeable: true, fallbackPage: 'preview' },
    ],
    t: (value) => value,
  })
  assert.equal(
    markdownPages.some((page) => page.key === 'extension:examplePdfExtension.tools'),
    false,
    'document dock should not expose PDF-only plugin page for non-PDF documents',
  )

  console.log(JSON.stringify({
    ok: true,
    routedPanelId: routedContainer.panelId,
    workspaceCalls,
    titleActionCommandId: titleActions[0].commandId,
    pluginDockPage: {
      key: pluginPage.key,
      type: pluginPage.type,
      title: pluginPage.title,
    },
    pluginPresentationTitle: pluginPresentation.title,
  }, null, 2))
} finally {
  await vite.close()
}
