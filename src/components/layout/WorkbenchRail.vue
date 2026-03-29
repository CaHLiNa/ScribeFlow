<template>
  <nav
    class="workbench-rail"
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
          :size="17"
          :stroke-width="1.7"
        />
      </UiButton>
    </div>

    <div class="workbench-rail-main" data-tauri-drag-region>
      <div :id="tabsTargetId" class="workbench-rail-tabs" data-tauri-drag-region></div>
    </div>

    <div class="workbench-rail-side workbench-rail-side-right">
      <div :id="workflowTargetId" class="workbench-rail-workflow"></div>
      <div class="workbench-rail-divider" data-tauri-drag-region></div>
      <div class="workbench-rail-controls">
        <UiButton
          class="workbench-rail-button"
          variant="ghost"
          size="icon-sm"
          :title="t('Quick open ({shortcut})', { shortcut: `${modKey}+P` })"
          :aria-label="t('Quick open')"
          @click="$emit('open-search')"
        >
          <IconSearch :size="17" :stroke-width="1.7" />
        </UiButton>

        <UiButton
          class="workbench-rail-button"
          variant="ghost"
          size="icon-sm"
          :title="t('Settings ({shortcut})', { shortcut: `${modKey}+,` })"
          :aria-label="t('Settings')"
          @click="$emit('open-settings')"
        >
          <IconSettings :size="17" :stroke-width="1.7" />
        </UiButton>

        <UiButton
          v-if="inspectorAvailable"
          class="workbench-rail-button"
          variant="ghost"
          size="icon-sm"
          :active="rightSidebarOpen"
          :title="t('Toggle right sidebar')"
          :aria-label="t('Toggle right sidebar')"
          @click="$emit('toggle-right-sidebar')"
        >
          <component
            :is="rightSidebarOpen ? IconLayoutSidebarRightCollapse : IconLayoutSidebarRight"
            :size="17"
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
  IconSearch,
  IconSettings,
} from '@tabler/icons-vue'
import UiButton from '../shared/ui/UiButton.vue'
import { isMac, modKey } from '../../platform'
import { useI18n } from '../../i18n'

defineProps({
  tabsTargetId: { type: String, default: 'app-shell-topbar-tabs' },
  workflowTargetId: { type: String, default: 'app-shell-topbar-workflow' },
  leftSidebarOpen: { type: Boolean, default: true },
  rightSidebarOpen: { type: Boolean, default: false },
  inspectorAvailable: { type: Boolean, default: false },
})

defineEmits(['open-settings', 'open-search', 'toggle-left-sidebar', 'toggle-right-sidebar'])

const { t } = useI18n()

const TOPBAR_HEIGHT = 46
const DEFAULT_SIDE_PADDING = 14
const MAC_TRAFFIC_LIGHT_SAFE_PADDING = 78
const FULLSCREEN_LEFT_PADDING = 14
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex: 0 0 auto;
  min-width: 0;
  background: transparent;
}

.workbench-rail:hover .workbench-rail-button,
.workbench-rail:focus-within .workbench-rail-button {
  opacity: 0.74;
}

.workbench-rail-side {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 2px;
}

.workbench-rail-side-left {
  justify-content: flex-start;
}

.workbench-rail-side-right {
  justify-content: flex-end;
  gap: 10px;
}

.workbench-rail-controls {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
}

.workbench-rail-main {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 34px;
}

.workbench-rail-tabs {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 34px;
}

.workbench-rail-workflow {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 0 auto;
  min-width: 0;
  min-height: 34px;
  max-width: min(40vw, 420px);
  overflow: hidden;
}

.workbench-rail-workflow:empty {
  display: none;
}

.workbench-rail-divider {
  width: 1px;
  height: 18px;
  background: color-mix(in srgb, var(--border-subtle) 84%, transparent);
  opacity: 0.72;
}

.workbench-rail-workflow:empty + .workbench-rail-divider {
  display: none;
}

.workbench-rail-button {
  position: relative;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  color: var(--text-muted);
  opacity: 0.4;
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease,
    opacity 140ms ease;
}

.workbench-rail-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--surface-hover) 68%, transparent);
  color: var(--text-primary);
  opacity: 1;
}

.workbench-rail-button.is-active {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--surface-hover) 58%, transparent);
  opacity: 0.92;
}

@media (max-width: 920px) {
  .workbench-rail {
    gap: 8px;
  }
}

@media (max-width: 720px) {
  .workbench-rail {
    min-height: 42px;
  }
}
</style>
