<!-- START OF FILE src/components/layout/WorkbenchRail.vue -->
<template>
  <nav
    class="workbench-rail"
    data-surface-context-guard="true"
    :class="{ 'workbench-rail--mac': isMac && isTauriDesktop }"
    :aria-label="t('Project navigation')"
    :style="railStyle"
    @contextmenu.prevent
  >
    <div class="workbench-rail__drag-region" @mousedown="handleWindowDragStart"></div>

    <div class="workbench-rail-side workbench-rail-side-left">
      <UiButton
        v-if="leftSidebarAvailable"
        class="workbench-rail-button"
        variant="ghost"
        size="icon-sm"
        :active="leftSidebarOpen"
        :title="t('Toggle sidebar ({shortcut})', { shortcut: `${modKey}+B` })"
        :aria-label="t('Toggle sidebar')"
        data-window-drag-ignore="true"
        @click="$emit('toggle-left-sidebar')"
      >
        <component
          :is="leftSidebarOpen ? IconLayoutSidebarLeftCollapse : IconLayoutSidebar"
          :size="16"
          :stroke-width="1.75"
        />
      </UiButton>

      <div
        v-if="workbenchModeItems.length"
        class="workbench-mode-switcher"
        role="tablist"
        :aria-label="t('Workbench mode')"
        data-window-drag-ignore="true"
      >
        <button
          v-for="item in workbenchModeItems"
          :key="item.id"
          type="button"
          class="workbench-mode-tab"
          :class="{ 'is-active': item.active }"
          :title="item.label"
          :aria-label="item.label"
          :aria-selected="item.active ? 'true' : 'false'"
          role="tab"
          @click="selectWorkbenchMode(item.id)"
        >
          <component
            :is="modeIconFor(item.id)"
            :size="15"
            :stroke-width="1.75"
            aria-hidden="true"
          />
          <span class="workbench-mode-tab__label">{{ item.label }}</span>
        </button>
      </div>
    </div>

    <WorkbenchRailTitleArea
      :document-title-target-id="documentTitleTargetId"
      :rail-title-state="railTitleState"
    />

    <div class="workbench-rail-side workbench-rail-side-right">
      <div class="workbench-rail-controls" data-window-drag-ignore="true">
        <UiButton
          v-if="contextDockAvailable"
          class="workbench-rail-button"
          variant="ghost"
          size="icon-sm"
          :active="contextDockOpen"
          :title="contextDockLabel || t('Toggle context dock')"
          :aria-label="contextDockLabel || t('Toggle context dock')"
          data-window-drag-ignore="true"
          @click="$emit('toggle-context-dock')"
        >
          <component
            :is="contextDockOpen ? IconLayoutSidebarRightCollapse : IconLayoutSidebarRight"
            :size="16"
            :stroke-width="1.75"
          />
        </UiButton>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  IconBook2,
  IconFileText,
  IconLayoutSidebar,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarRight,
  IconLayoutSidebarRightCollapse,
  IconSettings,
} from '@tabler/icons-vue'
import UiButton from '../shared/ui/UiButton.vue'
import WorkbenchRailTitleArea from './WorkbenchRailTitleArea.vue'
import { isMac, isTauriDesktopRuntime, modKey } from '../../platform'
import { useI18n } from '../../i18n'
import {
  isNativeWindowFullscreen,
  onNativeWindowResized,
  startNativeWindowDrag,
} from '../../services/nativeWindow.ts'
import { syncMacosWindowTransparency } from '../../services/macosWindowTransparency.ts'
import {
  buildWorkbenchRailModeItems,
  buildWorkbenchRailTitleState,
  resolveWorkbenchRailStyle,
} from '../../domains/workbench/workbenchRailPresentation.ts'
import {
  WORKBENCH_MODE_DOCUMENTS,
  WORKBENCH_MODE_REFERENCES,
  WORKBENCH_MODE_SETTINGS,
} from '../../domains/workbench/workbenchShellPresentation.ts'

const props = defineProps({
  tabsTargetId: { type: String, default: 'app-shell-topbar-tabs' },
  documentTitleTargetId: { type: String, default: 'app-shell-topbar-document-title' },
  contextDockAvailable: { type: Boolean, default: true },
  contextDockLabel: { type: String, default: '' },
  contextDockOpen: { type: Boolean, default: false },
  currentDocumentLabel: { type: String, default: '' },
  preferExternalDocumentTitle: { type: Boolean, default: false },
  showDocumentTitleTarget: { type: Boolean, default: true },
  leftSidebarAvailable: { type: Boolean, default: true },
  leftSidebarOpen: { type: Boolean, default: true },
  workbenchMode: { type: String, default: WORKBENCH_MODE_DOCUMENTS },
})

const emit = defineEmits([
  'toggle-left-sidebar',
  'select-workbench-mode',
  'toggle-context-dock',
])

const { t } = useI18n()
const isTauriDesktop = isTauriDesktopRuntime
const WINDOW_DRAGGING_CLASS = 'window-dragging'

const isNativeFullscreen = ref(false)
let unlistenWindowResize = null
let removeDragGuards = null
const modeIconRegistry = {
  [WORKBENCH_MODE_DOCUMENTS]: IconFileText,
  [WORKBENCH_MODE_REFERENCES]: IconBook2,
  [WORKBENCH_MODE_SETTINGS]: IconSettings,
}

