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

  const workspace = useWorkspaceStore(createPinia())

  workspace.applyWorkspacePreferenceState({ leftSidebarPanel: '' })
  assert.equal(workspace.leftSidebarPanel, 'files')

  workspace.applyWorkspacePreferenceState({ leftSidebarPanel: 'extension:example.tools' })
  assert.equal(workspace.leftSidebarPanel, 'files')

  workspace.applyWorkspacePreferenceState({ leftSidebarPanel: 'unknown' })
  assert.equal(workspace.leftSidebarPanel, 'files')

  workspace.applyWorkspacePreferenceState({ leftSidebarPanel: 'references' })
  assert.equal(workspace.leftSidebarPanel, 'references')

  workspace.openSettings('general')
  assert.equal(workspace.primarySurface, 'settings')
  assert.equal(workspace.settingsOpen, true)

  workspace.applyWorkspacePreferenceState({ leftSidebarPanel: 'files', primarySurface: 'workspace' })
  assert.equal(workspace.primarySurface, 'settings')
  assert.equal(workspace.settingsOpen, true)
  assert.equal(workspace.settingsSection, 'general')

  await workspace.openWorkspaceSurface()
  assert.equal(workspace.primarySurface, 'workspace')
  assert.equal(workspace.settingsOpen, false)
  assert.equal(workspace.settingsSection, null)

  console.log('workspace sidebar panel normalization probe passed')
} finally {
  await vite.close()
}
