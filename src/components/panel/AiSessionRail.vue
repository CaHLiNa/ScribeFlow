<template>
  <section ref="rootRef" class="ai-session-rail">
    <button
      type="button"
      class="ai-session-rail__current"
      :class="{
        'is-open': menuOpen,
        'is-running': currentSession?.isRunning,
        'has-error': currentSession?.hasError,
      }"
      :title="currentSession?.title || t('Session')"
      @click="toggleMenu"
    >
      <span
        class="ai-session-rail__status-dot"
        :class="{
          'is-running': currentSession?.isRunning,
          'has-error': currentSession?.hasError,
        }"
        aria-hidden="true"
      ></span>
      <span class="ai-session-rail__current-title">
        {{ currentSession?.title || t('New session') }}
      </span>
      <IconChevronDown class="ai-session-rail__chevron" :size="14" :stroke-width="2.1" />
    </button>

    <button
      type="button"
      class="ai-session-rail__create"
      :title="t('New session')"
      :aria-label="t('New session')"
      @click="handleCreate"
    >
      <IconPlus :size="14" :stroke-width="2.3" />
    </button>

    <div v-if="menuOpen" class="ai-session-rail__menu">
      <div class="ai-session-rail__menu-list scrollbar-hidden">
        <div
          v-for="session in sessions"
          :key="session.id"
          class="ai-session-rail__item"
          :class="{
            'is-active': session.id === currentSessionId,
            'has-error': session.hasError,
            'is-running': session.isRunning,
          }"
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
            :title="session.title"
            @click="handleSessionClick($event, session.id)"
            @dblclick="handleSessionDoubleClick(session)"
          >
            <span
              class="ai-session-rail__status-dot"
              :class="{
                'is-active': session.id === currentSessionId,
                'is-running': session.isRunning,
                'has-error': session.hasError,
              }"
              aria-hidden="true"
            ></span>
            <span class="ai-session-rail__title">{{ session.title }}</span>
          </button>

          <div v-if="editingSessionId !== session.id" class="ai-session-rail__actions">
            <button
              type="button"
              class="ai-session-rail__action"
              :title="t('Rename session')"
              :aria-label="t('Rename session')"
              @click.stop="beginRename(session)"
            >
              <IconPencil :size="11" :stroke-width="2.1" />
            </button>

            <button
              v-if="sessions.length > 1"
              type="button"
              class="ai-session-rail__action ai-session-rail__action--danger"
              :title="t('Delete session')"
              :aria-label="t('Delete session')"
              @click.stop="$emit('delete', session.id)"
            >
              <IconX :size="12" :stroke-width="2.2" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { IconChevronDown, IconPencil, IconPlus, IconX } from '@tabler/icons-vue'
import { useI18n } from '../../i18n'
import UiInput from '../shared/ui/UiInput.vue'

const props = defineProps({
  sessions: { type: Array, default: () => [] },
  currentSessionId: { type: String, default: '' },
})

const emit = defineEmits(['create', 'switch', 'rename', 'delete'])

const { t } = useI18n()

const rootRef = ref(null)
const editingInputRef = ref(null)
const editingSessionId = ref('')
const editingTitle = ref('')
const menuOpen = ref(false)
let pendingSwitchTimer = null

const currentSession = computed(
  () =>
    props.sessions.find((session) => session.id === props.currentSessionId) ||
    props.sessions[0] ||
    null
)

function closeMenu() {
  clearPendingSwitch()
  menuOpen.value = false
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

function handleCreate() {
  emit('create')
  closeMenu()
}

function handleSwitchFromMenu(sessionId = '') {
  emit('switch', sessionId)
  closeMenu()
}

function clearPendingSwitch() {
  if (pendingSwitchTimer !== null) {
    clearTimeout(pendingSwitchTimer)
    pendingSwitchTimer = null
  }
}

function handleSessionClick(event, sessionId = '') {
  if (event?.detail > 1) return
  clearPendingSwitch()
  pendingSwitchTimer = window.setTimeout(() => {
    pendingSwitchTimer = null
    handleSwitchFromMenu(sessionId)
  }, 180)
}

function handleSessionDoubleClick(session = null) {
  clearPendingSwitch()
  beginRename(session)
}

function handlePointerDown(event) {
  if (!menuOpen.value) return
  if (rootRef.value?.contains(event.target)) return
  closeMenu()
}

function handleEscape(event) {
  if (event.key !== 'Escape') return
  if (editingSessionId.value) {
    cancelRename()
    return
  }
  closeMenu()
}

function beginRename(session = null) {
  const sessionId = String(session?.id || '').trim()
  if (!sessionId) return

  menuOpen.value = true
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

watch(
  () => props.sessions.length,
  () => {
    if (props.sessions.length <= 1) {
      closeMenu()
    }
  }
)

onMounted(() => {
  document.addEventListener('mousedown', handlePointerDown)
  document.addEventListener('keydown', handleEscape)
})

onUnmounted(() => {
  clearPendingSwitch()
  document.removeEventListener('mousedown', handlePointerDown)
  document.removeEventListener('keydown', handleEscape)
})
</script>

<style scoped>
.ai-session-rail {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: auto;
  max-width: 100%;
  min-width: 0;
}

.ai-session-rail__current {
  flex: 0 1 auto;
  min-width: 96px;
  max-width: 212px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 30px;
  padding: 0 11px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    color 160ms ease,
    box-shadow 160ms ease;
}

.ai-session-rail__current:hover,
.ai-session-rail__current.is-open {
  color: var(--text-primary);
}

.ai-session-rail__current.is-open {
  box-shadow: none;
}

.ai-session-rail__current-copy {
  display: none;
}

.ai-session-rail__current-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  color: inherit;
}

.ai-session-rail__chevron {
  flex: 0 0 auto;
  color: var(--text-tertiary);
  transition: transform 160ms ease, color 160ms ease;
}

.ai-session-rail__current.is-open .ai-session-rail__chevron {
  transform: rotate(180deg);
  color: var(--text-secondary);
}

.ai-session-rail__status-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  flex: 0 0 auto;
  background: color-mix(in srgb, var(--accent) 68%, white 32%);
}

