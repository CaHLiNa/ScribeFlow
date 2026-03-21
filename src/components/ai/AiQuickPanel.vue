<template>
  <div class="ai-quick-panel h-full flex flex-col" :class="{ 'ai-quick-panel-compact': compact }">
    <div class="flex-1 min-h-0 overflow-y-auto">
      <div class="ai-quick-shell">
        <div class="ai-quick-context">
          <div class="ai-quick-eyebrow">{{ t('Workflow starts') }}</div>
          <div class="ai-quick-context-label">
            {{ contextLabel }}
          </div>
        </div>

        <div v-if="quickItems.length" class="ai-quick-section">
          <div class="ai-quick-section-title">{{ t('Workflow starters') }}</div>
          <div class="ai-quick-actions">
            <button
              v-for="item in quickItems"
              :key="item.label"
              class="ai-quick-action"
              @click="runQuickItem(item)"
            >
              <div class="ai-quick-action-label">{{ item.label }}</div>
              <div v-if="item.description || item.task?.description" class="ai-quick-action-description">
                {{ item.description || item.task?.description }}
              </div>
              <div v-if="item.meta || item.task?.meta" class="ai-quick-action-meta">
                {{ item.meta || item.task?.meta }}
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="shrink-0 flex justify-center">
      <div class="w-full ai-quick-input-shell">
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
import { computed, ref } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { useChatStore } from '../../stores/chat'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../i18n'
import { getChatInputToolItems, getQuickAiItems } from '../../services/ai/taskCatalog'
import { launchAiTask, launchWorkflowTask, startAiConversation } from '../../services/ai/launch'
import ChatInput from '../chat/ChatInput.vue'

const props = defineProps({
  compact: { type: Boolean, default: false },
})

const editorStore = useEditorStore()
const chatStore = useChatStore()
const workspace = useWorkspaceStore()
const { t } = useI18n()

const chatInputRef = ref(null)
const selectedModelId = ref(workspace.selectedModelId || null)

const currentContextPath = computed(() => editorStore.preferredContextPath || '')
const recentFiles = computed(() => editorStore.recentFiles || [])

const contextLabel = computed(() => {
  const path = currentContextPath.value
  if (!path) return t('Current workspace')
  return String(path).split('/').pop() || t('Current workspace')
})

const quickItems = computed(() => (
  getQuickAiItems({
    currentPath: currentContextPath.value,
    recentFiles: recentFiles.value,
    t,
  })
))

const chatInputToolItems = computed(() => (
  getChatInputToolItems({
    currentPath: currentContextPath.value,
    t,
  })
))

async function sendChat({ text, fileRefs, context }) {
  if (!text && !fileRefs?.length) return
  await startAiConversation({
    editorStore,
    chatStore,
    surface: 'drawer',
    modelId: selectedModelId.value,
    text,
    fileRefs,
    context,
  })
}

async function runQuickItem(item) {
  if (!item?.task) return
  const task = {
    ...item.task,
    label: item.label || item.task.label,
  }
  if (task.action === 'workflow') {
    await launchWorkflowTask({
      editorStore,
      chatStore,
      surface: 'drawer',
      modelId: selectedModelId.value,
      task,
    })
    return
  }
  await launchAiTask({
    editorStore,
    chatStore,
    surface: 'drawer',
    modelId: selectedModelId.value,
    task,
  })
}

async function handleLaunchTask(item) {
  if (!item?.task) return
  await runQuickItem(item)
}

function selectModel(modelId) {
  selectedModelId.value = modelId
  workspace.setSelectedModelId(modelId)
}

function focus() {
  chatInputRef.value?.focus?.()
}

defineExpose({ focus })
</script>

<style scoped>
.ai-quick-shell {
  padding: 14px 12px 10px;
}

.ai-quick-context {
  padding-bottom: 10px;
}

.ai-quick-eyebrow {
  font-size: 11px;
  color: var(--fg-muted);
}

.ai-quick-context-label {
  margin-top: 4px;
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-primary);
  line-height: 1.45;
  word-break: break-word;
}

.ai-quick-section {
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.ai-quick-section-title {
  margin-bottom: 8px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--fg-muted);
}

.ai-quick-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-quick-action {
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-primary);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.14s ease, background-color 0.14s ease;
}

.ai-quick-action:hover {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 6%, var(--bg-primary));
}

.ai-quick-action-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--fg-primary);
  line-height: 1.35;
}

.ai-quick-action-meta {
  margin-top: 3px;
  font-size: 11px;
  color: var(--fg-muted);
  line-height: 1.4;
}

.ai-quick-action-description {
  margin-top: 3px;
  font-size: 11px;
  color: var(--fg-secondary);
  line-height: 1.4;
}

.ai-quick-input-shell {
  width: 100%;
}
</style>
