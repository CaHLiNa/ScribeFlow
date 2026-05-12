import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { createLogger, createServer } from 'vite'

if (!globalThis.window) {
  globalThis.window = globalThis
}

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto
}

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

let clearTauriMocks = () => {}

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  mockWindows('main')

  const calls = []

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'path_utils_normalize') return '/tmp/workspace/note.md'
    if (cmd === 'path_utils_basename') return 'note.md'
    if (cmd === 'path_utils_dirname') return '/tmp/workspace'
    if (cmd === 'path_utils_resolve_relative') return '/tmp/paper.tex'
    if (cmd === 'path_utils_strip_extension') return 'note'
    if (cmd === 'path_utils_join') return '/tmp/workspace/note.md'
    if (cmd === 'path_utils_relative_between') return '../paper.tex'

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    basenamePath,
    dirnamePath,
    joinPath,
    normalizeFsPath,
    relativePathBetween,
    resolveRelativePath,
    stripExtension,
  } = await vite.ssrLoadModule('/src/services/pathUtils.js')
  const { relativePath } = await vite.ssrLoadModule('/src/services/fileTypes.js')

  await normalizeFsPath(42)
  await basenamePath(' /tmp/workspace/note.md ')
  await dirnamePath(false)
  await resolveRelativePath(' /tmp/workspace ', ' ../paper.tex ')
  await stripExtension(null)
  await joinPath(' /tmp ', 42, ' workspace ', false, 'note.md')
  await relativePathBetween(' /tmp/workspace/main.tex ', null)
  await relativePath(' /tmp/workspace/main.tex ', ' /tmp/paper.tex ')

  assert.deepEqual(calls.map((call) => call.cmd), [
    'path_utils_normalize',
    'path_utils_basename',
    'path_utils_dirname',
    'path_utils_resolve_relative',
    'path_utils_strip_extension',
    'path_utils_join',
    'path_utils_relative_between',
    'path_utils_relative_between',
  ])
  assert.deepEqual(calls[0].args.params, { value: 42 })
  assert.deepEqual(calls[1].args.params, { filePath: ' /tmp/workspace/note.md ' })
  assert.deepEqual(calls[2].args.params, { filePath: false })
  assert.deepEqual(calls[3].args.params, {
    baseDir: ' /tmp/workspace ',
    target: ' ../paper.tex ',
  })
  assert.deepEqual(calls[4].args.params, { filePath: null })
  assert.deepEqual(calls[5].args.params, {
    segments: [' /tmp ', 42, ' workspace ', false, 'note.md'],
  })
  assert.deepEqual(calls[6].args.params, {
    fromFile: ' /tmp/workspace/main.tex ',
    toFile: null,
  })
  assert.deepEqual(calls[7].args.params, {
    fromFile: ' /tmp/workspace/main.tex ',
    toFile: ' /tmp/paper.tex ',
  })

  console.log('path utils rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