.ai-session-rail__status-dot.is-running {
  background: color-mix(in srgb, var(--warning) 80%, white 20%);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--warning) 12%, transparent);
}

.ai-session-rail__status-dot.has-error {
  background: color-mix(in srgb, var(--error) 82%, white 18%);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--error) 10%, transparent);
}

.ai-session-rail__create {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    color 160ms ease,
    transform 160ms ease;
}

.ai-session-rail__create:hover {
  color: var(--text-primary);
}

.ai-session-rail__create:active {
  transform: translateY(0.5px);
}

.ai-session-rail__create:focus-visible,
.ai-session-rail__current:focus-visible,
.ai-session-rail__action:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
}

.ai-session-rail__menu {
  position: absolute;
  left: 0;
  min-width: 204px;
  width: max-content;
  top: calc(100% + 4px);
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--border-color) 18%, transparent);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--surface-base) 12%, transparent),
      color-mix(in srgb, var(--panel-surface) 20%, transparent)
    );
  box-shadow:
    0 6px 18px color-mix(in srgb, black 8%, transparent),
    0 1px 2px color-mix(in srgb, black 4%, transparent);
  backdrop-filter: blur(12px) saturate(1.02);
  isolation: isolate;
}

.ai-session-rail__menu-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 216px;
  overflow-y: auto;
}

.ai-session-rail__item {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  transition: all 160ms ease;
}

.ai-session-rail__item:hover,
.ai-session-rail__item.is-active {
  background: color-mix(in srgb, var(--surface-hover) 36%, transparent);
  border-color: transparent;
}

.ai-session-rail__item.is-active {
  background: color-mix(in srgb, var(--surface-active) 42%, transparent);
  border-color: transparent;
  box-shadow: none;
}

.ai-session-rail__main,
.ai-session-rail__editor {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  width: 100%;
  padding: 6px 8px;
  border: none;
  background: transparent;
}

.ai-session-rail__main {
  appearance: none;
  cursor: pointer;
  color: var(--text-secondary);
  text-align: left;
}

.ai-session-rail__main:hover,
.ai-session-rail__item:hover .ai-session-rail__main,
.ai-session-rail__main.is-active {
  color: var(--text-primary);
}

.ai-session-rail__title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.01em;
}

.ai-session-rail__input {
  min-width: 136px;
}

.ai-session-rail__editor :deep(.ui-input-shell) {
  width: 100%;
  min-width: 136px;
  border-radius: 8px;
  background: color-mix(in srgb, white 12%, transparent);
  box-shadow: none;
}

.ai-session-rail__actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding-right: 4px;
  flex: 0 0 auto;
  opacity: 0;
  transform: translateX(2px);
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}

.ai-session-rail__item.is-active .ai-session-rail__actions,
.ai-session-rail__item:hover .ai-session-rail__actions {
  opacity: 1;
  transform: translateX(0);
}

.ai-session-rail__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-tertiary);
  padding: 0;
  cursor: pointer;
  flex: 0 0 auto;
  transition:
    background-color 140ms ease,
    color 140ms ease,
    border-color 140ms ease;
}

.ai-session-rail__action:hover {
  background: color-mix(in srgb, var(--surface-hover) 88%, transparent);
  border-color: color-mix(in srgb, var(--border-color) 18%, transparent);
  color: var(--text-primary);
}

.ai-session-rail__action--danger:hover {
  color: var(--error);
}

.scrollbar-hidden::-webkit-scrollbar {
  display: none;
}
</style>
