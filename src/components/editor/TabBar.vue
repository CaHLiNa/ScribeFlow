<template>
  <div class="flex items-center h-7 shrink-0 relative"
    data-tab-bar
    :data-pane-id="paneId"
    style="background: var(--bg-secondary); border-bottom: 1px solid var(--border);">
    <!-- Tabs -->
    <div ref="tabsContainer" class="flex-1 flex items-center h-full overflow-x-auto relative" data-tabs-area>
      <div
        v-for="(tab, idx) in tabs"
        :key="tab"
        :ref="el => tabEls[idx] = el"
        data-tab-el
        class="flex items-center h-full px-3 text-xs cursor-pointer shrink-0 border-r group"
        :title="tabTitle(tab)"
        :style="{
          borderColor: 'var(--border)',
          background: tab === activeTab ? 'var(--bg-primary)' : 'transparent',
          color: tab === activeTab ? 'var(--fg-primary)' : 'var(--fg-muted)',
          borderTop: tab === activeTab ? '2px solid var(--accent)' : '2px solid transparent',
          opacity: dragIdx === idx ? 0.3 : 1,
          transition: 'opacity 0.15s',
        }"
        @mousedown="onMouseDown(idx, $event)"
        @mouseenter="onMouseEnter(idx)"
        @mousedown.middle.prevent="$emit('close-tab', tab)"
      >
        <!-- NewTab icon -->
        <!-- <svg v-if="isNewTab(tab)" class="shrink-0 mr-1" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--fg-muted);">
          <line x1="8" y1="3" x2="8" y2="13"/>
          <line x1="3" y1="8" x2="13" y2="8"/>
        </svg> -->
        <!-- Chat tab sparkle icon -->
        <svg v-if="isChatTab(tab)" class="shrink-0 mr-1" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent);">
          <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275z"/>
        </svg>
        <span class="truncate max-w-[120px]">{{ fileName(tab) }}</span>
        <span
          v-if="isChatTab(tab) && chatSessionMeta(tab)"
          class="ml-1 rounded-sm px-1 ui-text-tiny uppercase shrink-0"
          style="background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent);"
        >
          {{ chatSessionMeta(tab).roleBadge }}
        </span>

        <!-- Chat streaming indicator -->
        <span v-if="isChatTab(tab) && isChatStreaming(tab)" class="ml-1.5 w-2 h-2 rounded-full shrink-0 chat-streaming-dot"></span>

        <!-- Unsaved indicator (not for chat tabs) -->
        <span v-else-if="!isChatTab(tab) && dirtyFiles.has(tab)" class="ml-1.5 w-2 h-2 rounded-full shrink-0" style="background: var(--fg-muted);"></span>

        <!-- Close button -->
        <button
          class="ml-2 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
          style="color: var(--fg-muted);"
          @click.stop="$emit('close-tab', tab)"
          @mousedown.stop
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M2 2l6 6M8 2l-6 6"/>
          </svg>
        </button>
      </div>

      <!-- Drop indicator line -->
      <div v-if="dropIndicatorLeft !== null" class="tab-drop-indicator" :style="{ left: dropIndicatorLeft + 'px' }"></div>

      <!-- New tab button -->
      <button
        class="flex items-center justify-center w-6 h-6 mx-0.5 shrink-0 rounded hover:bg-[var(--bg-hover)]"
        style="color: var(--fg-muted);"
        :title="t('New Tab')"
        @click="$emit('new-tab')"
        @mousedown.stop
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <line x1="8" y1="3" x2="8" y2="13"/>
          <line x1="3" y1="8" x2="13" y2="8"/>
        </svg>
      </button>
    </div>

    <!-- Run actions (for runnable files) -->
    <div v-if="showRunButtons" class="flex items-center gap-0.5 px-1 shrink-0 border-r" style="border-color: var(--border);">
      <button
        class="h-6 px-2 flex items-center gap-1 rounded ui-text-xs hover:bg-[var(--bg-hover)]"
        style="color: var(--success, #4ade80);"
        @click="$emit('run-code')"
        :title="t('Run selection or line ({shortcut})', { shortcut: `${modKey}+Enter` })"
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 2l10 6-10 6V2z"/>
        </svg>
        {{ t('Run') }}
      </button>
      <button
        class="h-6 px-2 flex items-center gap-1 rounded ui-text-xs hover:bg-[var(--bg-hover)]"
        style="color: var(--success, #4ade80);"
        @click="$emit('run-file')"
        :title="t('Run entire file ({shortcut})', { shortcut: `Shift+${modKey}+Enter` })"
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
          <path d="M2 2l6 6-6 6V2z"/>
          <path d="M8 2l6 6-6 6V2z"/>
        </svg>
        {{ t('Run All') }}
      </button>
      <button
        v-if="showRenderButton"
        class="h-6 px-2 flex items-center gap-1 rounded ui-text-xs hover:bg-[var(--bg-hover)]"
        style="color: var(--accent);"
        @click="$emit('render-document')"
        :title="t('Render document')"
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="2" width="12" height="12" rx="1"/>
          <path d="M5 5h6M5 8h6M5 11h3"/>
        </svg>
        {{ t('Render') }}
      </button>
    </div>

    <!-- Pane actions -->
    <div class="flex items-center gap-0.5 px-1 shrink-0">
      <!-- Comment margin toggle (for text files) -->
      <button
        v-if="showCommentToggle"
        class="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-hover)] relative"
        :style="{ color: commentsStore.isMarginVisible(activeTab) ? 'var(--accent)' : 'var(--fg-muted)' }"
        @click="commentsStore.toggleMargin(activeTab)"
        :title="t('Toggle comments')"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 2.5h10a1.5 1.5 0 011.5 1.5v6a1.5 1.5 0 01-1.5 1.5H9.414l-2.707 2.707a.5.5 0 01-.854-.354V11.5H3A1.5 1.5 0 011.5 10V4A1.5 1.5 0 013 2.5z"/>
        </svg>
        <span
          v-if="commentBadgeCount > 0"
          class="absolute -top-0.5 -right-0.5 min-w-[12px] h-3 flex items-center justify-center rounded-full text-white"
          style="font-size: var(--ui-font-tiny); font-weight: 600; background: var(--accent); padding: 0 2px;"
        >
          {{ commentBadgeCount > 9 ? '9+' : commentBadgeCount }}
        </span>
      </button>
      <button
        class="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-hover)]"
        style="color: var(--fg-muted);"
        @click="$emit('split-vertical')"
        :title="t('Split vertical ({shortcut})', { shortcut: `${modKey} + J` })"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="1" y="2" width="14" height="12" rx="1.5"/>
          <line x1="8" y1="2" x2="8" y2="14"/>
        </svg>
      </button>
      <button
        class="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-hover)]"
        style="color: var(--fg-muted);"
        @click="$emit('split-horizontal')"
        :title="t('Split horizontal')"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="1" y="2" width="14" height="12" rx="1.5"/>
          <line x1="1" y1="8" x2="15" y2="8"/>
        </svg>
      </button>
      <button
        v-if="paneId !== 'pane-root'"
        class="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-hover)]"
        style="color: var(--fg-muted);"
        @click="$emit('close-pane')"
        :title="t('Close pane')"
      >
        <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M2 2l6 6M8 2l-6 6"/>
        </svg>
      </button>
    </div>

    <!-- Ghost tab (teleported to body during drag) -->
    <Teleport to="body">
      <div v-if="ghostVisible" class="tab-ghost" :style="{ left: ghostX + 'px', top: ghostY + 'px' }">
        {{ ghostLabel }}
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { useAiWorkbenchStore } from '../../stores/aiWorkbench'
import { useEditorStore } from '../../stores/editor'
import { useReferencesStore } from '../../stores/references'
import {
  isReferencePath,
  referenceKeyFromPath,
  isRunnable,
  isRmdOrQmd,
  isChatTab,
  getChatSessionId,
  isAiLauncher,
  isNewTab,
  getViewerType,
  isPreviewPath,
  previewSourcePathFromPath,
} from '../../utils/fileTypes'
import { useCommentsStore } from '../../stores/comments'
import { useChatStore } from '../../stores/chat'
import { modKey } from '../../platform'
import { useI18n } from '../../i18n'

