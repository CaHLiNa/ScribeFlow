<template>
  <nav
    class="workbench-rail"
    :class="{ 'workbench-rail--mac': isMac && isTauriDesktop && !isNativeFullscreen }"
    :aria-label="t('Project navigation')"
    :style="railStyle"
    data-tauri-drag-region
  >
    <div class="workbench-rail-side workbench-rail-side-left">
      <UiButton
        class="workbench-rail-button"
        variant="ghost"
        size="icon-sm"
        :active="leftSidebarOpen"
        :title="t('Toggle sidebar ({shortcut})', { shortcut: `${modKey}+B` })"
        :aria-label="t('Toggle sidebar')"
        @click="$emit('toggle-left-sidebar')"
      >
        <component
          :is="leftSidebarOpen ? IconLayoutSidebarLeftCollapse : IconLayoutSidebar"
          :size="15"
          :stroke-width="1.7"
        />
      </UiButton>

      <UiButton
        v-if="leftSidebarOpen"
        class="workbench-rail-button"
        variant="ghost"
        size="icon-sm"
        :title="t('Collapse All Folders')"
        :aria-label="t('Collapse All Folders')"
        @click="$emit('collapse-left-folders')"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path
            d="M14 4.27c.6.35 1 .99 1 1.73v5c0 2.21-1.79 4-4 4H6c-.74 0-1.38-.4-1.73-1H11c1.65 0 3-1.35 3-3zM9.5 7a.5.5 0 0 1 0 1h-4a.5.5 0 0 1 0-1z"
          />
          <path
            fill-rule="evenodd"
            d="M11 2c1.103 0 2 .897 2 2v7c0 1.103-.897 2-2 2H4c-1.103 0-2-.897-2-2V4c0-1.103.897-2 2-2zM4 3c-.551 0-1 .449-1 1v7c0 .552.449 1 1 1h7c.551 0 1-.448 1-1V4c0-.551-.449-1-1-1z"
            clip-rule="evenodd"
          />
        </svg>
      </UiButton>

      <UiButton
        v-if="leftSidebarOpen"
        class="workbench-rail-button"
        variant="ghost"
        size="icon-sm"
        :title="t('New File or Folder')"
        :aria-label="t('New File or Folder')"
        @click="$emit('open-left-create-menu', $event)"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          aria-hidden="true"
        >
          <line x1="8" y1="3" x2="8" y2="13" />
          <line x1="3" y1="8" x2="13" y2="8" />
        </svg>
      </UiButton>
    </div>

    <div class="workbench-rail-center" data-tauri-drag-region="false">
      <div :id="tabsTargetId" class="workbench-rail-title-target"></div>
    </div>

    <div class="workbench-rail-side workbench-rail-side-right">
      <div class="workbench-rail-controls" data-tauri-drag-region="false">
        <UiButton
          class="workbench-rail-button"
          shell-class="workbench-rail-pane-button"
          variant="ghost"
          size="icon-sm"
          :active="splitPaneOpen"
          :title="t('Toggle split pane ({shortcut})', { shortcut: `${modKey}+J` })"
          :aria-label="t('Toggle split pane')"
          @click="$emit('toggle-split-pane')"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            aria-hidden="true"
          >
            <rect x="2.5" y="3" width="11" height="10" rx="1.75" />
            <path d="M8 3v10" />
          </svg>
        </UiButton>

        <UiButton
          v-if="inspectorAvailable"
          class="workbench-rail-button"
          shell-class="workbench-rail-pane-button"
          variant="ghost"
          size="icon-sm"
          :active="rightSidebarOpen"
          :title="t('Toggle right sidebar')"
          :aria-label="t('Toggle right sidebar')"
          @click="$emit('toggle-right-sidebar')"
        >
          <component
            :is="rightSidebarOpen ? IconLayoutSidebarRightCollapse : IconLayoutSidebarRight"
            :size="15"
            :stroke-width="1.7"
          />
        </UiButton>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  IconLayoutSidebar,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarRight,
  IconLayoutSidebarRightCollapse,
} from '@tabler/icons-vue'
import UiButton from '../shared/ui/UiButton.vue'
import { isMac, modKey } from '../../platform'
import { useI18n } from '../../i18n'