const railStyle = computed(() =>
  resolveWorkbenchRailStyle({
    isMac,
    isTauriDesktop,
    isNativeFullscreen: isNativeFullscreen.value,
  })
)
const workbenchModeItems = computed(() =>
  buildWorkbenchRailModeItems({
    activeMode: props.workbenchMode,
    t,
  })
)
const railTitleState = computed(() =>
  buildWorkbenchRailTitleState({
    currentDocumentLabel: props.currentDocumentLabel,
    preferExternalDocumentTitle: props.preferExternalDocumentTitle,
    showDocumentTitleTarget: props.showDocumentTitleTarget,
    workbenchMode: props.workbenchMode,
  })
)

async function syncNativeWindowChromeState() {
  if (!isTauriDesktop) return
  const wasFullscreen = isNativeFullscreen.value
  let nextFullscreen = false
  try {
    nextFullscreen = await isNativeWindowFullscreen()
  } catch {
    nextFullscreen = false
  }
  isNativeFullscreen.value = nextFullscreen
}

async function handleWindowDragStart(event) {
  if (!isTauriDesktop || event.button !== 0) return
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('[data-window-drag-ignore="true"]')) return
  event.preventDefault()
  beginWindowDragGuard()
  try {
    await startNativeWindowDrag()
  } catch {
    // Ignore drag-start failures from unsupported environments.
  } finally {
    endWindowDragGuard()
  }
}

function beginWindowDragGuard() {
  endWindowDragGuard()
  document.body.classList.add(WINDOW_DRAGGING_CLASS)

  const cleanup = () => {
    endWindowDragGuard()
  }

  window.addEventListener('mouseup', cleanup, { once: true })
  window.addEventListener('blur', cleanup, { once: true })
  removeDragGuards = () => {
    window.removeEventListener('mouseup', cleanup)
    window.removeEventListener('blur', cleanup)
  }
}

function endWindowDragGuard() {
  document.body.classList.remove(WINDOW_DRAGGING_CLASS)
  removeDragGuards?.()
  removeDragGuards = null
}

function modeIconFor(mode) {
  return modeIconRegistry[mode] || IconFileText
}

function selectWorkbenchMode(mode) {
  emit('select-workbench-mode', mode)
}

onMounted(async () => {
  if (!isTauriDesktop) return
  await syncNativeWindowChromeState()
  try {
    unlistenWindowResize = await onNativeWindowResized(() => {
      if (isMac && isNativeFullscreen.value) {
        void syncMacosWindowTransparency()
      }
      void syncNativeWindowChromeState()
    })
  } catch {
    unlistenWindowResize = null
  }
})

onUnmounted(() => {
  endWindowDragGuard()
  unlistenWindowResize?.()
  unlistenWindowResize = null
})
</script>

<style scoped>
.workbench-rail {
  --top-chrome-control-size: 30px;
  --top-chrome-control-radius: 6px;
  --top-chrome-drag-height: 18px;
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(140px, auto) minmax(52px, 1fr);
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  min-width: 0;
  max-height: 36px;
  margin: 0;
  padding: 0 var(--rail-right-offset) 0 var(--rail-left-offset);
  border-bottom: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
}

.workbench-rail__drag-region {
  position: absolute;
  inset: 0 0 auto 0;
  height: var(--top-chrome-drag-height);
  z-index: 1;
  pointer-events: auto;
}

.workbench-rail:hover .workbench-rail-button,
.workbench-rail:focus-within .workbench-rail-button {
  opacity: 1;
}

.workbench-rail-side {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  position: relative;
  z-index: 2;
  min-width: 0;
  pointer-events: auto;
}

:global(body.window-dragging) {
  cursor: grabbing !important;
  user-select: none !important;
  -webkit-user-select: none !important;
}

:global(body.window-dragging *) {
  user-select: none !important;
  -webkit-user-select: none !important;
}

.workbench-rail-side-left {
  justify-content: flex-start;
  gap: 6px;
}

.workbench-rail-side-right {
  justify-content: flex-end;
}

.workbench-rail-controls {
  display: inline-flex;
  align-items: center;
  gap: 4px;
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
  color: var(--text-muted);
  opacity: 1;
  background: transparent;
  box-shadow: none;
  transition:
    background-color 140ms ease,
    color 140ms ease,
    opacity 140ms ease;
}

.workbench-rail-button :deep(svg) {
  width: 16px !important;
  height: 16px !important;
}

/* Hover 时保持柔弱可见的底框 */
.workbench-rail-button:hover:not(:disabled) {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--surface-hover) 50%, transparent);
}

.workbench-rail-button:focus-visible {
  color: var(--text-primary);
  background: transparent;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--focus-ring) 46%, transparent);
}

/* 彻底删除选中态时的方框背景 */
.workbench-rail-button.is-active {
  color: var(--text-primary);
  background: transparent !important;
}

:deep(.workbench-rail-pane-button) {
  color: var(--text-secondary);
}

.workbench-mode-switcher {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  min-width: 0;
  padding: 2px;
  border: 1px solid color-mix(in srgb, var(--border) 36%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--surface-raised) 42%, transparent);
}

.workbench-mode-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 0;
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: color-mix(in srgb, var(--text-secondary) 86%, transparent);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 140ms ease,
    color 140ms ease;
}

.workbench-mode-tab:hover {
  background: color-mix(in srgb, var(--surface-hover) 54%, transparent);
  color: var(--text-primary);
}

.workbench-mode-tab.is-active {
  background: var(--list-active-bg);
  color: var(--text-primary);
}

.workbench-mode-tab__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 920px) {
  .workbench-rail {
    gap: 8px;
  }

  .workbench-mode-tab {
    padding: 0 6px;
  }
}

@media (max-width: 720px) {
  .workbench-rail {
    min-height: 36px;
  }

  .workbench-mode-tab__label {
    display: none;
  }
}
</style>
