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
  const componentModule = await vite.ssrLoadModule('/src/components/extensions/ExtensionBlockedActionButton.vue')
  const ExtensionBlockedActionButton = componentModule.default

  const uiApp = createSSRApp({
    render() {
      return h(ExtensionBlockedActionButton, {
        blocked: true,
        blockedLabel: 'Blocked',
        blockedMessage: 'Blocked by another-extension',
        label: 'Run',
        title: 'Run',
      })
    },
  })

  const buttonApp = createSSRApp({
    render() {
      return h(ExtensionBlockedActionButton, {
        as: 'button',
        extraClass: ['probe-button', 'is-blocked'],
        blocked: true,
        blockedLabel: 'Blocked',
        blockedMessage: 'Blocked by another-extension',
        label: 'Run',
        title: 'Run',
      })
    },
  })

  const uiHtml = await renderToString(uiApp)
  const buttonHtml = await renderToString(buttonApp)

  assert.match(uiHtml, /Blocked/)
  assert.match(uiHtml, /Blocked by another-extension/)
  assert.match(buttonHtml, /probe-button/)
  assert.match(buttonHtml, /is-blocked/)
  assert.match(buttonHtml, /Blocked/)
  assert.match(buttonHtml, /Blocked by another-extension/)

  console.log(JSON.stringify({
    ok: true,
    summary: {
      uiHasBlockedLabel: uiHtml.includes('Blocked'),
      uiHasBlockedTitle: uiHtml.includes('Blocked by another-extension'),
      buttonHasExtraClass: buttonHtml.includes('probe-button'),
      buttonHasBlockedClass: buttonHtml.includes('is-blocked'),
    },
  }, null, 2))
} finally {
  await vite.close()
}
