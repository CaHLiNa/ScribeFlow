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
        if (rendered.includes('WebSocket server error:')) {
          return
        }
        console.error(message, ...rest)
      },
    },
  }),
})

try {
  const state = await vite.ssrLoadModule('/src/domains/extensions/extensionWindowPromptState.ts')
  const {
    seedQuickPickSelection,
    toggleQuickPickSelection,
    isQuickPickItemSelected,
    resolveQuickPickSubmission,
  } = state

  const items = [
    { id: 'alpha', label: 'Alpha', value: { id: 'alpha' }, picked: true },
    { id: 'beta', label: 'Beta', value: { id: 'beta' }, picked: false },
    { id: 'gamma', label: 'Gamma', value: { id: 'gamma' }, picked: true },
  ]

  const seeded = seedQuickPickSelection(items)
  assert.deepEqual(seeded, ['alpha', 'gamma'])
  assert.equal(isQuickPickItemSelected(seeded, 'alpha'), true)
  assert.equal(isQuickPickItemSelected(seeded, 'beta'), false)

  const toggledOn = toggleQuickPickSelection(seeded, 'beta')
  assert.deepEqual(toggledOn, ['alpha', 'gamma', 'beta'])

  const toggledOff = toggleQuickPickSelection(toggledOn, 'gamma')
  assert.deepEqual(toggledOff, ['alpha', 'beta'])

  const multiSelectResult = resolveQuickPickSubmission({
    requestItems: items,
    filteredItems: items,
    activeIndex: 0,
    selectedItemIds: toggledOff,
    canPickMany: true,
  })
  assert.deepEqual(multiSelectResult, [{ id: 'alpha' }, { id: 'beta' }])

  const singleSelectResult = resolveQuickPickSubmission({
    requestItems: items,
    filteredItems: items,
    activeIndex: 1,
    selectedItemIds: [],
    canPickMany: false,
  })
  assert.deepEqual(singleSelectResult, { id: 'beta' })

  console.log(JSON.stringify({
    ok: true,
    seeded,
    toggledOff,
    multiSelectCount: multiSelectResult.length,
    singleSelectId: singleSelectResult.id,
  }, null, 2))
} finally {
  await vite.close()
}
