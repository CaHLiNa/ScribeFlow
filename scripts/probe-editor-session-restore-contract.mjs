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
  const { useEditorStore } = await vite.ssrLoadModule('/src/stores/editor.ts')
  const { deriveRestoredEditorRuntimeState } = await vite.ssrLoadModule('/src/domains/editor/editorRestoreRuntime.ts')
  const { ROOT_PANE_ID } = await vite.ssrLoadModule('/src/domains/editor/paneTreeLayout.ts')

  const isContextCandidatePath = (path = '') =>
    Boolean(path && !String(path).startsWith('newtab:') && !String(path).startsWith('preview:'))

  const sessionState = {
    activePaneId: 'missing-pane',
    paneTree: {
      type: 'split',
      children: [
        {
          type: 'leaf',
          id: 'pane-left',
          tabs: ['newtab:one'],
          activeTab: 'newtab:one',
        },
        {
          type: 'leaf',
          id: 'pane-right',
          tabs: ['/tmp/workspace/paper.md', '/tmp/workspace/notes.md'],
          activeTab: '/tmp/workspace/paper.md',
        },
      ],
    },
    documentDockTabs: [
      '/tmp/workspace/dock.md',
      '/tmp/workspace/dock.md',
      '',
    ],
    activeDocumentDockTab: '/tmp/workspace/missing-dock.md',
    lastContextPath: '/tmp/workspace/stale.md',
  }

  const restored = deriveRestoredEditorRuntimeState({
    state: sessionState,
    isContextCandidatePath,
  })

  assert.equal(restored.activePaneId, ROOT_PANE_ID)
  assert.deepEqual(restored.paneTree.tabs, [
    'newtab:one',
    '/tmp/workspace/paper.md',
    '/tmp/workspace/notes.md',
  ])
  assert.equal(restored.paneTree.activeTab, '/tmp/workspace/paper.md')
  assert.deepEqual(restored.documentDockTabs, ['/tmp/workspace/dock.md'])
  assert.equal(restored.activeDocumentDockTab, '/tmp/workspace/dock.md')
  assert.equal(restored.lastContextPath, '/tmp/workspace/dock.md')

  const pinia = createPinia()
  const editor = useEditorStore(pinia)
  assert.equal(editor.applyEditorSessionState(sessionState), true)
  assert.equal(editor.restoreGeneration, 1)
  assert.equal(editor.activePaneId, ROOT_PANE_ID)
  assert.deepEqual(editor.paneTree.tabs, restored.paneTree.tabs)
  assert.equal(editor.paneTree.activeTab, '/tmp/workspace/paper.md')
  assert.deepEqual(editor.documentDockTabs, ['/tmp/workspace/dock.md'])
  assert.equal(editor.activeDocumentDockTab, '/tmp/workspace/dock.md')
  assert.equal(editor.lastContextPath, '/tmp/workspace/dock.md')

  console.log(JSON.stringify({
    ok: true,
    summary: {
      activePaneId: editor.activePaneId,
      activeTab: editor.paneTree.activeTab,
      activeDocumentDockTab: editor.activeDocumentDockTab,
      lastContextPath: editor.lastContextPath,
      restoreGeneration: editor.restoreGeneration,
    },
  }, null, 2))
} finally {
  await vite.close()
}
