import assert from 'node:assert/strict'
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
  const module = await vite.ssrLoadModule('/src/components/extensions/ExtensionSidebarTreePrimaryButton.vue')
  const ExtensionSidebarTreePrimaryButton = module.default

  const blockedApp = createSSRApp({
    render() {
      return h(ExtensionSidebarTreePrimaryButton, {
        icon: 'pdf',
        label: 'Translate current pdf',
        meta: 'paper.pdf',
        selected: true,
        focused: true,
        blocked: true,
        title: 'paper.pdf',
        blockedLabel: 'Blocked',
        blockedMessage: 'Blocked by another-extension',
        blockedToneClass: 'is-blocked',
      })
    },
  })

  const readyApp = createSSRApp({
    render() {
      return h(ExtensionSidebarTreePrimaryButton, {
        icon: 'md',
        label: 'Notes',
        meta: 'draft.md',
        title: 'Open notes',
      })
    },
  })

  const blockedHtml = await renderToString(blockedApp)
  const readyHtml = await renderToString(readyApp)

  assert.match(blockedHtml, /extension-tree-primary-button/)
  assert.match(blockedHtml, /is-selected/)
  assert.match(blockedHtml, /is-focused/)
  assert.match(blockedHtml, /is-blocked/)
  assert.match(blockedHtml, /extension-blocked-status-chip/)
  assert.match(blockedHtml, /Blocked by another-extension/)
  assert.match(blockedHtml, /disabled/)

  assert.match(readyHtml, /extension-tree-primary-button/)
  assert.match(readyHtml, /Notes/)
  assert.match(readyHtml, /draft\.md/)
  assert.match(readyHtml, /Open notes/)
  assert.doesNotMatch(readyHtml, /extension-blocked-status-chip/)

  console.log(JSON.stringify({
    ok: true,
    summary: {
      blockedSelected: blockedHtml.includes('is-selected'),
      blockedFocused: blockedHtml.includes('is-focused'),
      blockedUsesSharedChip: blockedHtml.includes('extension-blocked-status-chip'),
      readyHasMeta: readyHtml.includes('draft.md'),
      readyHasNoChip: !readyHtml.includes('extension-blocked-status-chip'),
    },
  }, null, 2))
} finally {
  await vite.close()
}
