import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return null

          if (id.includes('/@embedpdf/engines/')) return 'vendor-pdf-engines'
          if (id.includes('/@embedpdf/')) return 'vendor-pdf'
          if (id.includes('/@codemirror/')) return 'vendor-codemirror'
          if (id.includes('/katex/')) return 'vendor-katex'
          if (
            id.includes('/remark-') ||
            id.includes('/rehype-') ||
            id.includes('/unified/') ||
            id.includes('/unist-util-visit/')
          ) {
            return 'vendor-markdown'
          }
          if (
            id.includes('/vscode-oniguruma/') ||
            id.includes('/vscode-textmate/') ||
            id.includes('/@lezer/')
          ) {
            return 'vendor-textmate'
          }
          if (id.includes('/@tabler/icons-vue/')) return 'vendor-icons'

          return null
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 1420,
    strictPort: true,
  },
})
