<template>
  <Teleport :to="teleportTo || 'body'" :disabled="!teleportTo">
    <div
      class="tab-bar-shell flex items-center shrink-0 relative"
      :class="{ 'is-shell-integrated': shellIntegrated }"
      :data-tauri-drag-region="shellIntegrated ? '' : null"
      data-tab-bar
      :data-pane-id="paneId"
    >
      <!-- Tabs -->
      <div
        ref="tabsContainer"
        class="tab-bar-track flex-1 flex items-center overflow-x-auto overflow-y-hidden relative"
        data-tabs-area
      >
        <div
          v-for="(tab, idx) in tabs"
          :key="tab"
          :ref="(el) => (tabEls[idx] = el)"
          data-tab-el
          class="tab-bar-item flex items-center cursor-pointer shrink-0 group"
          :class="{
            'is-active': tab === activeTab,
            'is-dragging': dragIdx === idx,
          }"
          :title="tabTitle(tab)"
          @mousedown="onMouseDown(idx, $event)"
          @mouseenter="onMouseEnter(idx)"
          @mousedown.middle.prevent="$emit('close-tab', tab)"
        >
          <span class="truncate max-w-[120px]">{{ fileName(tab) }}</span>
          <span
            v-if="dirtyFiles.has(tab)"
            class="tab-dirty-indicator ml-1.5 w-2 h-2 rounded-full shrink-0"
          ></span>

          <!-- Close button -->
          <UiButton
            variant="ghost"
            size="icon-sm"
            icon-only
            class="tab-close-button ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
            :title="t('Close tab')"
            :aria-label="t('Close tab')"
            @click.stop="$emit('close-tab', tab)"
            @mousedown.stop
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
            >
              <path d="M2 2l6 6M8 2l-6 6" />
            </svg>
          </UiButton>
        </div>

        <!-- Drop indicator line -->
        <div
          v-if="dropIndicatorLeft !== null"
          class="tab-drop-indicator"
          :style="{ left: dropIndicatorLeft + 'px' }"
        ></div>

        <!-- New tab button -->
        <UiButton
          v-if="!shellIntegrated"
          variant="ghost"
          size="icon-sm"
          icon-only
          class="tab-toolbar-button tab-toolbar-button-new shrink-0"
          :title="t('New Tab')"
          :aria-label="t('New Tab')"
          @click="$emit('new-tab')"
          @mousedown.stop
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
          >
            <line x1="8" y1="3" x2="8" y2="13" />
            <line x1="3" y1="8" x2="13" y2="8" />
          </svg>
        </UiButton>
      </div>
      <!-- Pane actions -->
      <div v-if="!shellIntegrated" class="tab-bar-actions flex items-center gap-1 shrink-0">
        <UiButton
          variant="ghost"
          size="icon-sm"
          icon-only
          class="tab-toolbar-button"
          @click="$emit('split-vertical')"
          :title="t('Split vertical ({shortcut})', { shortcut: `${modKey} + J` })"
          :aria-label="t('Split vertical ({shortcut})', { shortcut: `${modKey} + J` })"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
          >
            <rect x="1" y="2" width="14" height="12" rx="1.5" />
            <line x1="8" y1="2" x2="8" y2="14" />
          </svg>
        </UiButton>
        <UiButton
          variant="ghost"
          size="icon-sm"
          icon-only
          class="tab-toolbar-button"
          @click="$emit('split-horizontal')"
          :title="t('Split horizontal')"
          :aria-label="t('Split horizontal')"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
          >
            <rect x="1" y="2" width="14" height="12" rx="1.5" />
            <line x1="1" y1="8" x2="15" y2="8" />
          </svg>
        </UiButton>
        <UiButton
          v-if="paneId !== 'pane-root'"
          variant="ghost"
          size="icon-sm"
          icon-only
          class="tab-toolbar-button"
          @click="$emit('close-pane')"
          :title="t('Close pane')"
          :aria-label="t('Close pane')"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
          >
            <path d="M2 2l6 6M8 2l-6 6" />
          </svg>
        </UiButton>
      </div>
    </div>
  </Teleport>

  <!-- Ghost tab (teleported to body during drag) -->
  <Teleport to="body">
    <div v-if="ghostVisible" class="tab-ghost" :style="{ left: ghostX + 'px', top: ghostY + 'px' }">
      {{ ghostLabel }}
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, watch, nextTick } from 'vue'
import UiButton from '../shared/ui/UiButton.vue'
import { useEditorStore } from '../../stores/editor'
import { isNewTab, isPreviewPath, previewSourcePathFromPath } from '../../utils/fileTypes'
import { useI18n } from '../../i18n'

