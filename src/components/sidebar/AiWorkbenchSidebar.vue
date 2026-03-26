<template>
  <div class="ai-shell-sidebar">
    <div class="ai-shell-sidebar-top">
      <div class="ai-shell-sidebar-kicker">{{ t('Recent chats') }}</div>
      <UiButton variant="primary" size="sm" class="ai-shell-sidebar-primary" @click="openHome">
        {{ t('New chat') }}
      </UiButton>
    </div>

    <div class="ai-shell-sidebar-list">
      <div v-for="item in recentChats" :key="item.id" class="ai-shell-sidebar-chat-row">
        <UiButton
          variant="ghost"
          size="sm"
          block
          content-mode="raw"
          class="ai-shell-sidebar-chat"
          :active="aiWorkbench.sessionId === item.id && aiWorkbench.view === 'chat'"
          @click="openRecentChat(item.id)"
        >
          <span class="ai-shell-sidebar-chat-label">{{
            chatMeta(item)?.workflowLabel || chatMeta(item)?.label || t('AI')
          }}</span>
          <span class="ai-shell-sidebar-chat-meta">{{
            formatRelativeFromNow(item.updatedAt)
          }}</span>
        </UiButton>
        <UiButton
          variant="ghost"
          size="icon-xs"
          icon-only
          class="ai-shell-sidebar-chat-delete"
          :title="t('Delete chat')"
          :aria-label="t('Delete chat')"
          @click.stop="deleteChat(item.id)"
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
import UiButton from '../shared/ui/UiButton.vue'

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
  height: 26px;
  min-height: 26px;
  box-sizing: border-box;
  gap: 4px;
  padding: 0 3px 0 6px;
  border-bottom: 1px solid var(--border);
}

.ai-shell-sidebar-kicker {
  font-size: var(--sidebar-font-kicker);
  font-weight: 600;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--fg-muted) 92%, var(--fg-primary));
}

.ai-shell-sidebar-primary {
  min-height: 20px;
  padding: 0 6px;
  font-size: var(--sidebar-font-control);
  line-height: 1;
}

.ai-shell-sidebar-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 10px;
}

.ai-shell-sidebar-title {
  font-size: var(--sidebar-font-title);
  line-height: 1.35;
  font-weight: 600;
  color: var(--fg-primary);
  overflow-wrap: anywhere;
}

.ai-shell-sidebar-copy {
  font-size: var(--sidebar-font-body);
  line-height: 1.6;
  color: var(--fg-muted);
  overflow-wrap: anywhere;
}

.ai-shell-sidebar-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  padding: 8px 8px;
  overflow: auto;
}

.ai-shell-sidebar-chat-row {
  display: flex;
  align-items: stretch;
  gap: 6px;
}

.ai-shell-sidebar-chat {
  flex: 1 1 auto;
  align-items: flex-start;
  justify-content: flex-start;
  width: 100%;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 26px 8px 10px;
  text-align: left;
  transition: background-color 120ms ease;
}

.ai-shell-sidebar-chat:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.ai-shell-sidebar-chat.is-active {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--text-primary);
}

.ai-shell-sidebar-chat-label {
  width: 100%;
  font-size: var(--sidebar-font-item);
  line-height: 1.4;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-shell-sidebar-chat-meta {
  font-size: var(--sidebar-font-meta);
  line-height: 1.4;
  color: var(--fg-muted);
}

.ai-shell-sidebar-chat-delete {
  flex: 0 0 auto;
  align-self: center;
  color: var(--text-muted);
}

.ai-shell-sidebar-chat-delete:hover:not(:disabled) {
  background: color-mix(in srgb, var(--bg-hover) 72%, transparent);
  color: var(--text-primary);
}

.ai-shell-sidebar-empty {
  padding: 4px 10px;
  font-size: var(--sidebar-font-body);
  line-height: 1.6;
  color: var(--fg-muted);
}
</style>
