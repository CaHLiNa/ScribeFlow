<template>
  <div
    class="tab-bar-shell flex items-center h-8 shrink-0 relative"
    data-tab-bar
    :data-pane-id="paneId"
  >
    <!-- Tabs -->
    <div
      ref="tabsContainer"
      class="flex-1 flex items-center h-full overflow-x-auto overflow-y-hidden relative"
      data-tabs-area
    >
      <div
        v-for="(tab, idx) in tabs"
        :key="tab"
        :ref="(el) => (tabEls[idx] = el)"
        data-tab-el
        class="tab-bar-item flex items-center h-full px-4 text-xs cursor-pointer shrink-0 group border-r"
        :class="{
          'is-active': tab === activeTab,
          'is-dragging': dragIdx === idx,
        }"
        :title="tabTitle(tab)"
        @mousedown="onMouseDown(idx, $event)"
        @mouseenter="onMouseEnter(idx)"
        @mousedown.middle.prevent="$emit('close-tab', tab)"
      >
        <svg
          v-if="isLibraryPath(tab)"
          class="tab-bar-icon tab-bar-icon-accent shrink-0 mr-1"
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path
            d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v8a.5.5 0 0 1-.8.4L8 9.75l-4.2 3.15a.5.5 0 0 1-.8-.4z"
          />
          <path d="M5.5 6.25h5M5.5 8h3.5" />
        </svg>
        <!-- Chat tab sparkle icon -->
        <svg
          v-if="isChatTab(tab) || isAiWorkbenchPath(tab)"
          class="tab-bar-icon tab-bar-icon-accent shrink-0 mr-1"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275z"
          />
        </svg>
        <span class="truncate max-w-[120px]">{{ fileName(tab) }}</span>
        <span
          v-if="isChatTab(tab) && chatSessionMeta(tab)"
          class="tab-role-badge ml-1 rounded-sm px-1 ui-text-tiny uppercase shrink-0"
        >
          {{ chatSessionMeta(tab).roleBadge }}
        </span>

        <!-- Chat streaming indicator -->
        <span
          v-if="isChatTab(tab) && isChatStreaming(tab)"
          class="ml-1.5 w-2 h-2 rounded-full shrink-0 chat-streaming-dot"
        ></span>

        <!-- Unsaved indicator (not for chat tabs) -->
        <span
          v-else-if="!isChatTab(tab) && dirtyFiles.has(tab)"
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
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
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
        variant="ghost"
        size="icon-sm"
        icon-only
        class="tab-toolbar-button mx-0.5 shrink-0"
        :title="t('New Tab')"
        :aria-label="t('New Tab')"
        @click="$emit('new-tab')"
        @mousedown.stop
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <line x1="8" y1="3" x2="8" y2="13" />
          <line x1="3" y1="8" x2="13" y2="8" />
        </svg>
      </UiButton>
    </div>

    <!-- Run actions (for renderable files) -->
    <div
      v-if="showRenderButton"
      class="tab-bar-actions flex items-center gap-0.5 px-1 shrink-0 border-l ml-1"
    >
      <UiButton
        variant="primary"
        size="sm"
        class="tab-render-button"
        @click="$emit('render-document')"
        :title="t('Render document')"
        :aria-label="t('Render document')"
      >
        <template #leading>
          <svg
            width="10"
            height="10"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <rect x="2" y="2" width="12" height="12" rx="1" />
            <path d="M5 5h6M5 8h6M5 11h3" />
          </svg>
        </template>
        {{ t('Render') }}
      </UiButton>
    </div>

    <!-- Pane actions -->
    <div class="tab-bar-actions flex items-center gap-0.5 px-1 shrink-0 border-l ml-1">
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
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
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
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
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
          width="12"
          height="12"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path d="M2 2l6 6M8 2l-6 6" />
        </svg>
      </UiButton>
    </div>

    <!-- Ghost tab (teleported to body during drag) -->
    <Teleport to="body">
      <div
        v-if="ghostVisible"
        class="tab-ghost"
        :style="{ left: ghostX + 'px', top: ghostY + 'px' }"
      >
        {{ ghostLabel }}
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted } from 'vue'
import UiButton from '../shared/ui/UiButton.vue'
import { useAiWorkbenchStore } from '../../stores/aiWorkbench'
import { useEditorStore } from '../../stores/editor'
import { useReferencesStore } from '../../stores/references'
import { chatAllSessionsMeta, chatSessions } from '../../stores/chatSessionState.js'
import {
  isReferencePath,
  referenceKeyFromPath,
  isAiWorkbenchPath,
  isLibraryPath,
  isRmdOrQmd,
  isChatTab,
  getChatSessionId,
  isAiLauncher,
  isNewTab,
  isPreviewPath,
  previewSourcePathFromPath,
} from '../../utils/fileTypes'
import { useI18n } from '../../i18n'