const props = defineProps({
  tabs: { type: Array, required: true },
  activeTab: { type: String, default: null },
  paneId: { type: String, default: '' },
  teleportTo: { type: String, default: '' },
  shellIntegrated: { type: Boolean, default: false },
})

const emit = defineEmits([
  'select-tab',
  'close-tab',
  'split-vertical',
  'split-horizontal',
  'close-pane',
  'render-document',
  'compile-tex',
  'preview-pdf',
  'preview-markdown',
  'new-tab',
])

const { t } = useI18n()
const editorStore = useEditorStore()
const dirtyFiles = editorStore.dirtyFiles

const tabsContainer = ref(null)
const tabEls = reactive({})

function scrollActiveTabIntoView() {
  const idx = props.tabs.indexOf(props.activeTab)
  if (idx === -1) return
  const el = tabEls[idx]
  if (!el) return
  el.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' })
}

watch(
  () => props.activeTab,
  (tab) => {
    if (!tab) return
    nextTick(scrollActiveTabIntoView)
  }
)
const dragIdx = ref(-1)
const dragOverIdx = ref(-1)
const dropIndicatorLeft = ref(null)

// Ghost tab state
const ghostVisible = ref(false)
const ghostX = ref(0)
const ghostY = ref(0)
const ghostLabel = ref('')

function fileName(path) {
  if (isNewTab(path)) return t('New Tab')
  if (isPreviewPath(path)) {
    const name = previewSourcePathFromPath(path).split('/').pop()
    return `${name} (Preview)`
  }
  return path.split('/').pop()
}

function tabTitle(path) {
  return fileName(path)
}

// Mouse-based drag reorder with ghost tab + cross-pane support
let mouseDownStart = null
let isDragging = false
let crossPaneTarget = null // { paneId, tabBarEl }
let crossPaneInsertIdx = -1
let remoteIndicatorEl = null // injected drop indicator in remote TabBar
let dragStartPaneId = null // capture at drag start (pane may be destroyed)

function cleanupRemoteIndicator() {
  if (remoteIndicatorEl && remoteIndicatorEl.parentNode) {
    remoteIndicatorEl.parentNode.removeChild(remoteIndicatorEl)
  }
  remoteIndicatorEl = null
}

/**
 * Find which pane's TabBar (or empty EditorPane) the cursor is over.
 * Returns { paneId, tabBarEl, isEmptyPane } or null.
 */
function findTargetPane(clientX, clientY) {
  // Check all TabBars
  const tabBars = document.querySelectorAll('[data-tab-bar]')
  for (const bar of tabBars) {
    const rect = bar.getBoundingClientRect()
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return { paneId: bar.dataset.paneId, tabBarEl: bar, isEmptyPane: false }
    }
  }
  // Fallback: check EditorPane data-pane-id elements (for empty panes without TabBar)
  const panes = document.querySelectorAll('[data-pane-id]')
  for (const pane of panes) {
    if (pane.hasAttribute('data-tab-bar')) continue // already checked
    const rect = pane.getBoundingClientRect()
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return { paneId: pane.dataset.paneId, tabBarEl: null, isEmptyPane: true }
    }
  }
  return null
}

/**
 * Calculate insert index for a remote TabBar based on cursor X position.
 * Also positions the remote drop indicator.
 */
function updateRemoteDropIndicator(tabBarEl, mouseX) {
  const tabsArea = tabBarEl.querySelector('[data-tabs-area]')
  if (!tabsArea) return 0

  const remoteTabs = tabsArea.querySelectorAll('[data-tab-el]')
  const containerRect = tabsArea.getBoundingClientRect()

  let bestIdx = 0
  let bestDist = Infinity
  let bestEdgeX = containerRect.left

  for (let i = 0; i <= remoteTabs.length; i++) {
    let edgeX
    if (i === 0) {
      edgeX = remoteTabs[0]?.getBoundingClientRect().left ?? containerRect.left
    } else {
      edgeX = remoteTabs[i - 1]?.getBoundingClientRect().right ?? containerRect.left
    }
    const dist = Math.abs(mouseX - edgeX)
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
      bestEdgeX = edgeX
    }
  }

  // Create or reposition remote indicator
  if (!remoteIndicatorEl) {
    remoteIndicatorEl = document.createElement('div')
    remoteIndicatorEl.className = 'tab-drop-indicator'
    remoteIndicatorEl.style.position = 'absolute'
    remoteIndicatorEl.style.zIndex = '100'
  }
  if (remoteIndicatorEl.parentNode !== tabsArea) {
    cleanupRemoteIndicator()
    remoteIndicatorEl = document.createElement('div')
    remoteIndicatorEl.className = 'tab-drop-indicator'
    remoteIndicatorEl.style.position = 'absolute'
    remoteIndicatorEl.style.zIndex = '100'
    tabsArea.appendChild(remoteIndicatorEl)
  }
  remoteIndicatorEl.style.left = bestEdgeX - containerRect.left - 1 + 'px'

  return bestIdx
}

