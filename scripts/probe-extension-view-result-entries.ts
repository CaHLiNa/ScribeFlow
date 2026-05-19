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

const resolvedViewPayload = {
  viewId: 'exampleMarkdownExtension.notesView',
  title: 'Markdown Notes',
  description: 'Summaries for the active Markdown note',
  message: 'Inspect the current note summary',
  badgeValue: 1,
  badgeTooltip: 'One note ready',
  statusLabel: 'Ready',
  statusTone: 'positive',
  actionLabel: 'Open summary',
  sections: [
    {
      id: 'summary',
      kind: 'summary',
      title: 'Summary',
      value: 'ready',
      tone: 'positive',
    },
  ],
  resultEntries: [
    {
      id: 'open-note',
      label: 'Open Source Note',
      description: '/tmp/workspace/notes/draft.md',
      path: '/tmp/workspace/notes/draft.md',
      action: 'open',
    },
    {
      id: 'summary',
      label: 'Pinned Summary',
      description: 'Explicit summary entry should win over generated output entry',
      action: 'open',
      previewMode: 'text',
      previewTitle: 'Pinned Summary',
      mediaType: 'text/plain',
      payload: {
        text: 'Pinned summary text',
      },
    },
  ],
  outputs: [
    {
      id: 'summary',
      type: 'inlineText',
      mediaType: 'text/plain',
      title: 'Note Summary',
      description: 'Current note summary',
      text: 'Summary from resolveView',
    },
  ],
  artifacts: [
    {
      id: 'summary-asset',
      kind: 'translated-text',
      mediaType: 'text/plain',
      path: '/tmp/workspace/notes/summary.txt',
      sourcePath: '/tmp/workspace/notes/draft.md',
    },
  ],
  items: [],
}

const runtimeActivationPayload = {
  activated: true,
  reason: '',
  registeredCommands: [],
  registeredCapabilities: [],
  registeredViews: ['exampleMarkdownExtension.notesView'],
  registeredCommandDetails: [],
  registeredMenuActions: [],
  registeredViewDetails: [
    {
      id: 'exampleMarkdownExtension.notesView',
      title: 'Markdown Notes',
      when: '',
    },
  ],
}

function summarizeEntries(entries = []) {
  return entries.map((entry) => ({
    id: entry.id,
    label: entry.label,
    previewMode: entry.previewMode,
    previewTitle: entry.previewTitle,
    mediaType: entry.mediaType,
    text: entry.payload?.text || '',
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

  const { useExtensionsStore } = await vite.ssrLoadModule('/src/stores/extensions.ts')
  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.ts')

  const pinia = createPinia()
  setActivePinia(pinia)

  const workspace = useWorkspaceStore(pinia)
  workspace.path = '/tmp/workspace'
  workspace.globalConfigDir = '/tmp/global-config'
  workspace.ensureGlobalConfigDir = async () => '/tmp/global-config'

  extensions = useExtensionsStore(pinia)
  extensions.enabledExtensionIds = ['example-markdown-extension']
  extensions.registry = [{
    id: 'example-markdown-extension',
    name: 'Example Markdown Extension',
    status: 'available',
    contributedCommands: [],
    contributedMenus: [],
    contributedKeybindings: [],
    contributedViewContainers: [
      {
        id: 'exampleMarkdownExtension.tools',
        panelId: 'extension:exampleMarkdownExtension.tools',
        title: 'Markdown Tools',
      },
    ],
    contributedViews: [
      {
        id: 'exampleMarkdownExtension.notesView',
        containerId: 'exampleMarkdownExtension.tools',
        panelId: 'extension:exampleMarkdownExtension.tools',
        title: 'Markdown Notes',
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
    id: 'exampleMarkdownExtension.notesView',
    extensionId: 'example-markdown-extension',
  }
  const target = {
    kind: 'workspace',
    path: '/tmp/workspace/notes/draft.md',
    referenceId: '',
  }

  await extensions.resolveView(view, target)
  const viewKey = 'example-markdown-extension:exampleMarkdownExtension.notesView'
  const resolvedEntries = summarizeEntries(extensions.viewState[viewKey]?.resultEntries || [])

  assert.deepEqual(resolvedEntries, [
    {
      id: 'open-note',
      label: 'Open Source Note',
      previewMode: '',
      previewTitle: '',
      mediaType: '',
      text: '',
    },
    {
      id: 'summary',
      label: 'Pinned Summary',
      previewMode: 'text',
      previewTitle: 'Pinned Summary',
      mediaType: 'text/plain',
      text: 'Pinned summary text',
    },
    {
      id: 'summary-asset',
      label: 'Translated Text',
      previewMode: 'text',
      previewTitle: 'Translated Text',
      mediaType: 'text/plain',
      text: '',
    },
  ])

  await emit('extension-view-state-changed', {
    extensionId: 'example-markdown-extension',
    viewId: 'exampleMarkdownExtension.notesView',
    workspaceRoot: '/tmp/workspace',
    title: 'Markdown Notes',
    description: 'Updated note summary',
    message: 'Fresh summary ready',
    badgeValue: 2,
    badgeTooltip: 'Two updates',
    statusLabel: 'Updated',
    statusTone: 'positive',
    actionLabel: 'Review summary',
    sections: [
      {
        id: 'summary',
        kind: 'summary',
        title: 'Summary',
        value: 'updated',
        tone: 'positive',
      },
    ],
    resultEntries: [
      {
        id: 'open-note',
        label: 'Open Source Note',
        description: '/tmp/workspace/notes/draft.md',
        path: '/tmp/workspace/notes/draft.md',
        action: 'open',
      },
      {
        id: 'summary',
        label: 'Pinned Summary',
        description: 'Explicit summary entry should win over generated output entry',
        action: 'open',
        previewMode: 'text',
        previewTitle: 'Pinned Summary',
        mediaType: 'text/plain',
        payload: {
          text: 'Pinned summary text from event',
        },
      },
    ],
    artifacts: [
      {
        id: 'summary-asset',
        kind: 'translated-text',
        mediaType: 'text/plain',
        path: '/tmp/workspace/notes/summary.updated.txt',
        sourcePath: '/tmp/workspace/notes/draft.md',
      },
    ],
    outputs: [
      {
        id: 'summary',
        type: 'inlineText',
        mediaType: 'text/plain',
        title: 'Note Summary',
        description: 'Updated note summary',
        text: 'Summary from event bridge',
      },
    ],
  })

  const eventEntries = summarizeEntries(extensions.viewState[viewKey]?.resultEntries || [])
  assert.deepEqual(eventEntries, [
    {
      id: 'open-note',
      label: 'Open Source Note',
      previewMode: '',
      previewTitle: '',
      mediaType: '',
      text: '',
    },
    {
      id: 'summary',
      label: 'Pinned Summary',
      previewMode: 'text',
      previewTitle: 'Pinned Summary',
      mediaType: 'text/plain',
      text: 'Pinned summary text from event',
    },
    {
      id: 'summary-asset',
      label: 'Translated Text',
      previewMode: 'text',
      previewTitle: 'Translated Text',
      mediaType: 'text/plain',
      text: '',
    },
  ])

  console.log(JSON.stringify({
    ok: true,
    resolvedEntryIds: resolvedEntries.map((entry) => entry.id),
    eventEntryIds: eventEntries.map((entry) => entry.id),
    eventSummaryText: eventEntries.find((entry) => entry.id === 'summary')?.text || '',
  }, null, 2))
} finally {
  extensions?.stopHostEventBridge()
  clearTauriMocks()
  await vite.close()
}
