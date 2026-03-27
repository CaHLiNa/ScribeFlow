import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'

const host = process.env.TAURI_DEV_HOST
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
const extendShimPath = fileURLToPath(new URL('./src/shims/extend.js', import.meta.url))

const chunkGroups = [
  ['vendor-vue', [
    '/node_modules/vue/',
    '/node_modules/pinia/',
    '/node_modules/@vue/',
    '/node_modules/@tabler/icons-vue/',
  ]],
  ['vendor-ai', [
    '/node_modules/ai/',
    '/node_modules/@ai-sdk/',
    '/node_modules/zod/',
  ]],
  ['vendor-markdown', [
    '/node_modules/marked/',
    '/node_modules/marked-',
    '/node_modules/katex/',
    '/node_modules/dompurify/',
  ]],
  ['vendor-codemirror', [
    '/node_modules/@codemirror/language-data/',
    '/node_modules/@codemirror/',
    '/node_modules/codemirror/',
    '/node_modules/@lezer/',
  ]],
  ['vendor-superdoc', [
    '/node_modules/superdoc/',
    '/node_modules/@superdoc-dev/',
    '/node_modules/yjs/',
    '/node_modules/@hocuspocus/',
  ]],
  ['vendor-prosemirror', [
    '/node_modules/prosemirror-',
    '/node_modules/@tiptap/',
    '/node_modules/y-prosemirror/',
  ]],
  ['vendor-pdf-viewer', [
    '/node_modules/pdfjs-dist/legacy/web/',
    '/node_modules/pdfjs-dist/web/',
  ]],
  ['vendor-pdf', [
    '/node_modules/pdfjs-dist/legacy/build/',
    ]],
  ['vendor-pdf-worker', [
    '/node_modules/pdfjs-dist/build/',
    '/node_modules/pdfjs-dist/',
  ]],
  ['vendor-highlight', [
    '/node_modules/highlight.js/',
  ]],
  ['vendor-citations', [
    '/node_modules/citeproc/',
  ]],
  ['vendor-xterm', [
    '/node_modules/@xterm/',
  ]],
  ['vendor-handsontable', [
    '/node_modules/handsontable/',
  ]],
  ['vendor-spreadsheet', [
    '/node_modules/papaparse/',
  ]],
]

function getManualChunk(id) {
  if (!id.includes('/node_modules/')) return undefined
  for (const [chunkName, matchers] of chunkGroups) {
    if (matchers.some((matcher) => id.includes(matcher))) return chunkName
  }
  return undefined
}

export default defineConfig(async () => ({
  plugins: [vue()],
  resolve: {
    alias: {
      extend: extendShimPath,
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    modulePreload: {
      polyfill: false,
      resolveDependencies: () => [],
    },
    rollupOptions: {
      output: {
        manualChunks: getManualChunk,
      },
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: 'ws', host, port: 1421 }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
}))