function onMouseDown(idx, e) {
  if (e.button !== 0) return
  mouseDownStart = { idx, x: e.clientX, y: e.clientY }
  isDragging = false
  dragStartPaneId = props.paneId

  function onEscapeKey(ev) {
    if (ev.key === 'Escape') cancelDrag()
  }

  function cancelDrag() {
    dragIdx.value = -1
    dragOverIdx.value = -1
    dropIndicatorLeft.value = null
    ghostVisible.value = false
    mouseDownStart = null
    isDragging = false
    crossPaneTarget = null
    crossPaneInsertIdx = -1
    dragStartPaneId = null
    cleanupRemoteIndicator()
    document.body.classList.remove('tab-dragging')
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    document.removeEventListener('keydown', onEscapeKey)
  }

  function onMouseMove(ev) {
    if (!mouseDownStart) return
    const dx = Math.abs(ev.clientX - mouseDownStart.x)
    const dy = Math.abs(ev.clientY - mouseDownStart.y)
    if (!isDragging) {
      if (dx <= 5) return
      if (dy > dx) return
      isDragging = true
      dragIdx.value = mouseDownStart.idx
      ghostLabel.value = fileName(props.tabs[mouseDownStart.idx])
      ghostVisible.value = true
      document.body.classList.add('tab-dragging')
      document.addEventListener('keydown', onEscapeKey)
    }
    if (isDragging) {
      ghostX.value = ev.clientX
      ghostY.value = ev.clientY

      // Check if cursor is over a different pane
      const target = findTargetPane(ev.clientX, ev.clientY)

      if (target && target.paneId !== dragStartPaneId) {
        // Cross-pane: show indicator in remote TabBar
        crossPaneTarget = target
        dropIndicatorLeft.value = null // hide local indicator

        if (target.isEmptyPane) {
          crossPaneInsertIdx = 0
          cleanupRemoteIndicator()
        } else {
          crossPaneInsertIdx = updateRemoteDropIndicator(target.tabBarEl, ev.clientX)
        }
      } else {
        // Same pane or no target: revert to local indicator
        crossPaneTarget = null
        crossPaneInsertIdx = -1
        cleanupRemoteIndicator()
        updateDropIndicator(ev.clientX)
      }
    }
  }

  function onMouseUp() {
    document.removeEventListener('keydown', onEscapeKey)

    if (isDragging && dragIdx.value !== -1) {
      const tabPath = props.tabs[dragIdx.value]
      const originPaneId = dragStartPaneId

      if (crossPaneTarget && crossPaneTarget.paneId !== originPaneId) {
        // Cross-pane move
        editorStore.moveTabToPane(
          originPaneId,
          tabPath,
          crossPaneTarget.paneId,
          crossPaneInsertIdx >= 0 ? crossPaneInsertIdx : 0
        )
      } else if (dragOverIdx.value !== -1 && dragIdx.value !== dragOverIdx.value) {
        // Same-pane reorder
        editorStore.reorderTabs(originPaneId, dragIdx.value, dragOverIdx.value)
      }
    } else if (!isDragging && mouseDownStart) {
      emit('select-tab', props.tabs[mouseDownStart.idx])
    }

    dragIdx.value = -1
    dragOverIdx.value = -1
    dropIndicatorLeft.value = null
    ghostVisible.value = false
    mouseDownStart = null
    isDragging = false
    crossPaneTarget = null
    crossPaneInsertIdx = -1
    dragStartPaneId = null
    cleanupRemoteIndicator()
    document.body.classList.remove('tab-dragging')
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onMouseEnter(idx) {
  if (isDragging && dragIdx.value !== -1 && dragIdx.value !== idx) {
    dragOverIdx.value = idx
  }
}

function updateDropIndicator(mouseX) {
  if (!tabsContainer.value) return
  const containerRect = tabsContainer.value.getBoundingClientRect()

  // Find which tab gap the mouse is closest to
  let bestIdx = -1
  let bestDist = Infinity

  for (let i = 0; i <= props.tabs.length; i++) {
    let edgeX
    if (i === 0) {
      const el = tabEls[0]
      if (!el) continue
      edgeX = el.getBoundingClientRect().left
    } else {
      const el = tabEls[i - 1]
      if (!el) continue
      edgeX = el.getBoundingClientRect().right
    }
    const dist = Math.abs(mouseX - edgeX)
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
    }
  }

  if (bestIdx !== -1 && bestIdx !== dragIdx.value && bestIdx !== dragIdx.value + 1) {
    // Calculate position relative to container
    let edgeX
    if (bestIdx === 0) {
      edgeX = tabEls[0]?.getBoundingClientRect().left || 0
    } else {
      edgeX = tabEls[bestIdx - 1]?.getBoundingClientRect().right || 0
    }
    dropIndicatorLeft.value = edgeX - containerRect.left - 1
    dragOverIdx.value = bestIdx > dragIdx.value ? bestIdx - 1 : bestIdx
  } else {
    dropIndicatorLeft.value = null
    dragOverIdx.value = -1
  }
}
</script>

<style scoped>
.tab-bar-shell {
  box-sizing: border-box;
  min-height: 36px;
  padding: 4px 8px 0; /* 取消底部 padding，让 Tab 贴底 */
  background: transparent;
  border-bottom: 1px solid var(--workbench-divider-soft);
  gap: 4px;
}

.tab-bar-shell.is-shell-integrated {
  width: 100%;
  min-height: 36px;
  padding: 4px 8px 0;
  border-bottom: 1px solid var(--workbench-divider-soft);
  gap: 8px;
}

.tab-bar-track {
  gap: 2px; /* 缩小 Tab 之间的间距 */
  align-self: flex-end; /* 底部对齐 */
}

.tab-bar-shell.is-shell-integrated .tab-bar-track {
  gap: 2px;
  min-width: 0;
  -webkit-mask-image: linear-gradient(to right, transparent 0, black 10px, black calc(100% - 10px), transparent 100%);
  mask-image: linear-gradient(to right, transparent 0, black 10px, black calc(100% - 10px), transparent 100%);
}

.tab-bar-item {
  position: relative;
  min-height: 28px;
  padding: 0 10px 0 12px;
  border: 1px solid transparent;
  border-bottom: none; /* 底部无边框 */
  border-radius: 6px 6px 0 0; /* 仅顶部圆角，贴近原生编辑器感 */
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  transition: background-color 0.1s, color 0.1s;
  margin-bottom: -1px; /* 覆盖到底部边框上 */
}

.tab-bar-item:hover {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--surface-hover) 40%, transparent);
}