defineProps({
  tabsTargetId: { type: String, default: 'app-shell-topbar-tabs' },
  leftSidebarOpen: { type: Boolean, default: true },
  rightSidebarOpen: { type: Boolean, default: false },
  splitPaneOpen: { type: Boolean, default: false },
  inspectorAvailable: { type: Boolean, default: false },
})

defineEmits([
  'toggle-left-sidebar',
  'toggle-right-sidebar',
  'toggle-split-pane',
  'collapse-left-folders',
  'open-left-create-menu',
])

const { t } = useI18n()

const TOPBAR_HEIGHT = 42
const DEFAULT_SIDE_PADDING = 12
const MAC_TRAFFIC_LIGHT_SAFE_PADDING = 68
const FULLSCREEN_LEFT_PADDING = 12
const isTauriDesktop = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__

const isNativeFullscreen = ref(false)
let unlistenWindowResize = null

const railLeftPadding = computed(() => {
  if (!isMac || !isTauriDesktop) {
    return DEFAULT_SIDE_PADDING
  }

  return isNativeFullscreen.value ? FULLSCREEN_LEFT_PADDING : MAC_TRAFFIC_LIGHT_SAFE_PADDING
})

const railStyle = computed(() => ({
  minHeight: `${TOPBAR_HEIGHT}px`,
  paddingLeft: `${railLeftPadding.value}px`,
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
.workbench-rail {
  --top-chrome-control-size: 28px;
  --top-chrome-control-radius: 8px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0;
  flex: 0 0 auto;
  min-width: 0;
  margin: 0;
  padding-top: 2px;
  padding-bottom: 2px;
  border-bottom: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
  pointer-events: none;
}

.workbench-rail:hover .workbench-rail-button,
.workbench-rail:focus-within .workbench-rail-button {
  opacity: 1;
}

.workbench-rail--mac .workbench-rail-side {
  transform: translateY(-5px);
}

.workbench-rail-side {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 4px;
  position: relative;
  z-index: 2;
  pointer-events: auto;
}

.workbench-rail-center {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  width: min(520px, calc(100% - 220px));
  min-width: 0;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.workbench-rail--mac .workbench-rail-center {
  transform: translate(-50%, calc(-50% - 5px));
}

.workbench-rail-title-target {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: 0;
  pointer-events: auto;
}

.workbench-rail-side-left {
  justify-content: flex-start;
}

.workbench-rail-side-right {
  justify-content: flex-end;
  gap: 4px;
}

.workbench-rail-controls {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  flex: 0 0 auto;
  min-height: var(--top-chrome-control-size);
  pointer-events: auto;
}

.workbench-rail-button {
  position: relative;
  width: var(--top-chrome-control-size);
  height: var(--top-chrome-control-size);
  min-height: var(--top-chrome-control-size);
  padding: 0;
  border-radius: var(--top-chrome-control-radius);
  color: var(--text-secondary);
  opacity: 1;
  background: transparent;
  box-shadow: none;
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease,
    box-shadow 140ms ease;
}

.workbench-rail-button:hover:not(:disabled) {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--chrome-surface) 24%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border) 12%, transparent);
}

.workbench-rail-button:focus-visible {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--chrome-surface) 28%, transparent);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--border) 14%, transparent),
    0 0 0 2px var(--focus-ring);
}

.workbench-rail-button.is-active {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--chrome-surface) 42%, transparent);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--border) 18%, transparent),
    0 1px 0 color-mix(in srgb, white 20%, transparent);
}

:deep(.workbench-rail-pane-button) {
  color: var(--text-secondary);
}

@media (max-width: 920px) {
  .workbench-rail-center {
    width: min(420px, calc(100% - 180px));
  }

  .workbench-rail {
    gap: 8px;
  }
}

@media (max-width: 720px) {
  .workbench-rail-center {
    width: min(320px, calc(100% - 148px));
  }

  .workbench-rail {
    min-height: 42px;
  }
}
</style>
