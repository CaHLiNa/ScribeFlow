import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
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

const runtimeActivationPayload = {
  activated: true,
  reason: '',
  registeredCommands: [],
  registeredCapabilities: [],
  registeredViews: ['examplePdfExtension.translateView'],
  registeredCommandDetails: [],
  registeredMenuActions: [],
  registeredViewDetails: [
    {
      id: 'examplePdfExtension.translateView',
      title: 'Translate PDF',
      when: '',
    },
  ],
}

const resolvedViewPayload = {
  viewId: 'examplePdfExtension.translateView',
  title: 'Translate PDF',
  description: 'Workspace PDF tools',
  message: 'Translated /tmp/paper.pdf · ref:ref-123',
  badgeValue: 1,
  badgeTooltip: 'One quick action is available for the active PDF.',
  statusLabel: 'Completed',
  statusTone: 'success',
  actionLabel: 'Review result or rerun with another language',
  sections: [
    {
      id: 'target',
      kind: 'context',
      title: 'Target',
      value: '/tmp/paper.pdf',
      tone: '',
    },
  ],
  resultEntries: [
    {
      id: 'source-pdf',
      label: 'Open Source PDF',
      description: '/tmp/paper.pdf',
      path: '/tmp/paper.pdf',
      action: 'open',
      previewMode: 'pdf',
      previewPath: '/tmp/paper.pdf',
      previewTitle: 'Source PDF Preview',
      mediaType: 'application/pdf',
    },
    {
      id: 'open-tab-source-pdf',
      label: 'Open PDF In Editor',
      description: 'Open the current source PDF as a workspace tab',
      path: '/tmp/paper.pdf',
      targetPath: '/tmp/paper.pdf',
      targetKind: 'pdf',
      action: 'open-tab',
      previewMode: 'pdf',
      previewPath: '/tmp/paper.pdf',
      previewTitle: 'Source PDF Preview',
      mediaType: 'application/pdf',
    },
    {
      id: 'reveal-source-pdf',
      label: 'Reveal Source PDF',
      description: 'Reveal the current translation input in Finder',
      path: '/tmp/paper.pdf',
      action: 'reveal',
      mediaType: 'application/pdf',
    },
    {
      id: 'copy-target-language',
      label: 'Copy Target Language',
      description: 'Copy current language preset (zh-CN)',
      action: 'copy-text',
      payload: {
        text: 'zh-CN',
      },
    },
    {
      id: 'rerun-translation-command',
      label: 'Run Translation Again',
      description: 'Execute the translation command for the current target again',
      action: 'execute-command',
      commandId: 'scribeflow.pdf.translate',
      targetKind: 'pdf',
      targetPath: '/tmp/paper.pdf',
      payload: {
        settings: {
          targetLang: 'zh-CN',
        },
      },
    },
    {
      id: 'open-reference-record',
      label: 'Open Reference Record',
      description: 'Jump to the linked reference in the library',
      action: 'open-reference',
      referenceId: 'ref-123',
    },
  ],
  artifacts: [
    {
      id: 'translation-text-output',
      kind: 'translated-text',
      mediaType: 'text/plain',
      path: '/tmp/paper.pdf.zh-CN.translation.txt',
      sourcePath: '/tmp/paper.pdf',
    },
    {
      id: 'translated-pdf-artifact',
      kind: 'translated-pdf',
      mediaType: 'application/pdf',
      path: '/tmp/paper.pdf',
      sourcePath: '/tmp/paper.pdf',
    },
  ],
  outputs: [
    {
      id: 'translation-summary-preview',
      type: 'inlineText',
      mediaType: 'text/plain',
      title: 'Translation Summary',
      description: '/tmp/paper.pdf',
      text: 'Summary from resolveView',
    },
    {
      id: 'translation-html-preview',
      type: 'inlineHtml',
      mediaType: 'text/html',
      title: 'Translation HTML Preview',
      description: '/tmp/paper.pdf',
      html: '<p>HTML from resolveView</p>',
    },
  ],
  items: [],
}

