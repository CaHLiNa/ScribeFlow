<template>
  <div class="ai-shell-sidebar">
    <div class="ai-shell-sidebar-top">
      <div class="ai-shell-sidebar-kicker">{{ t('Recent chats') }}</div>
      <button type="button" class="ai-shell-sidebar-primary" @click="openHome">
        {{ t('New chat') }}
      </button>
    </div>

    <div class="ai-shell-sidebar-list">
      <div
        v-for="item in recentChats"
        :key="item.id"
        class="ai-shell-sidebar-chat-row"
      >
        <button
          type="button"
          class="ai-shell-sidebar-chat"
          :class="{ 'is-active': aiWorkbench.sessionId === item.id && aiWorkbench.view === 'chat' }"
          @click="openRecentChat(item.id)"
        >
          <span class="ai-shell-sidebar-chat-label">{{ chatMeta(item)?.workflowLabel || chatMeta(item)?.label || t('AI') }}</span>
          <span class="ai-shell-sidebar-chat-meta">{{ formatRelativeFromNow(item.updatedAt) }}</span>
        </button>
        <button
          type="button"
          class="ai-shell-sidebar-chat-delete"
          :title="t('Delete chat')"
          @click.stop="deleteChat(item.id)"
        >
          ×
        </button>
      </div>

      <div v-if="recentChats.length === 0" class="ai-shell-sidebar-empty">
        {{ t('No chats yet') }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { ask } from '@tauri-apps/plugin-dialog'
import { useAiWorkbenchStore } from '../../stores/aiWorkbench'
import { useEditorStore } from '../../stores/editor'
import { useChatStore } from '../../stores/chat'
import { useI18n, formatRelativeFromNow } from '../../i18n'

const aiWorkbench = useAiWorkbenchStore()
const editorStore = useEditorStore()
const chatStore = useChatStore()
const { t } = useI18n()

const recentChats = computed(() => [...chatStore.allSessionsMeta].slice(0, 16))

function chatMeta(item) {
  return aiWorkbench.describeSession(item)
}

function openHome() {
  aiWorkbench.openLauncher()
}

function openRecentChat(sessionId) {
  if (!sessionId) return
  aiWorkbench.openSession(sessionId)
}

async function deleteChat(sessionId) {
  if (!sessionId) return
  const yes = await ask(t('Delete this chat permanently?'), {
    title: t('Delete chat'),
    kind: 'warning',
  })
  if (!yes) return

  editorStore.closeFileFromAllPanes(`chat:${sessionId}`)
  chatStore.deleteSession(sessionId)
  if (aiWorkbench.sessionId === sessionId) {
    aiWorkbench.openLauncher()
  }
}
</script>

<style scoped>
.ai-shell-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-primary);
}

.ai-shell-sidebar-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 10px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 68%, transparent);
}

.ai-shell-sidebar-kicker {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  line-height: 1.3;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--fg-muted) 92%, var(--fg-primary));
}

.ai-shell-sidebar-primary {
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  border-radius: 5px;
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-primary));
  color: var(--accent);
  height: 22px;
  padding: 0 7px;
  font-size: 0.76rem;
  cursor: pointer;
}

.ai-shell-sidebar-primary:hover {
  background: color-mix(in srgb, var(--accent) 14%, var(--bg-hover));
}

.ai-shell-sidebar-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 10px;
}

.ai-shell-sidebar-title {
  font-size: 0.96rem;
  line-height: 1.35;
  font-weight: 600;
  color: var(--fg-primary);
  overflow-wrap: anywhere;
}

.ai-shell-sidebar-copy {
  font-size: 0.8rem;
  line-height: 1.6;
  color: var(--fg-muted);
  overflow-wrap: anywhere;
}

.ai-shell-sidebar-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  padding: 10px 8px;
  overflow: auto;
}

.ai-shell-sidebar-chat-row {
  display: flex;
  align-items: stretch;
  gap: 6px;
}

.ai-shell-sidebar-chat {
  width: 100%;
  flex: 1 1 auto;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--fg-primary);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  padding: 8px 26px 8px 10px;
  text-align: left;
  cursor: pointer;
  transition: background-color 120ms ease;
}

.ai-shell-sidebar-chat:hover {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.ai-shell-sidebar-chat.is-active {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.ai-shell-sidebar-chat-label {
  width: 100%;
  font-size: 0.86rem;
  line-height: 1.4;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-shell-sidebar-chat-meta {
  font-size: 0.76rem;
  line-height: 1.4;
  color: var(--fg-muted);
}

.ai-shell-sidebar-chat-delete {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  align-self: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--fg-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.ai-shell-sidebar-chat-delete:hover {
  background: color-mix(in srgb, var(--bg-hover) 72%, transparent);
  color: var(--fg-primary);
}

.ai-shell-sidebar-empty {
  padding: 4px 10px;
  font-size: 0.8rem;
  line-height: 1.6;
  color: var(--fg-muted);
}
</style>
