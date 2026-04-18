import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'url'

const host = process.env.TAURI_DEV_HOST
const mainEntryHtml = fileURLToPath(new URL('./index.html', import.meta.url))

const chunkGroups = [
  ['vendor-tauri', [
    '/node_modules/@tauri-apps/api/',
    '/node_modules/@tauri-apps/plugin-',
  ]],
  ['vendor-vue', [
    '/node_modules/vue/',
    '/node_modules/pinia/',
    '/node_modules/@vue/',
    '/node_modules/@tabler/icons-vue/',
  ]],
  ['vendor-highlight', [
    '/node_modules/rehype-highlight/',
    '/node_modules/highlight.js/',
  ]],
  ['vendor-markdown-pipeline', [
    '/node_modules/unified/',
    '/node_modules/remark-',
    '/node_modules/rehype-',
    '/node_modules/unist-util-',
    '/node_modules/mdast-util-',
    '/node_modules/micromark',
    '/node_modules/hast-util-',
    '/node_modules/vfile/',
    '/node_modules/trough/',
    '/node_modules/bail/',
    '/node_modules/devlop/',
    '/node_modules/property-information/',
    '/node_modules/space-separated-tokens/',
    '/node_modules/comma-separated-tokens/',
    '/node_modules/web-namespaces/',
    '/node_modules/zwitch/',
  ]],
  ['vendor-katex', [
    '/node_modules/katex/',
  ]],
  ['vendor-markdown', [
    '/node_modules/dompurify/',
  ]],
  ['vendor-codemirror-language-data', [
    '/node_modules/@codemirror/language-data/',
  ]],
  ['vendor-codemirror-markdown', [
    '/node_modules/@codemirror/lang-markdown/',
    '/node_modules/@lezer/markdown/',
  ]],
  ['vendor-codemirror-language-core', [
    '/node_modules/@codemirror/language/',
    '/node_modules/@lezer/common/',
    '/node_modules/@lezer/highlight/',
    '/node_modules/@lezer/lr/',
  ]],
  ['vendor-codemirror-editing', [
    '/node_modules/@codemirror/autocomplete/',
    '/node_modules/@codemirror/commands/',
    '/node_modules/@codemirror/lint/',
    '/node_modules/@codemirror/merge/',
    '/node_modules/@codemirror/search/',
  ]],
  ['vendor-codemirror-web-languages', [
    '/node_modules/@codemirror/lang-angular/',
    '/node_modules/@codemirror/lang-css/',
    '/node_modules/@codemirror/lang-html/',
    '/node_modules/@codemirror/lang-jinja/',
    '/node_modules/@codemirror/lang-javascript/',
    '/node_modules/@codemirror/lang-json/',
    '/node_modules/@codemirror/lang-less/',
    '/node_modules/@codemirror/lang-liquid/',
    '/node_modules/@codemirror/lang-sass/',
    '/node_modules/@codemirror/lang-vue/',
    '/node_modules/@codemirror/lang-xml/',
    '/node_modules/@codemirror/lang-yaml/',
    '/node_modules/@lezer/css/',
    '/node_modules/@lezer/html/',
    '/node_modules/@lezer/javascript/',
    '/node_modules/@lezer/json/',
    '/node_modules/@lezer/sass/',
    '/node_modules/@lezer/xml/',
    '/node_modules/@lezer/yaml/',
  ]],
  ['vendor-codemirror-code-languages', [
    '/node_modules/@codemirror/lang-cpp/',
    '/node_modules/@codemirror/lang-go/',
    '/node_modules/@codemirror/lang-java/',
    '/node_modules/@codemirror/lang-php/',
    '/node_modules/@codemirror/lang-python/',
    '/node_modules/@codemirror/lang-rust/',
    '/node_modules/@codemirror/lang-sql/',
    '/node_modules/@codemirror/lang-wast/',
    '/node_modules/@lezer/cpp/',
    '/node_modules/@lezer/go/',
    '/node_modules/@lezer/java/',
    '/node_modules/@lezer/php/',
    '/node_modules/@lezer/python/',
    '/node_modules/@lezer/rust/',
  ]],
  ['vendor-codemirror-legacy-modes', [
    '/node_modules/@codemirror/legacy-modes/',
  ]],
  ['vendor-codemirror-core', [
    '/node_modules/@codemirror/state/',
    '/node_modules/@codemirror/view/',
    '/node_modules/@codemirror/',
    '/node_modules/codemirror/',
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
  build: {
    modulePreload: {
      polyfill: false,
      resolveDependencies: () => [],
    },
    rollupOptions: {
      input: {
        main: mainEntryHtml,
      },
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
