<template>
  <div class="flex flex-col h-full" style="background: var(--bg-primary);">
    <div class="flex-1 overflow-y-auto min-h-0" ref="itemListRef">
      <div class="w-full mx-auto pb-10" style="max-width: min(80ch, 90%); padding-top: clamp(1rem, 20vh, 8rem);">
        <div class="flex gap-5 mb-6 pl-5">
          <button
            v-for="tab in visibleTabs"
            :key="tab.id"
            class="ui-text-label font-semibold tracking-[0.06em] uppercase bg-transparent border-none cursor-pointer pb-0.5 transition-colors duration-75"
            :style="{
              color: activeTabId === tab.id ? 'var(--fg-primary)' : 'var(--fg-muted)',
              borderBottom: activeTabId === tab.id ? '1px solid var(--fg-primary)' : '1px solid transparent',
            }"
            @click="setTab(tab.id)"
          >{{ tab.label }}</button>
        </div>

        <template v-for="(item, i) in currentItems" :key="activeTabId + '-' + i">
          <div
            v-if="item.groupHeader"
            class="ui-text-caption font-semibold tracking-[0.06em] uppercase pl-5 pb-1"
            :class="i > 0 ? 'mt-4' : ''"
            style="color: var(--fg-muted);"
          >{{ item.groupHeader }}</div>
          <div
            class="group flex items-center gap-1"
            @mouseenter="selectedIdx = i"
          >
            <button
              class="newtab-item flex items-center gap-2 flex-1 border-none bg-transparent text-left py-1.5 cursor-pointer transition-colors duration-75"
              :style="{ color: selectedIdx === i ? 'var(--fg-primary)' : (item.muted ? 'var(--fg-muted)' : 'var(--fg-secondary)') }"
              @click="activate(item)"
            >
              <span
                class="w-3 shrink-0 leading-none select-none"
                style="font-size: var(--ui-font-title);"
                :style="{ color: selectedIdx === i ? 'var(--fg-muted)' : 'transparent' }"
              >›</span>
              <div class="flex-1 min-w-0 flex flex-col">
                <span class="ui-text-title truncate min-w-0">{{ item.label }}</span>
                <span
                  v-if="item.description"
                  class="ui-text-label truncate min-w-0 mt-0.5"
                  style="color: var(--fg-muted);"
                >{{ item.description }}</span>
              </div>
              <span
                v-if="item.meta"
                class="ui-text-label shrink-0 whitespace-nowrap mx-4"
                style="color: var(--fg-muted);"
              >{{ item.meta }}</span>
            </button>
            <button
              v-if="item.deleteAction"
              class="w-6 h-6 shrink-0 flex items-center justify-center rounded border-none bg-transparent cursor-pointer transition-opacity duration-100"
              :class="selectedIdx === i ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
              style="color: var(--fg-muted);"
              :title="item.deleteTitle || t('Delete chat')"
              @click.stop="item.deleteAction()"
              @mousedown.stop
              @mouseenter="selectedIdx = i"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M2 2l6 6M8 2l-6 6"/>
              </svg>
            </button>
          </div>
        </template>
      </div>
    </div>

    <div class="shrink-0 flex justify-center">
      <div class="w-full max-w-[80ch]">
        <ChatInput
          ref="chatInputRef"
          :isStreaming="false"
          :modelId="selectedModelId"
          :estimatedTokens="null"
          @send="sendChat"
          @update-model="selectModel"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useEditorStore } from '../../stores/editor'
import { useAiWorkbenchStore } from '../../stores/aiWorkbench'
import { useAiDrawerStore } from '../../stores/aiDrawer'
import { useChatStore } from '../../stores/chat'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n, formatRelativeFromNow } from '../../i18n'
import { getAiCapabilityItems, getAiLauncherItems } from '../../services/ai/taskCatalog'
import { launchAiTask, startAiConversation } from '../../services/ai/launch'
import ChatInput from '../chat/ChatInput.vue'

const props = defineProps({
  paneId: { type: String, default: '' },
  surface: { type: String, default: 'pane' },
})

const editorStore = useEditorStore()
const aiWorkbench = useAiWorkbenchStore()
const chatStore = useChatStore()
const workspace = useWorkspaceStore()
const aiDrawer = useAiDrawerStore()
const { t } = useI18n()

const chatInputRef = ref(null)
const itemListRef = ref(null)
const selectedModelId = ref(workspace.selectedModelId || null)
const activeTabId = ref(aiWorkbench.launcherTab || 'ai')
const selectedIdx = ref(0)
const chatsLimit = ref(10)
const recentFiles = ref([])

let recentFilesGeneration = 0

const TABS = [
  { id: 'ai', label: t('AI') },
  { id: 'capabilities', label: t('Capabilities') },
  { id: 'chats', label: t('Chats') },
]

const visibleTabs = computed(() => TABS)

const allRecentFiles = computed(() => recentFiles.value)
const currentContextPath = computed(() => editorStore.preferredContextPath || '')

const allChats = computed(() =>
  [...chatStore.allSessionsMeta].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
)

const aiItems = computed(() => {
  return getAiLauncherItems({
    currentPath: currentContextPath.value,
    recentFiles: allRecentFiles.value,
    t,
  }).map((item) => ({
    label: item.label,
    meta: item.meta,
    groupHeader: item.groupHeader,
    muted: item.muted,
    action: () => runAiTask(item.task, item.label),
  }))
})

const capabilityItems = computed(() => {
  return getAiCapabilityItems({
    currentPath: currentContextPath.value,
    t,
  }).map((item) => ({
    label: item.label,
    description: item.description,
    meta: item.meta,
    groupHeader: item.groupHeader,
    muted: false,
    action: () => runAiTask(item.task, item.label),
  }))
})

