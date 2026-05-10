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
  const module = await vite.ssrLoadModule('/src/components/extensions/ExtensionCountBadge.vue')
  const ExtensionCountBadge = module.default

  const app = createSSRApp({
    render() {
      return h(ExtensionCountBadge, {
        value: 3,
        title: 'Three quick actions are available.',
      })
    },
  })

  const html = await renderToString(app)

  assert.match(html, /extension-count-badge/)
  assert.match(html, />3</)
  assert.match(html, /Three quick actions are available\./)

  console.log(JSON.stringify({
    ok: true,
    summary: {
      hasBadgeClass: html.includes('extension-count-badge'),
      hasValue: html.includes('>3<'),
      hasTitle: html.includes('Three quick actions are available.'),
    },
  }, null, 2))
} finally {
  await vite.close()
}