const props = defineProps({
  tabs: { type: Array, required: true },
  activeTab: { type: String, default: null },
  paneId: { type: String, default: '' },
})

const emit = defineEmits([
  'select-tab',
  'close-tab',
  'split-vertical',
  'split-horizontal',
  'close-pane',
  'render-document',
  'compile-tex',
  'compile-typst',
  'preview-pdf',
  'preview-markdown',
  'new-tab',
])

const aiWorkbench = useAiWorkbenchStore()
const { t } = useI18n()
const liveChatStore = ref(null)

onMounted(async () => {
  const { useChatStore } = await import('../../stores/chat.js')
  liveChatStore.value = useChatStore()
})

function isChatStreaming(path) {
  if (!isChatTab(path)) return false
  const sid = getChatSessionId(path)
  const chat = liveChatStore.value?.getChatInstance?.(sid)
  if (!chat) return false
  const status = chat.state.statusRef.value
  return status === 'submitted' || status === 'streaming'
}

const showRenderButton = computed(() => props.activeTab && isRmdOrQmd(props.activeTab))
const editorStore = useEditorStore()
const referencesStore = useReferencesStore()
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
  if (isAiWorkbenchPath(path)) return t('AI Workspace')
  if (isAiLauncher(path)) return t('AI')
  if (isLibraryPath(path)) return t('Library')
  if (isChatTab(path)) {
    const sid = getChatSessionId(path)
    const session = chatSessions.value.find((s) => s.id === sid)
    if (session?.label) {
      const label = session.label
      return label.length > 28 ? label.slice(0, 26) + '...' : label
    }
    const meta = chatAllSessionsMeta.value.find((m) => m.id === sid)
    if (meta?.label) {
      const label = meta.label
      return label.length > 28 ? label.slice(0, 26) + '...' : label
    }
    return t('New chat')
  }
  if (isReferencePath(path)) {
    const key = referenceKeyFromPath(path)
    const r = referencesStore.getByKey(key)
    if (r?.title) {
      return r.title.length > 30 ? r.title.slice(0, 28) + '...' : r.title
    }
    return `@${key}`
  }
  if (isPreviewPath(path)) {
    const name = previewSourcePathFromPath(path).split('/').pop()
    return `${name} (Preview)`
  }
  return path.split('/').pop()
}

function chatSessionMeta(path) {
  if (!isChatTab(path)) return null
  const sid = getChatSessionId(path)
  const session =
    chatSessions.value.find((item) => item.id === sid) ||
    chatAllSessionsMeta.value.find((item) => item.id === sid)
  return session ? aiWorkbench.describeSession(session) : null
}

function tabTitle(path) {
  const base = fileName(path)
  const meta = chatSessionMeta(path)
  if (!meta) return base
  return `${base} · ${meta.roleTitle} · ${meta.runtimeTitle}`
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
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border);
}

.tab-bar-item {
  border-color: var(--border);
  background: var(--bg-primary);
  color: var(--fg-muted);
  opacity: 0.7;
  transition:
    opacity 0.15s,
    color 0.14s ease,
    box-shadow 0.14s ease,
    background-color 0.14s ease;
}

.tab-bar-item:hover {
  color: var(--fg-primary);
  opacity: 0.92;
}

.tab-bar-item.is-active {
  color: var(--fg-primary);
  box-shadow: inset 0 -2px 0 var(--accent);
  opacity: 1;
}

.tab-bar-item.is-dragging {
  opacity: 0.3;
}

.tab-bar-icon-accent {
  color: var(--accent);
}

.tab-role-badge {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
}

.tab-dirty-indicator {
  background: var(--fg-muted);
}

.tab-close-button,
.tab-toolbar-button {
  color: var(--fg-muted);
}

.tab-close-button {
  width: 16px;
  height: 16px;
  min-height: 16px;
}

.tab-bar-actions {
  border-color: var(--border);
}

.tab-render-button {
  min-height: 24px;
}

.chat-streaming-dot {
  background: var(--accent);
  animation: chat-pulse 1.5s ease-in-out infinite;
}
@keyframes chat-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}
.tex-spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 1.5px solid var(--fg-muted);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: tex-spin 0.8s linear infinite;
}
@keyframes tex-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
