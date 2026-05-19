import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  resolve: {
    alias: {
      crypto: fileURLToPath(new URL('./src/shims/nodeCrypto.js', import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 750,
  },
  server: {
    host: '0.0.0.0',
    port: 1420,
    strictPort: true,
  },
})