/* 选中态：背景色与下方编辑器融为一体，左右和上方出现极细的描边 */
.tab-bar-item.is-active {
  color: var(--text-primary);
  background: var(--shell-editor-surface);
  border-color: var(--workbench-divider-soft);
  font-weight: 600;
}

.tab-bar-item.is-active::after {
  content: '';
  position: absolute;
  top: -1px;
  left: -1px;
  right: -1px;
  height: 2px;
  background: var(--accent); /* 顶部 Accent 强调条 */
  border-radius: 6px 6px 0 0;
}

.tab-bar-item.is-dragging {
  opacity: 0.4;
}

.tab-dirty-indicator {
  background: var(--accent);
  width: 6px;
  height: 6px;
}

.tab-close-button,
.tab-toolbar-button {
  color: var(--text-muted);
  border-radius: 4px;
  opacity: 0;
  transition: background-color 0.1s, color 0.1s, opacity 0.1s;
}

.tab-bar-item.is-active .tab-close-button {
  opacity: 0.6;
}

.tab-bar-item:hover .tab-close-button {
  opacity: 0.8;
}

.tab-close-button {
  width: 18px;
  height: 18px;
  min-height: 18px;
  margin-left: 6px;
}

.tab-close-button:hover:not(:disabled),
.tab-toolbar-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--text-primary) 10%, transparent);
  color: var(--text-primary);
  opacity: 1;
}

.tab-bar-actions {
  gap: 2px;
  opacity: 0.5;
  transition: opacity 0.1s;
  align-self: center;
  padding-bottom: 4px;
}

.tab-toolbar-button-new {
  margin-left: 4px;
  opacity: 0.4;
  align-self: center;
  margin-bottom: 4px;
}

.tab-bar-shell:hover .tab-toolbar-button-new,
.tab-bar-shell:focus-within .tab-toolbar-button-new,
.tab-bar-shell:hover .tab-bar-actions,
.tab-bar-shell:focus-within .tab-bar-actions {
  opacity: 1;
}

.tab-bar-shell.is-shell-integrated .tab-bar-item {
  min-height: 28px;
}

.tab-bar-shell.is-shell-integrated .tab-bar-track::-webkit-scrollbar {
  display: none;
}

.tab-bar-shell.is-shell-integrated .tab-bar-track {
  scrollbar-width: none;
}
</style>