const props = defineProps({
  tabs: { type: Array, required: true },
  activeTab: { type: String, default: null },
  paneId: { type: String, default: '' },
})

const emit = defineEmits(['select-tab', 'close-tab', 'split-vertical', 'split-horizontal', 'close-pane', 'run-code', 'run-file', 'render-document', 'compile-tex', 'compile-typst', 'preview-pdf', 'preview-markdown', 'new-tab'])

const aiWorkbench = useAiWorkbenchStore()
const chatStore = useChatStore()
const commentsStore = useCommentsStore()
const { t } = useI18n()

// Comment margin toggle
const showCommentToggle = computed(() => {
  if (!props.activeTab) return false
  return getViewerType(props.activeTab) === 'text'
})

const commentBadgeCount = computed(() => {
  if (!props.activeTab) return 0
  return commentsStore.unresolvedCount(props.activeTab)
})

function isChatStreaming(path) {
  if (!isChatTab(path)) return false
  const sid = getChatSessionId(path)
  const chat = chatStore.getChatInstance(sid)
  if (!chat) return false
  const status = chat.state.statusRef.value
  return status === 'submitted' || status === 'streaming'
}

const showRunButtons = computed(() => props.activeTab && isRunnable(props.activeTab))
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

watch(() => props.activeTab, (tab) => {
  if (!tab) return
  nextTick(scrollActiveTabIntoView)
})
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
  if (isAiLauncher(path)) return t('AI')
  if (isChatTab(path)) {
    const sid = getChatSessionId(path)
    const session = chatStore.sessions.find(s => s.id === sid)
    if (session?.label) {
      const label = session.label
      return label.length > 28 ? label.slice(0, 26) + '...' : label
    }
    const meta = chatStore.allSessionsMeta.find(m => m.id === sid)
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
  const session = chatStore.sessions.find((item) => item.id === sid)
    || chatStore.allSessionsMeta.find((item) => item.id === sid)
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
let crossPaneTarget = null      // { paneId, tabBarEl }
let crossPaneInsertIdx = -1
let remoteIndicatorEl = null     // injected drop indicator in remote TabBar
let dragStartPaneId = null       // capture at drag start (pane may be destroyed)

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
    if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
      return { paneId: bar.dataset.paneId, tabBarEl: bar, isEmptyPane: false }
    }
  }
  // Fallback: check EditorPane data-pane-id elements (for empty panes without TabBar)
  const panes = document.querySelectorAll('[data-pane-id]')
  for (const pane of panes) {
    if (pane.hasAttribute('data-tab-bar')) continue // already checked
    const rect = pane.getBoundingClientRect()
    if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
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
  remoteIndicatorEl.style.left = (bestEdgeX - containerRect.left - 1) + 'px'

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
    if ((dx > 5 || dy > 5) && !isDragging) {
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
        editorStore.moveTabToPane(originPaneId, tabPath, crossPaneTarget.paneId, crossPaneInsertIdx >= 0 ? crossPaneInsertIdx : 0)
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
.chat-streaming-dot {
  background: var(--accent);
  animation: chat-pulse 1.5s ease-in-out infinite;
}
@keyframes chat-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
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
  to { transform: rotate(360deg); }
}
</style>
