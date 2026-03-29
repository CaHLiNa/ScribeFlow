<template>
  <header class="launcher-header" data-tauri-drag-region :style="headerStyle">
    <div class="launcher-header-brand" data-tauri-drag-region>
      <span class="launcher-header-title">Altals</span>
      <span class="launcher-header-caption">{{ t('Document workspace') }}</span>
    </div>
  </header>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isMac } from '../../platform'
import { useI18n } from '../../i18n'

const { t } = useI18n()

const HEADER_HEIGHT = 42
const DEFAULT_SIDE_PADDING = 16
const MAC_TRAFFIC_LIGHT_SAFE_PADDING = 74
const FULLSCREEN_LEFT_PADDING = 16
const isTauriDesktop = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__

const isNativeFullscreen = ref(false)
let unlistenWindowResize = null

const headerLeftPadding = computed(() => {
  if (!isMac || !isTauriDesktop) {
    return DEFAULT_SIDE_PADDING
  }

  return isNativeFullscreen.value ? FULLSCREEN_LEFT_PADDING : MAC_TRAFFIC_LIGHT_SAFE_PADDING
})

const headerStyle = computed(() => ({
  height: `${HEADER_HEIGHT}px`,
  paddingLeft: `${headerLeftPadding.value}px`,
  paddingRight: `${DEFAULT_SIDE_PADDING}px`,
}))

async function syncNativeWindowChromeState() {
  if (!isTauriDesktop) return
  try {
    isNativeFullscreen.value = await getCurrentWindow().isFullscreen()
  } catch {
    isNativeFullscreen.value = false
  }
}

onMounted(async () => {
  if (!isTauriDesktop) return
  await syncNativeWindowChromeState()
  try {
    unlistenWindowResize = await getCurrentWindow().onResized(() => {
      syncNativeWindowChromeState()
    })
  } catch {
    unlistenWindowResize = null
  }
})

onUnmounted(() => {
  unlistenWindowResize?.()
  unlistenWindowResize = null
})
</script>

<style scoped>
.launcher-header {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  background: transparent;
}

.launcher-header-brand {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  color: var(--text-secondary);
}

.launcher-header-title {
  font-family: 'Crimson Text', 'Lora', Georgia, serif;
  font-size: var(--ui-font-body);
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--text-primary);
}

.launcher-header-caption {
  font-size: var(--ui-font-micro);
  color: var(--text-muted);
  opacity: 0.78;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .launcher-header-caption {
    display: none;
  }
}
</style>
