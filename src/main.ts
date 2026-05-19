import './utils/runtimePolyfills'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'
import 'katex/dist/katex.min.css'

import { initLocale } from './i18n'
import { detectTauriDesktopRuntime, isMac } from './platform'

function applyRuntimeChromeClasses() {
  if (!isMac) return

  const root = document.documentElement
  root.classList.add('is-macos')

  const markTauriMacos = () => {
    if (detectTauriDesktopRuntime()) {
      root.classList.add('is-tauri-macos')
    }
  }

  markTauriMacos()
  window.requestAnimationFrame(markTauriMacos)
}

async function bootstrap() {
  applyRuntimeChromeClasses()

  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)
  app.mount('#app')

  void initLocale().catch((error) => {
    console.error('Failed to initialize locale', error)
  })
}

void bootstrap()
