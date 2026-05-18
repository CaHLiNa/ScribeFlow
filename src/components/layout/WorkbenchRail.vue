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

    </div>

    <WorkbenchRailTitleArea
      ref="workspaceTitleAreaRef"
      :document-title-target-id="documentTitleTargetId"
      :rail-title-state="railTitleState"
      :workspace-menu-open="workspaceMenuOpen"
      :workspace-mode-items="workspaceModeItems"
      @select-workbench-panel="selectWorkbenchPanel"
      @toggle-workspace-menu="toggleWorkspaceMenu"
    />

    <div class="workbench-rail-side workbench-rail-side-right">
      <div class="workbench-rail-controls" data-window-drag-ignore="true">
        <UiButton
          v-if="rightSidebarAvailable"
          class="workbench-rail-button"
          variant="ghost"
          size="icon-sm"
          :active="rightSidebarOpen"
          :title="t('Toggle right sidebar')"
          :aria-label="t('Toggle right sidebar')"
          data-window-drag-ignore="true"
          @click="$emit('toggle-right-sidebar')"
        >
          <component
            :is="rightSidebarOpen ? IconLayoutSidebarRightCollapse : IconLayoutSidebarRight"
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
import {
  IconLayoutSidebar,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarRight,
  IconLayoutSidebarRightCollapse,
} from '@tabler/icons-vue'
import UiButton from '../shared/ui/UiButton.vue'
import WorkbenchRailTitleArea from './WorkbenchRailTitleArea.vue'
import { isMac, isTauriDesktopRuntime, modKey } from '../../platform'
import { useI18n } from '../../i18n'
import {
  isNativeWindowFullscreen,
  onNativeWindowResized,
  startNativeWindowDrag,
} from '../../services/nativeWindow.js'
import { syncMacosWindowTransparency } from '../../services/macosWindowTransparency.js'
import {
  buildWorkbenchRailModeItems,
  buildWorkbenchRailTitleState,
  resolveWorkbenchRailStyle,
} from '../../domains/workbench/workbenchRailPresentation.js'

const props = defineProps({
  tabsTargetId: { type: String, default: 'app-shell-topbar-tabs' },
  documentTitleTargetId: { type: String, default: 'app-shell-topbar-document-title' },
  currentDocumentLabel: { type: String, default: '' },
  preferExternalDocumentTitle: { type: Boolean, default: false },
  showDocumentTitleTarget: { type: Boolean, default: true },
  leftSidebarAvailable: { type: Boolean, default: true },
  leftSidebarOpen: { type: Boolean, default: true },
  leftSidebarPanel: { type: String, default: 'files' },
  rightSidebarAvailable: { type: Boolean, default: true },
  rightSidebarOpen: { type: Boolean, default: false },
})

const emit = defineEmits([
  'toggle-left-sidebar',
  'select-workbench-panel',
  'toggle-right-sidebar',
])

const { t } = useI18n()
const isTauriDesktop = isTauriDesktopRuntime
const WINDOW_DRAGGING_CLASS = 'window-dragging'

const isNativeFullscreen = ref(false)
const workspaceMenuOpen = ref(false)
const workspaceTitleAreaRef = ref(null)
let unlistenWindowResize = null
let removeDragGuards = null

const railStyle = computed(() =>
  resolveWorkbenchRailStyle({
    isMac,
    isTauriDesktop,
    isNativeFullscreen: isNativeFullscreen.value,
  })
)
const workspaceModeItems = computed(() =>
  buildWorkbenchRailModeItems({
    activePanel: props.leftSidebarPanel,
    t,
  })
)
const railTitleState = computed(() =>
  buildWorkbenchRailTitleState({
    currentDocumentLabel: props.currentDocumentLabel,
    leftSidebarAvailable: props.leftSidebarAvailable,
    leftSidebarPanel: props.leftSidebarPanel,
    preferExternalDocumentTitle: props.preferExternalDocumentTitle,
    showDocumentTitleTarget: props.showDocumentTitleTarget,
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

function toggleWorkspaceMenu() {
  workspaceMenuOpen.value = !workspaceMenuOpen.value
}

function closeWorkspaceMenu() {
  workspaceMenuOpen.value = false
}

function selectWorkbenchPanel(panel) {
  closeWorkspaceMenu()
  emit('select-workbench-panel', panel)
}

function handleDocumentPointerDown(event) {
  if (!workspaceMenuOpen.value) return
  if (workspaceTitleAreaRef.value?.containsWorkspaceTitleTarget?.(event.target)) return
  closeWorkspaceMenu()
}

function handleDocumentEscape(event) {
  if (event.key === 'Escape') {
    closeWorkspaceMenu()
  }
}

onMounted(async () => {
  document.addEventListener('mousedown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentEscape)

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
  document.removeEventListener('mousedown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentEscape)
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
  display: block;
  flex: 0 0 auto;
  min-width: 0;
  max-height: 36px;
  margin: 0;
  padding-top: 0;
  padding-bottom: 0;
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
  position: absolute;
  top: 50%;
  z-index: 2;
  pointer-events: auto;
  transform: translateY(-50%);
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
  left: var(--rail-left-offset);
  justify-content: flex-start;
  gap: 4px;
}

.workbench-rail-side-right {
  right: var(--rail-right-offset);
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
  .workbench-rail {
    gap: 8px;
  }
}

@media (max-width: 720px) {
  .workbench-rail {
    min-height: 36px;
  }
}
</style>
