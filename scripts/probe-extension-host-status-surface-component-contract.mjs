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
  const componentModule = await vite.ssrLoadModule('/src/components/extensions/ExtensionHostStatusSurface.vue')
  const ExtensionHostStatusSurface = componentModule.default

  const app = createSSRApp({
    render() {
      return h(ExtensionHostStatusSurface, {
        title: 'Extension host is waiting for prompt input',
        badge: 'Blocked',
        description: 'A pending prompt from another-extension in /tmp/workspace-b is blocking new top-level host requests until it is completed or cancelled.',
        toneClass: 'is-warning',
        compact: true,
        recoveryAction: {
          available: true,
          busy: false,
          label: 'Cancel Prompt',
          title: 'Cancel the blocking prompt from another-extension in /tmp/workspace-b.',
        },
      }, {
        'actions-before': () => h('span', { class: 'probe-prefix' }, 'prefix'),
        meta: () => h('div', { class: 'probe-meta' }, 'meta row'),
        default: () => h('div', { class: 'probe-body' }, 'body row'),
      })
    },
  })

  const html = await renderToString(app)

  assert.match(html, /extension-host-status-surface/)
  assert.match(html, /is-warning/)
  assert.match(html, /is-compact/)
  assert.match(html, /Extension host is waiting for prompt input/)
  assert.match(html, /Blocked/)
  assert.match(html, /Cancel Prompt/)
  assert.match(html, /probe-prefix/)
  assert.match(html, /probe-meta/)
  assert.match(html, /probe-body/)

  console.log(JSON.stringify({
    ok: true,
    summary: {
      hasCompactClass: html.includes('is-compact'),
      hasWarningClass: html.includes('is-warning'),
      hasRecoveryLabel: html.includes('Cancel Prompt'),
      hasMetaSlot: html.includes('probe-meta'),
      hasBodySlot: html.includes('probe-body'),
    },
  }, null, 2))
} finally {
  await vite.close()
}
