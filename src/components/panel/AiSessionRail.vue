<template>
  <section class="ai-session-rail">
    <div 
      ref="scrollContainerRef" 
      class="ai-session-rail__scroll scrollbar-hidden"
      @wheel="handleWheelScroll"
    >
      <div
        v-for="session in sessions"
        :key="session.id"
        class="ai-session-rail__item"
        :class="{ 'is-active': session.id === currentSessionId }"
      >
        <div v-if="editingSessionId === session.id" class="ai-session-rail__editor">
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
          <span class="ai-session-rail__title">{{ session.title }}</span>
          <span v-if="session.isRunning" class="ai-session-rail__badge">
            {{ t('Running') }}
          </span>
          <span
            v-else-if="session.hasError"
            class="ai-session-rail__badge ai-session-rail__badge--error"
          >
            {{ t('Error') }}
          </span>
          <span

            v-if="session.id === currentSessionId && sessions.length > 1"

            class="ai-session-rail__close"

            :title="t('Delete session')"

            @click.stop="$emit('delete', session.id)"

          >

            ×

          </span>

        </button>
      </div>
    </div>

    <UiButton
      variant="ghost"
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

const scrollContainerRef = ref(null)

function handleWheelScroll(e) {
  if (!scrollContainerRef.value) return
  const isVertical = Math.abs(e.deltaY) > Math.abs(e.deltaX)
  if (isVertical && e.deltaY !== 0) {
    e.preventDefault()
    scrollContainerRef.value.scrollBy({ left: e.deltaY > 0 ? 50 : -50, behavior: 'smooth' })
  }
}
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
  flex-wrap: nowrap;
  gap: 10px;
  padding: 8px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 28%, transparent);
  overflow: hidden;
}

.ai-session-rail__scroll {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}

.ai-session-rail__item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 0 0 auto; /* Don't grow to fill space randomly */
}

.ai-session-rail__main,
.ai-session-rail__editor {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 200px;
  padding: 4px 10px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: transparent;
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
  background: color-mix(in srgb, var(--surface-hover) 28%, transparent);
}

.ai-session-rail__title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1.4;
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
  flex-wrap: wrap;
  gap: 4px;
  padding-left: 10px;
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

.ai-session-rail__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1;
  padding: 0;
  cursor: pointer;
  margin-left: 2px;
}
.ai-session-rail__close:hover {
  background: color-mix(in srgb, var(--surface-hover) 80%, transparent);
  color: var(--text-primary);
}
.scrollbar-hidden::-webkit-scrollbar {
  display: none;
}
</style>
