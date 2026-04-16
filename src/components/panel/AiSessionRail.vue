<template>
  <section class="ai-session-rail">
    <div class="ai-session-rail__scroll scrollbar-hidden">
      <div
        v-for="session in sessions"
        :key="session.id"
        class="ai-session-rail__item"
        :class="{ 'is-active': session.id === currentSessionId }"
      >
        <div
          v-if="editingSessionId === session.id"
          class="ai-session-rail__editor"
        >
          <UiInput
            ref="editingInputRef"
            :model-value="editingTitle"
            size="sm"
            class="ai-session-rail__input"
            @update:model-value="editingTitle = String($event || '')"
            @keydown="handleRenameKeydown($event, session.id)"
            @blur="commitRename(session.id)"
          />
        </div>

        <button
          v-else
          type="button"
          class="ai-session-rail__main"
          :class="{ 'is-active': session.id === currentSessionId }"
          @click="$emit('switch', session.id)"
          @dblclick="beginRename(session)"
        >
          <span class="ai-session-rail__mode">
            {{ session.mode === 'chat' ? t('Chat') : t('Agent') }}
          </span>
          <span class="ai-session-rail__title">{{ session.title }}</span>
          <span
            v-if="session.isRunning"
            class="ai-session-rail__badge"
          >
            {{ t('Running') }}
          </span>
          <span
            v-else-if="session.hasError"
            class="ai-session-rail__badge ai-session-rail__badge--error"
          >
            {{ t('Error') }}
          </span>
        </button>

        <div
          v-if="editingSessionId !== session.id && session.id === currentSessionId"
          class="ai-session-rail__actions"
        >
          <UiButton
            variant="ghost"
            size="sm"
            :title="t('Rename session')"
            @click.stop="beginRename(session)"
          >
            {{ t('Rename') }}
          </UiButton>
          <UiButton
            v-if="sessions.length > 1"
            variant="ghost"
            size="sm"
            :title="t('Delete session')"
            @click.stop="$emit('delete', session.id)"
          >
            {{ t('Delete') }}
          </UiButton>
        </div>
      </div>
    </div>

    <UiButton
      variant="secondary"
      size="sm"
      class="ai-session-rail__create"
      @click="$emit('create')"
    >
      {{ t('New session') }}
    </UiButton>
  </section>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'
import UiInput from '../shared/ui/UiInput.vue'

const props = defineProps({
  sessions: { type: Array, default: () => [] },
  currentSessionId: { type: String, default: '' },
})

const emit = defineEmits(['create', 'switch', 'rename', 'delete'])

const { t } = useI18n()
const editingInputRef = ref(null)
const editingSessionId = ref('')
const editingTitle = ref('')

function beginRename(session = null) {
  const sessionId = String(session?.id || '').trim()
  if (!sessionId) return

  editingSessionId.value = sessionId
  editingTitle.value = String(session?.title || '')

  nextTick(() => {
    editingInputRef.value?.focus?.()
    editingInputRef.value?.select?.()
  })
}

function cancelRename() {
  editingSessionId.value = ''
  editingTitle.value = ''
}

function commitRename(sessionId = '') {
  const normalizedTitle = String(editingTitle.value || '').trim()
  if (editingSessionId.value !== sessionId) return
  if (normalizedTitle) {
    emit('rename', {
      sessionId,
      title: normalizedTitle,
    })
  }
  cancelRename()
}

function handleRenameKeydown(event, sessionId = '') {
  if (event.key === 'Enter') {
    event.preventDefault()
    commitRename(sessionId)
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    cancelRename()
  }
}

watch(
  () => props.currentSessionId,
  () => {
    if (editingSessionId.value && editingSessionId.value !== props.currentSessionId) {
      cancelRename()
    }
  }
)
</script>

<style scoped>
.ai-session-rail {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px 6px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 28%, transparent);
}

.ai-session-rail__scroll {
  display: flex;
  align-items: stretch;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  padding-bottom: 2px;
}

.ai-session-rail__item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.ai-session-rail__main,
.ai-session-rail__editor {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 240px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--border-color) 52%, transparent);
  background: color-mix(in srgb, var(--surface-base) 76%, transparent);
}

.ai-session-rail__main {
  appearance: none;
  cursor: pointer;
  color: var(--text-secondary);
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    color 140ms ease;
}

.ai-session-rail__main:hover,
.ai-session-rail__main.is-active {
  color: var(--text-primary);
  border-color: color-mix(in srgb, var(--accent) 28%, var(--border-color) 72%);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface-base) 90%);
}

.ai-session-rail__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1.4;
}

.ai-session-rail__mode {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--text-secondary);
  font-size: 10px;
}

.ai-session-rail__badge {
  flex: 0 0 auto;
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--warning) 14%, transparent);
  color: var(--text-secondary);
  font-size: 10px;
}

.ai-session-rail__badge--error {
  background: color-mix(in srgb, var(--error) 12%, transparent);
  color: var(--error);
}

.ai-session-rail__actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ai-session-rail__input {
  min-width: 148px;
}

.ai-session-rail__editor :deep(.ui-input-shell) {
  min-width: 148px;
  border-radius: 999px;
  background: transparent;
  box-shadow: none;
}

.ai-session-rail__create {
  flex: 0 0 auto;
}
</style>
