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

      <UiButton
        v-if="leftSidebarAvailable"
        class="workbench-rail-button"
        variant="ghost"
        size="icon-sm"
        :active="leftSidebarPanel === 'references'"
        :title="leftSidebarPanel === 'references' ? t('Open files') : t('Open reference library')"
        :aria-label="
          leftSidebarPanel === 'references' ? t('Open files') : t('Open reference library')
        "
        data-window-drag-ignore="true"
        @click="$emit('open-reference-library')"
      >
        <IconBook2 :size="16" :stroke-width="1.75" />
      </UiButton>
    </div>

    <div class="workbench-rail-center">
      <div class="workbench-rail-title-target">
        <div
          v-show="showDocumentTitleTarget"
          :id="documentTitleTargetId"
          class="workbench-rail-title-slot"
        ></div>
        <div
          v-if="currentDocumentLabel && !preferExternalDocumentTitle"
          class="workbench-rail-document-title"
          :title="currentDocumentLabel"
          :aria-label="currentDocumentLabel"
        >
          <span class="workbench-rail-document-title-label">{{ currentDocumentLabel }}</span>
        </div>
      </div>
    </div>

    <div class="workbench-rail-side workbench-rail-side-right">
      <div class="workbench-rail-controls" data-window-drag-ignore="true">
        <UiButton
          v-if="splitPaneAvailable"
          class="workbench-rail-button"
          shell-class="workbench-rail-pane-button"
          variant="ghost"
          size="icon-sm"
          :active="splitPaneOpen"
          :title="t('Toggle split pane ({shortcut})', { shortcut: `${modKey}+J` })"
          :aria-label="t('Toggle split pane')"
          data-window-drag-ignore="true"
          @click="$emit('toggle-split-pane')"
        >
          <IconLayoutColumns :size="16" :stroke-width="1.75" />
        </UiButton>

        <UiButton
          v-if="inspectorAvailable"
          class="workbench-rail-button"
          shell-class="workbench-rail-pane-button"
          variant="ghost"
          size="icon-sm"
          :active="rightSidebarOpen && rightSidebarPanel === 'ai'"
          :title="
            rightSidebarOpen && rightSidebarPanel === 'ai' ? t('Hide AI agent') : t('Open AI agent')
          "
          :aria-label="
            rightSidebarOpen && rightSidebarPanel === 'ai' ? t('Hide AI agent') : t('Open AI agent')
          "
          data-window-drag-ignore="true"
          @click="handleAiButtonClick"
        >
          <IconSparkles :size="16" :stroke-width="1.75" />
        </UiButton>

        <UiButton
          v-if="inspectorAvailable"
          class="workbench-rail-button"
          shell-class="workbench-rail-pane-button"
          variant="ghost"
          size="icon-sm"
          :active="rightSidebarOpen && rightSidebarPanel === 'outline'"
          :title="
            rightSidebarOpen && rightSidebarPanel === 'outline'
              ? t('Hide outline')
              : t('Open outline')
          "
          :aria-label="
            rightSidebarOpen && rightSidebarPanel === 'outline'
              ? t('Hide outline')
              : t('Open outline')
          "
          data-window-drag-ignore="true"
          @click="handleInspectorButtonClick"
        >
          <component
            :is="
              rightSidebarOpen && rightSidebarPanel === 'outline'
                ? IconLayoutSidebarRightCollapse
                : IconLayoutSidebarRight
            "
            :size="16"
            :stroke-width="1.75"
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
  IconBook2,
  IconLayoutColumns,
  IconLayoutSidebar,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarRight,
  IconLayoutSidebarRightCollapse,
  IconSparkles,
} from '@tabler/icons-vue'
import UiButton from '../shared/ui/UiButton.vue'
import { isMac, modKey } from '../../platform'
import { useI18n } from '../../i18n'

const props = defineProps({
  tabsTargetId: { type: String, default: 'app-shell-topbar-tabs' },
  documentTitleTargetId: { type: String, default: 'app-shell-topbar-document-title' },
  currentDocumentLabel: { type: String, default: '' },
  preferExternalDocumentTitle: { type: Boolean, default: false },
  showDocumentTitleTarget: { type: Boolean, default: true },
  leftSidebarAvailable: { type: Boolean, default: true },
  leftSidebarOpen: { type: Boolean, default: true },
  leftSidebarPanel: { type: String, default: 'files' },
  rightSidebarOpen: { type: Boolean, default: false },
  rightSidebarPanel: { type: String, default: 'outline' },
  splitPaneAvailable: { type: Boolean, default: true },
  splitPaneOpen: { type: Boolean, default: false },
  inspectorAvailable: { type: Boolean, default: false },
})

const emit = defineEmits([
  'toggle-left-sidebar',
  'open-reference-library',
  'open-ai-agent',
  'open-outline-inspector',
  'toggle-right-sidebar',
  'toggle-split-pane',
])

const { t } = useI18n()

const TOPBAR_HEIGHT = 42
const DEFAULT_SIDE_PADDING = 12
const MAC_TRAFFIC_LIGHT_SAFE_PADDING = 68
const FULLSCREEN_LEFT_PADDING = 12
const isTauriDesktop = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
const WINDOW_DRAGGING_CLASS = 'window-dragging'

const isNativeFullscreen = ref(false)
let unlistenWindowResize = null
let removeDragGuards = null

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

async function handleWindowDragStart(event) {
  if (!isTauriDesktop || event.button !== 0) return
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('[data-window-drag-ignore="true"]')) return
  event.preventDefault()
  beginWindowDragGuard()
  try {
    await getCurrentWindow().startDragging()
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

function handleAiButtonClick() {
  if (props.rightSidebarOpen && props.rightSidebarPanel === 'ai') {
    emit('toggle-right-sidebar')
    return
  }
  emit('open-ai-agent')
}

function handleInspectorButtonClick() {
  if (props.rightSidebarOpen && props.rightSidebarPanel === 'outline') {
    emit('toggle-right-sidebar')
    return
  }
  emit('open-outline-inspector')
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0;
  flex: 0 0 auto;
  min-width: 0;
  margin: 0;
  padding-top: 1px;
  padding-bottom: 1px;
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

.workbench-rail--mac .workbench-rail-side {
  transform: translateY(-5px);
}

.workbench-rail-side {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
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
  pointer-events: auto;
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
  min-height: 24px;
  min-width: 0;
  max-width: min(440px, 100%);
  overflow: visible;
  pointer-events: auto;
}

.workbench-rail-title-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: 0;
}

.workbench-rail-document-title {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  min-width: 0;
  min-height: 26px;
  padding: 0 8px;
  border-radius: 8px;
  background: transparent;
  box-shadow: none;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.25;
  user-select: none;
  -webkit-user-select: none;
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

.workbench-rail-document-title-label {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workbench-rail-side-left {
  justify-content: flex-start;
  gap: 4px;
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
