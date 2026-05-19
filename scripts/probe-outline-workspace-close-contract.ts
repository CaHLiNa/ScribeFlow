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
  const { useWorkspaceStore } = await vite.ssrLoadModule('/src/stores/workspace.ts')
  const { useEditorStore } = await vite.ssrLoadModule('/src/stores/editor.ts')
  const {
    isWorkspaceDocumentPath,
    resolveActiveWorkspaceDocumentTab,
    resolvePaneDocumentTab,
  } = await vite.ssrLoadModule('/src/domains/editor/paneDocumentDockRuntime.ts')
  const { ROOT_PANE_ID } = await vite.ssrLoadModule('/src/domains/editor/paneTreeLayout.ts')

  const pinia = createPinia()
  const workspace = useWorkspaceStore(pinia)
  const editor = useEditorStore(pinia)
  const workspacePath = '/tmp/scribeflow-outline-close'
  const documentPath = `${workspacePath}/paper.md`

  workspace.path = workspacePath
  editor.paneTree = {
    type: 'leaf',
    id: ROOT_PANE_ID,
    tabs: [documentPath],
    activeTab: documentPath,
  }
  editor.activePaneId = ROOT_PANE_ID

  assert.equal(workspace.isOpen, true)
  assert.equal(isWorkspaceDocumentPath(editor.activeTab, workspace.path), true)
  assert.equal(
    resolvePaneDocumentTab({
      activeTab: editor.activeTab,
      lastDocumentTab: documentPath,
      workspacePath: workspace.path,
    }),
    documentPath,
  )
  assert.equal(
    resolveActiveWorkspaceDocumentTab({
      activeTab: editor.activeTab,
      workspacePath: workspace.path,
    }),
    documentPath,
  )

  editor.openNewTab(ROOT_PANE_ID)

  assert.equal(resolvePaneDocumentTab({
    activeTab: editor.activeTab,
    lastDocumentTab: documentPath,
    workspacePath: workspace.path,
  }), documentPath)
  assert.equal(
    resolveActiveWorkspaceDocumentTab({
      activeTab: editor.activeTab,
      workspacePath: workspace.path,
    }),
    null,
  )

  editor.setActiveTab(ROOT_PANE_ID, documentPath)
  assert.equal(
    resolveActiveWorkspaceDocumentTab({
      activeTab: `preview:${documentPath}`,
      workspacePath: workspace.path,
    }),
    documentPath,
  )

  workspace.beginWorkspaceClose()

  assert.equal(workspace.isOpen, false)
  assert.equal(isWorkspaceDocumentPath(editor.activeTab, workspace.path), false)
  assert.equal(
    resolvePaneDocumentTab({
      activeTab: editor.activeTab,
      lastDocumentTab: documentPath,
      workspacePath: workspace.path,
    }),
    null,
  )

  console.log('outline workspace close contract probe passed')
} finally {
  await vite.close()
}