function summarizeEntries(entries = []) {
  return entries.map((entry) => ({
    id: entry.id,
    action: entry.action,
    previewMode: entry.previewMode,
    previewTitle: entry.previewTitle,
    path: entry.path || '',
    mediaType: entry.mediaType || '',
    text: entry.payload?.text || '',
    html: entry.payload?.html || '',
  }))
}

let clearTauriMocks = () => {}
let extensions = null

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  const { emit } = await import('@tauri-apps/api/event')
  clearTauriMocks = clearMocks

  mockWindows('main')
  mockIPC((cmd) => {
    if (cmd === 'extension_host_activate') {
      return runtimeActivationPayload
    }
    if (cmd === 'extension_view_resolve') {
      return resolvedViewPayload
    }
    if (cmd === 'extension_task_list') {
      return []
    }
    throw new Error(`Unexpected IPC command: ${cmd}`)
  }, { shouldMockEvents: true })

  const { useExtensionsStore } = await vite.ssrLoadModule('/src/stores/extensions.js')
  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.js')

  const pinia = createPinia()
  setActivePinia(pinia)

  const workspace = useWorkspaceStore(pinia)
  workspace.path = '/tmp/workspace'
  workspace.globalConfigDir = '/tmp/global-config'
  workspace.ensureGlobalConfigDir = async () => '/tmp/global-config'

  extensions = useExtensionsStore(pinia)
  extensions.enabledExtensionIds = ['example-pdf-extension']
  extensions.registry = [{
    id: 'example-pdf-extension',
    name: 'Example PDF Extension',
    status: 'available',
    contributedCommands: [],
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
        when: '',
      },
    ],
    contributedViewTitleMenus: [],
    contributedViewItemMenus: [],
    contributedCapabilities: [],
    capabilities: [],
    settingsSchema: {},
    warnings: [],
    errors: [],
  }]

  await extensions.startHostEventBridge()

  const view = {
    id: 'examplePdfExtension.translateView',
    extensionId: 'example-pdf-extension',
  }
  const target = {
    kind: 'referencePdf',
    path: '/tmp/paper.pdf',
    referenceId: 'ref-123',
  }

  await extensions.resolveView(view, target)
  const viewKey = 'example-pdf-extension:examplePdfExtension.translateView'
  const resolvedEntries = summarizeEntries(extensions.viewState[viewKey]?.resultEntries || [])

  assert.deepEqual(resolvedEntries, [
    {
      id: 'source-pdf',
      action: 'open',
      previewMode: 'pdf',
      previewTitle: 'Source PDF Preview',
      path: '/tmp/paper.pdf',
      mediaType: 'application/pdf',
      text: '',
      html: '',
    },
    {
      id: 'open-tab-source-pdf',
      action: 'open-tab',
      previewMode: 'pdf',
      previewTitle: 'Source PDF Preview',
      path: '/tmp/paper.pdf',
      mediaType: 'application/pdf',
      text: '',
      html: '',
    },
    {
      id: 'reveal-source-pdf',
      action: 'reveal',
      previewMode: '',
      previewTitle: '',
      path: '/tmp/paper.pdf',
      mediaType: 'application/pdf',
      text: '',
      html: '',
    },
    {
      id: 'copy-target-language',
      action: 'copy-text',
      previewMode: '',
      previewTitle: '',
      path: '',
      mediaType: '',
      text: 'zh-CN',
      html: '',
    },
    {
      id: 'rerun-translation-command',
      action: 'execute-command',
      previewMode: '',
      previewTitle: '',
      path: '',
      mediaType: '',
      text: '',
      html: '',
    },
    {
      id: 'open-reference-record',
      action: 'open-reference',
      previewMode: '',
      previewTitle: '',
      path: '',
      mediaType: '',
      text: '',
      html: '',
    },
    {
      id: 'translation-text-output',
      action: 'open',
      previewMode: 'text',
      previewTitle: 'Translated Text',
      path: '/tmp/paper.pdf.zh-CN.translation.txt',
      mediaType: 'text/plain',
      text: '',
      html: '',
    },
    {
      id: 'translated-pdf-artifact',
      action: 'open',
      previewMode: 'pdf',
      previewTitle: 'Translated Pdf',
      path: '/tmp/paper.pdf',
      mediaType: 'application/pdf',
      text: '',
      html: '',
    },
    {
      id: 'translation-summary-preview',
      action: 'open',
      previewMode: 'text',
      previewTitle: 'Translation Summary',
      path: '',
      mediaType: 'text/plain',
      text: 'Summary from resolveView',
      html: '',
    },
    {
      id: 'translation-html-preview',
      action: 'open',
      previewMode: 'html',
      previewTitle: 'Translation HTML Preview',
      path: '',
      mediaType: 'text/html',
      text: '',
      html: '<p>HTML from resolveView</p>',
    },
  ])

  await emit('extension-view-state-changed', {
    extensionId: 'example-pdf-extension',
    viewId: 'examplePdfExtension.translateView',
    workspaceRoot: '/tmp/workspace',
    title: 'Translate PDF',
    description: 'Workspace PDF tools',
    message: 'Translated /tmp/paper.pdf · ref:ref-123 · updated',
    badgeValue: 2,
    badgeTooltip: 'Two quick actions are available for the active PDF.',
    statusLabel: 'Completed',
    statusTone: 'success',
    actionLabel: 'Review the updated result',
    sections: [
      {
        id: 'target',
        kind: 'context',
        title: 'Target',
        value: '/tmp/paper.pdf',
        tone: '',
      },
    ],
    resultEntries: resolvedViewPayload.resultEntries,
    artifacts: [
      {
        id: 'translation-text-output',
        kind: 'translated-text',
        mediaType: 'text/plain',
        path: '/tmp/paper.pdf.en.translation.txt',
        sourcePath: '/tmp/paper.pdf',
      },
      {
        id: 'translated-pdf-artifact',
        kind: 'translated-pdf',
        mediaType: 'application/pdf',
        path: '/tmp/paper.pdf',
        sourcePath: '/tmp/paper.pdf',
      },
    ],
    outputs: [
      {
        id: 'translation-summary-preview',
        type: 'inlineText',
        mediaType: 'text/plain',
        title: 'Translation Summary',
        description: '/tmp/paper.pdf',
        text: 'Summary from event bridge',
      },
      {
        id: 'translation-html-preview',
        type: 'inlineHtml',
        mediaType: 'text/html',
        title: 'Translation HTML Preview',
        description: '/tmp/paper.pdf',
        html: '<p>HTML from event bridge</p>',
      },
    ],
  })

  const eventEntries = summarizeEntries(extensions.viewState[viewKey]?.resultEntries || [])
  assert.equal(eventEntries.length, 10)
  assert.equal(eventEntries.find((entry) => entry.id === 'translation-text-output')?.path, '/tmp/paper.pdf.en.translation.txt')
  assert.equal(eventEntries.find((entry) => entry.id === 'translation-summary-preview')?.text, 'Summary from event bridge')
  assert.equal(eventEntries.find((entry) => entry.id === 'translation-html-preview')?.html, '<p>HTML from event bridge</p>')

  console.log(JSON.stringify({
    ok: true,
    resolvedEntryIds: resolvedEntries.map((entry) => entry.id),
    eventEntryIds: eventEntries.map((entry) => entry.id),
    translatedTextPath: eventEntries.find((entry) => entry.id === 'translation-text-output')?.path || '',
  }, null, 2))
} finally {
  extensions?.stopHostEventBridge()
  clearTauriMocks()
  await vite.close()
}
