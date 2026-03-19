<template>
  <div
    ref="drawerRef"
    class="ai-drawer h-full flex flex-col"
    :class="{ 'ai-drawer-compact': isCompact }"
    style="background: var(--bg-primary);"
  >
    <div class="ai-drawer-header">
      <div class="ai-drawer-header-left">
        <button
          v-if="drawer.view === 'chat'"
          class="ai-drawer-icon-btn"
          :title="t('AI')"
          :aria-label="t('AI')"
          @click="drawer.openLauncher()"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M7.5 2.5L4 6l3.5 3.5"/>
          </svg>
        </button>
        <div class="ai-drawer-title-wrap">
          <div class="ai-drawer-title">{{ headerTitle }}</div>
          <div v-if="headerMeta" class="ai-drawer-meta">{{ headerMeta }}</div>
        </div>
      </div>

      <button
        class="ai-drawer-icon-btn"
        :title="t('Close AI')"
        :aria-label="t('Close AI')"
        @click="drawer.close()"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M2 2l6 6M8 2l-6 6"/>
        </svg>
      </button>
    </div>

    <div class="flex-1 min-h-0 overflow-hidden">
      <AiLauncher
        v-if="drawer.view === 'launcher'"
        pane-id="ai-drawer"
        surface="drawer"
        :compact="isCompact"
      />
      <div v-else class="h-full">
        <ChatSession
          v-if="session"
          :key="session.id"
          :session="session"
          :sessionMeta="sessionMeta"
          :compact="isCompact"
          paneId="ai-drawer"
          surface="drawer"
        />
        <div
          v-else
          class="h-full flex items-center justify-center ui-text-base"
          style="color: var(--fg-muted);"
        >
          {{ t('Loading chat session...') }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAiDrawerStore } from '../../stores/aiDrawer'
import { useAiWorkbenchStore } from '../../stores/aiWorkbench'
import { useChatStore } from '../../stores/chat'
import { useI18n } from '../../i18n'
import AiLauncher from '../editor/AiLauncher.vue'
import ChatSession from '../chat/ChatSession.vue'

const drawer = useAiDrawerStore()
const aiWorkbench = useAiWorkbenchStore()
const chatStore = useChatStore()
const { t } = useI18n()
const drawerRef = ref(null)
const drawerWidth = ref(0)
let resizeObserver = null

const isCompact = computed(() => drawerWidth.value > 0 && drawerWidth.value < 430)

const session = computed(() => (
  drawer.sessionId
    ? chatStore.sessions.find((item) => item.id === drawer.sessionId) || null
    : null
))

const sessionMeta = computed(() => (
  session.value ? aiWorkbench.describeSession(session.value) : null
))

const headerTitle = computed(() => {
  if (drawer.view === 'chat') {
    return sessionMeta.value?.label || session.value?.label || t('AI')
  }
  return t('AI')
})

const headerMeta = computed(() => {
  if (drawer.view !== 'chat') return t('Launcher')
  if (!sessionMeta.value) return ''
  return `${sessionMeta.value.roleTitle} · ${sessionMeta.value.runtimeTitle}`
})

watch(
  () => [drawer.view, drawer.sessionId],
  async ([view, sessionId]) => {
    if (view !== 'chat' || !sessionId) return
    let current = chatStore.sessions.find((item) => item.id === sessionId) || null
    if (!current) {
      await chatStore.reopenSession(sessionId, { skipArchive: true })
      current = chatStore.sessions.find((item) => item.id === sessionId) || null
    }
    if (!current) {
      drawer.openLauncher()
      return
    }
    chatStore.activeSessionId = sessionId
  },
  { immediate: true },
)

onMounted(() => {
  if (typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries?.[0]
    if (!entry) return
    drawerWidth.value = entry.contentRect?.width || 0
  })
  if (drawerRef.value) {
    resizeObserver.observe(drawerRef.value)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect?.()
  resizeObserver = null
})
</script>

<style scoped>
.ai-drawer {
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}

.ai-drawer-header {
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 8px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-secondary) 88%, transparent);
}

.ai-drawer-header-left {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.ai-drawer-title-wrap {
  min-width: 0;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
}

.ai-drawer-title {
  min-width: 0;
  font-size: var(--ui-font-label);
  font-weight: 600;
  color: var(--fg-primary);
  white-space: normal;
  line-height: 1.35;
}

.ai-drawer-meta {
  min-width: 0;
  font-size: var(--ui-font-caption);
  color: var(--fg-muted);
  white-space: normal;
  line-height: 1.35;
}

.ai-drawer-icon-btn {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--fg-muted);
  cursor: pointer;
  transition: background-color 0.14s ease, color 0.14s ease;
}

.ai-drawer-icon-btn:hover {
  background: var(--bg-hover);
  color: var(--fg-primary);
}

.ai-drawer-compact .ai-drawer-header {
  align-items: flex-start;
  padding-top: 6px;
  padding-bottom: 6px;
}

.ai-drawer-compact .ai-drawer-title-wrap {
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
</style>