const currentItems = computed(() => {
  if (activeTabId.value === 'capabilities') {
    return capabilityItems.value
  }
  if (activeTabId.value === 'chats') {
    const visible = allChats.value.slice(0, chatsLimit.value)
    const items = visible.map((session) => ({
      label: session.label,
      meta: relativeTime(session.updatedAt),
      deleteAction: () => deleteChat(session.id),
      deleteTitle: t('Delete chat'),
      action: () => openChat(session.id),
    }))
    if (allChats.value.length > chatsLimit.value) {
      items.push({
        label: t('Show more'),
        muted: true,
        action: () => { chatsLimit.value += 10 },
      })
    }
    return items
  }
  return aiItems.value
})

watch(activeTabId, () => {
  selectedIdx.value = 0
  chatsLimit.value = 10
  aiWorkbench.launcherTab = activeTabId.value
})

watch(currentItems, (items) => {
  const max = Math.max(0, items.length - 1)
  if (selectedIdx.value > max) {
    selectedIdx.value = max
  }
})

watch(
  () => editorStore.recentFiles.map((entry) => `${entry.path}:${entry.openedAt}`).join('|'),
  () => {
    refreshRecentFiles().catch((error) => {
      console.warn('[ai-launcher] refreshRecentFiles failed:', error)
      recentFiles.value = []
    })
  },
  { immediate: true },
)

function setTab(id) {
  activeTabId.value = id
}

function switchTab(delta) {
  const tabs = visibleTabs.value
  const idx = tabs.findIndex((tab) => tab.id === activeTabId.value)
  const next = (idx + delta + tabs.length) % tabs.length
  activeTabId.value = tabs[next].id
  selectedIdx.value = 0
}

function moveSelection(delta) {
  const items = currentItems.value
  const next = Math.max(0, Math.min(items.length - 1, selectedIdx.value + delta))
  selectedIdx.value = next
  nextTick(() => {
    const buttons = itemListRef.value?.querySelectorAll('button.newtab-item')
    buttons?.[next]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

function activateSelected() {
  const item = currentItems.value[selectedIdx.value]
  if (item) activate(item)
}

function activate(item) {
  item.action()
}

function handleKeydown(e) {
  if (editorStore.activePaneId !== props.paneId) return
  const active = document.activeElement
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
  const richInput = chatInputRef.value?.$el?.querySelector('[contenteditable]')

  switch (e.key) {
    case 'ArrowLeft': e.preventDefault(); switchTab(-1); break
    case 'ArrowRight': e.preventDefault(); switchTab(1); break
    case 'ArrowUp': e.preventDefault(); moveSelection(-1); break
    case 'ArrowDown': e.preventDefault(); moveSelection(1); break
    case 'Enter': e.preventDefault(); activateSelected(); break
    case 'Backspace':
    case 'Delete': {
      const item = currentItems.value[selectedIdx.value]
      if (activeTabId.value === 'chats' && item?.deleteAction) {
        e.preventDefault()
        item.deleteAction()
      }
      break
    }
    default:
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        if (richInput) {
          richInput.focus()
          document.execCommand('insertText', false, e.key)
        }
      }
  }
}

function relativeTime(ts) {
  return formatRelativeFromNow(ts)
}

async function refreshRecentFiles() {
  const generation = ++recentFilesGeneration
  const entries = [...editorStore.recentFiles]
  if (entries.length === 0) {
    recentFiles.value = []
    return
  }

  const results = await Promise.all(
    entries.map(async (entry) => {
      try {
        const exists = await invoke('path_exists', { path: entry.path })
        return exists ? entry : null
      } catch {
        return null
      }
    }),
  )

  if (generation !== recentFilesGeneration) return
  recentFiles.value = results.filter(Boolean)
}

function openChat(sessionId) {
  chatStore.reopenSession(sessionId, { skipArchive: true })
  if (props.surface === 'drawer') {
    nextTick(() => {
      aiDrawer.openSession(sessionId)
    })
    return
  }
  editorStore.setActivePane(props.paneId)
  nextTick(() => {
    editorStore.openChat({ sessionId, paneId: props.paneId })
  })
}

function deleteChat(sessionId) {
  if (!sessionId) return
  editorStore.closeFileFromAllPanes(`chat:${sessionId}`)
  chatStore.deleteSession(sessionId)
  if (props.surface === 'drawer' && aiDrawer.sessionId === sessionId) {
    aiDrawer.openLauncher()
  }
}

async function sendChat({ text, fileRefs, context }) {
  if (!text && !fileRefs?.length) return
  await startAiConversation({
    editorStore,
    chatStore,
    paneId: props.surface === 'pane' ? props.paneId : null,
    surface: props.surface,
    modelId: selectedModelId.value,
    text,
    fileRefs,
    context,
  })
}

async function runAiTask(task, label) {
  await launchAiTask({
    editorStore,
    chatStore,
    paneId: props.surface === 'pane' ? props.paneId : null,
    surface: props.surface,
    modelId: selectedModelId.value,
    task: {
      ...task,
      label,
    },
  })
}

function selectModel(modelId) {
  selectedModelId.value = modelId
  workspace.setSelectedModelId(modelId)
}

onMounted(() => {
  if (props.surface === 'pane') {
    window.addEventListener('keydown', handleKeydown)
  }
})

onUnmounted(() => {
  recentFilesGeneration += 1
  if (props.surface === 'pane') {
    window.removeEventListener('keydown', handleKeydown)
  }
})
</script>
