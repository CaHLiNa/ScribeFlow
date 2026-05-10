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
  const statusModule = await vite.ssrLoadModule('/src/components/extensions/ExtensionStatusPill.vue')
  const summaryModule = await vite.ssrLoadModule('/src/components/extensions/ExtensionSummaryCard.vue')
  const ExtensionStatusPill = statusModule.default
  const ExtensionSummaryCard = summaryModule.default

  const app = createSSRApp({
    render() {
      return h('div', { class: 'probe-root' }, [
        h(ExtensionStatusPill, {
          label: 'Streaming',
          title: 'Streaming summary',
          toneClass: 'is-warning',
        }),
        h(ExtensionSummaryCard, {
          title: 'Tasks',
          value: '3 running',
          toneClass: 'is-success',
        }),
      ])
    },
  })

  const html = await renderToString(app)

  assert.match(html, /extension-status-pill/)
  assert.match(html, /Streaming/)
  assert.match(html, /is-warning/)
  assert.match(html, /Streaming summary/)
  assert.match(html, /extension-summary-card/)
  assert.match(html, /Tasks/)
  assert.match(html, /3 running/)
  assert.match(html, /is-success/)

  console.log(JSON.stringify({
    ok: true,
    summary: {
      statusWarningTone: html.includes('extension-status-pill is-warning'),
      statusLabel: html.includes('Streaming'),
      summarySuccessTone: html.includes('extension-summary-card is-success'),
      summaryValue: html.includes('3 running'),
    },
  }, null, 2))
} finally {
  await vite.close()
}
