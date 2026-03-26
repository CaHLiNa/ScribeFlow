<template>
  <div
    class="ai-launcher ai-launcher-root flex flex-col h-full"
    :class="{ 'ai-launcher-compact': compact }"
  >
    <div class="flex-1 overflow-y-auto min-h-0" ref="itemListRef">
      <div class="ai-launcher-shell w-full mx-auto pb-10">
        <div class="ai-launcher-tabs">
          <UiButton
            v-for="tab in visibleTabs"
            :key="tab.id"
            variant="ghost"
            size="sm"
            content-mode="raw"
            class="ai-launcher-tab"
            :active="activeTabId === tab.id"
            @click="setTab(tab.id)"
            >{{ tab.label }}</UiButton
          >
        </div>

        <template v-for="(item, i) in currentItems" :key="activeTabId + '-' + i">
          <div
            v-if="item.groupHeader"
            class="ai-launcher-group ai-launcher-group-label ui-text-caption font-semibold tracking-[0.06em] uppercase pb-1"
            :class="i > 0 ? 'mt-4' : ''"
          >
            {{ item.groupHeader }}
          </div>
          <div class="group flex items-center gap-1" @mouseenter="selectedIdx = i">
            <UiButton
              variant="ghost"
              size="sm"
              block
              content-mode="raw"
              class="newtab-item ai-launcher-item"
              :class="{
                'is-compact': compact,
                'is-muted': item.muted,
                'is-selected': selectedIdx === i,
              }"
              :active="selectedIdx === i"
              @click="activate(item)"
            >
              <span class="ai-launcher-item-arrow" :class="{ 'is-visible': selectedIdx === i }"
                >›</span
              >
              <div class="ai-launcher-item-body">
                <span
                  class="ui-text-title min-w-0"
                  :class="compact ? 'whitespace-normal break-words' : 'truncate'"
                  >{{ item.label }}</span
                >
                <span
                  v-if="item.description || item.task?.description"
                  class="ai-launcher-item-description ui-text-label min-w-0 mt-0.5"
                  :class="compact ? 'whitespace-normal break-words' : 'truncate'"
                  >{{ item.description || item.task?.description }}</span
                >
              </div>
              <span
                v-if="item.meta || item.task?.meta"
                class="ai-launcher-item-meta ui-text-label shrink-0"
                :class="
                  compact
                    ? 'w-full ml-5 mt-0.5 whitespace-normal break-words'
                    : 'whitespace-nowrap mx-4'
                "
                >{{ item.meta || item.task?.meta }}</span
              >
            </UiButton>
            <UiButton
              v-if="item.deleteAction"
              variant="ghost"
              size="icon-sm"
              icon-only
              class="ai-launcher-item-delete"
              :class="selectedIdx === i ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
              :title="item.deleteTitle || t('Delete chat')"
              :aria-label="item.deleteTitle || t('Delete chat')"
              @click.stop="item.deleteAction()"
              @mousedown.stop
              @mouseenter="selectedIdx = i"
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
        </template>
      </div>
    </div>

    <div v-if="showInput" class="shrink-0 flex justify-center">
      <div class="w-full ai-launcher-input-shell">
        <ChatInput
          ref="chatInputRef"
          :isStreaming="false"
          :modelId="selectedModelId"
          :estimatedTokens="null"
          :compact="compact"
          :toolItems="chatInputToolItems"
          @send="sendChat"
          @update-model="selectModel"
          @launch-task="handleLaunchTask"
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
import {
  getAiCapabilityItems,
  getAiLauncherItems,
  getChatInputToolItems,
} from '../../services/ai/taskCatalog'
import { launchAiTask, launchWorkflowTask, startAiConversation } from '../../services/ai/launch'
import ChatInput from '../chat/ChatInput.vue'
import UiButton from '../shared/ui/UiButton.vue'

const props = defineProps({
  paneId: { type: String, default: '' },
  surface: { type: String, default: 'pane' },
  compact: { type: Boolean, default: false },
  showInput: { type: Boolean, default: true },
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
    description: item.description,
    groupHeader: item.groupHeader,
    muted: item.muted,
    task: item.task,
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
    task: item.task,
    groupHeader: item.groupHeader,
    muted: false,
    action: () => runAiTask(item.task, item.label),
  }))
})

