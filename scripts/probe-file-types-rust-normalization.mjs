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

    if (cmd === 'file_types_classify') {
      return {
        viewerType: 'pdf',
        isMarkdown: false,
        isLatex: false,
        isLatexEditorFile: false,
        isBibFile: false,
        isImage: false,
        isHtml: false,
        isMultimodalImage: false,
        isPdf: true,
        isBinary: true,
        isNewTab: false,
        isDraftPath: false,
        isPreviewPath: false,
        isRunnable: false,
        previewSourcePath: '',
        mimeType: 'application/pdf',
        iconName: 'IconFileTypePdf',
        language: null,
        extension: 'pdf',
      }
    }
    if (cmd === 'file_types_get_viewer_type') return 'pdf'
    if (cmd === 'file_types_get_icon_name') return 'IconFileTypePdf'
    if (cmd === 'file_types_get_mime_type') return 'application/pdf'
    if (cmd === 'path_utils_relative_between') return '../paper.pdf'

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    classify,
    getFileIconName,
    getMimeType,
    getViewerType,
    isPdf,
    relativePath,
  } = await vite.ssrLoadModule('/src/services/fileTypes.js')

  await classify(42)
  await getViewerType(' /tmp/workspace/Paper.PDF ')
  await getFileIconName(false)
  await getMimeType(null)
  assert.equal(await isPdf(' /tmp/workspace/Paper.PDF '), true)
  await relativePath(' /tmp/workspace/main.tex ', ' /tmp/workspace/paper.pdf ')

  assert.deepEqual(calls.map((call) => call.cmd), [
    'file_types_classify',
    'file_types_get_viewer_type',
    'file_types_get_icon_name',
    'file_types_get_mime_type',
    'file_types_classify',
    'path_utils_relative_between',
  ])
  assert.deepEqual(calls[0].args.params, { path: 42 })
  assert.deepEqual(calls[1].args.params, { path: ' /tmp/workspace/Paper.PDF ' })
  assert.deepEqual(calls[2].args.params, { fileName: false })
  assert.deepEqual(calls[3].args.params, { path: null })
  assert.deepEqual(calls[4].args.params, { path: ' /tmp/workspace/Paper.PDF ' })
  assert.deepEqual(calls[5].args.params, {
    fromFile: ' /tmp/workspace/main.tex ',
    toFile: ' /tmp/workspace/paper.pdf ',
  })

  console.log('file types rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
