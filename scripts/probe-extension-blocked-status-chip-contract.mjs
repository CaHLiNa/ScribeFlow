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
  const chipModule = await vite.ssrLoadModule('/src/components/extensions/ExtensionBlockedStatusChip.vue')
  const chip = chipModule.default

  const regularApp = createSSRApp({
    render() {
      return h(chip, {
        label: 'Blocked',
        title: 'Blocked by another-extension',
        toneClass: 'is-blocked',
      })
    },
  })

  const compactApp = createSSRApp({
    render() {
      return h(chip, {
        label: 'Waiting for prompt',
        title: 'Waiting in this workspace',
        toneClass: 'is-warning',
        compact: true,
      })
    },
  })

  const regularHtml = await renderToString(regularApp)
  const compactHtml = await renderToString(compactApp)

  assert.match(regularHtml, /extension-blocked-status-chip/)
  assert.match(regularHtml, /is-blocked/)
  assert.match(regularHtml, /Blocked by another-extension/)
  assert.match(compactHtml, /is-warning/)
  assert.match(compactHtml, /is-compact/)
  assert.match(compactHtml, /Waiting for prompt/)

  console.log(JSON.stringify({
    ok: true,
    summary: {
      regularBlocked: regularHtml.includes('is-blocked'),
      compactWarning: compactHtml.includes('is-warning'),
      compactFlag: compactHtml.includes('is-compact'),
    },
  }, null, 2))
} finally {
  await vite.close()
}