const chatInputToolItems = computed(() =>
  getChatInputToolItems({
    currentPath: currentContextPath.value,
    t,
  })
)

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
        action: () => {
          chatsLimit.value += 10
        },
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
  { immediate: true }
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
  if (
    active &&
    (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
  )
    return
  const richInput = chatInputRef.value?.$el?.querySelector('[contenteditable]')

  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault()
      switchTab(-1)
      break
    case 'ArrowRight':
      e.preventDefault()
      switchTab(1)
      break
    case 'ArrowUp':
      e.preventDefault()
      moveSelection(-1)
      break
    case 'ArrowDown':
      e.preventDefault()
      moveSelection(1)
      break
    case 'Enter':
      e.preventDefault()
      activateSelected()
      break
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
    })
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
  if (props.surface === 'workbench') {
    nextTick(() => {
      aiWorkbench.openSession(sessionId)
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
  const nextTask = {
    ...task,
    label,
  }
  if (nextTask.action === 'workflow') {
    return await launchWorkflowTask({
      editorStore,
      chatStore,
      paneId: props.surface === 'pane' ? props.paneId : null,
      surface: props.surface,
      modelId: selectedModelId.value,
      task: nextTask,
    })
  }
  await launchAiTask({
    editorStore,
    chatStore,
    paneId: props.surface === 'pane' ? props.paneId : null,
    surface: props.surface,
    modelId: selectedModelId.value,
    task: nextTask,
  })
}

async function handleLaunchTask(item) {
  if (!item?.task) return
  await runAiTask(item.task, item.label || item.task.label)
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

<style scoped>
.ai-launcher-root {
  background: var(--bg-primary);
}

.ai-launcher-shell {
  max-width: min(80ch, 90%);
  padding-top: clamp(1rem, 20vh, 8rem);
}

.ai-launcher-tabs {
  display: flex;
  gap: 1.25rem;
  margin-bottom: 1.5rem;
  padding-left: 1.25rem;
  flex-wrap: wrap;
}

.ai-launcher-tab {
  min-height: auto;
  padding: 0 0 2px;
  border-radius: 0;
  border-bottom: 1px solid transparent;
  color: var(--text-muted);
  font-size: var(--ui-font-caption);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.ai-launcher-tab:hover:not(:disabled) {
  background: transparent;
  color: var(--text-secondary);
}

.ai-launcher-tab.is-active {
  background: transparent;
  color: var(--text-primary);
  border-bottom-color: var(--text-primary);
}

.ai-launcher-group {
  padding-left: 1.25rem;
}

.ai-launcher-group-label {
  color: var(--text-muted);
}

.ai-launcher-item {
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-2);
  padding: 6px 0;
  border-radius: 0;
  color: var(--text-secondary);
}

.ai-launcher-item.is-muted {
  color: var(--text-muted);
}

.ai-launcher-item.is-selected {
  color: var(--text-primary);
}

.ai-launcher-item.is-compact {
  align-items: flex-start;
  flex-wrap: wrap;
}

.ai-launcher-item-arrow {
  width: 0.75rem;
  flex-shrink: 0;
  font-size: var(--ui-font-title);
  line-height: 1;
  user-select: none;
  color: transparent;
}

.ai-launcher-item-arrow.is-visible {
  color: var(--text-muted);
}

.ai-launcher-item-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ai-launcher-item-description,
.ai-launcher-item-meta {
  color: var(--text-muted);
}

.ai-launcher-item-delete {
  color: var(--text-muted);
  transition: opacity 100ms ease;
}

.ai-launcher-input-shell {
  max-width: 80ch;
}

.ai-launcher-compact .ai-launcher-shell {
  max-width: calc(100% - 16px);
  padding-top: 1rem;
}

.ai-launcher-compact .ai-launcher-tabs {
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding-left: 0.75rem;
}

.ai-launcher-compact .ai-launcher-group {
  padding-left: 0.75rem;
}

.ai-launcher-compact .ai-launcher-input-shell {
  max-width: calc(100% - 8px);
}
</style>
