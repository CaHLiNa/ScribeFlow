<template>
  <section ref="rootRef" class="ai-session-rail">
    <div class="ai-session-rail__strip-wrap">
      <div
        v-if="fadeState.left"
        class="ai-session-rail__fade ai-session-rail__fade--left"
        aria-hidden="true"
      ></div>

      <div ref="scrollRef" class="ai-session-rail__strip scrollbar-hidden">
        <div
          v-for="session in sessions"
          :key="session.id"
          class="ai-session-rail__tab-shell"
          :class="{
            'is-active': session.id === currentSessionId,
            'is-running': session.isRunning,
            'has-error': session.hasError,
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
            class="ai-session-rail__tab"
            :class="{ 'is-active': session.id === currentSessionId }"
            :title="session.title"
            @click="$emit('switch', session.id)"
            @dblclick="beginRename(session)"
          >
            <span
              class="ai-session-rail__status-dot"
              :class="{
                'is-running': session.isRunning,
                'has-error': session.hasError,
              }"
              aria-hidden="true"
            ></span>
            <span class="ai-session-rail__title">{{ session.title }}</span>
            <span v-if="session.isRunning" class="ai-session-rail__running-pill">
              {{ t('Running') }}
            </span>
          </button>

          <button
            v-if="editingSessionId !== session.id && sessions.length > 1"
            type="button"
            class="ai-session-rail__close"
            :title="t('Delete session')"
            :aria-label="t('Delete session')"
            @click.stop="$emit('delete', session.id)"
          >
            <IconX :size="12" :stroke-width="2.15" />
          </button>
        </div>
      </div>

      <div
        v-if="fadeState.right"
        class="ai-session-rail__fade ai-session-rail__fade--right"
        aria-hidden="true"
      ></div>
    </div>

    <button
      type="button"
      class="ai-session-rail__create"
      :title="t('New session')"
      :aria-label="t('New session')"
      @click="$emit('create')"
    >
      <IconPlus :size="15" :stroke-width="2.4" />
    </button>
  </section>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { IconPlus, IconX } from '@tabler/icons-vue'
import { useI18n } from '../../i18n'
import UiInput from '../shared/ui/UiInput.vue'

const props = defineProps({
  sessions: { type: Array, default: () => [] },
  currentSessionId: { type: String, default: '' },
})

const emit = defineEmits(['create', 'switch', 'rename', 'delete'])
const { t } = useI18n()

const rootRef = ref(null)
const scrollRef = ref(null)
const editingInputRef = ref(null)
const editingSessionId = ref('')
const editingTitle = ref('')
const fadeState = ref({ left: false, right: false })
let resizeObserver = null

function updateFadeState() {
  const el = scrollRef.value
  if (!el) return
  const { scrollLeft, clientWidth, scrollWidth } = el
  const hasOverflow = scrollWidth - clientWidth > 2
  fadeState.value = {
    left: hasOverflow && scrollLeft > 6,
    right: hasOverflow && scrollLeft + clientWidth < scrollWidth - 6,
  }
}

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

function handleScroll() {
  updateFadeState()
}

onMounted(() => {
  const el = scrollRef.value
  el?.addEventListener('scroll', handleScroll, { passive: true })
  if (typeof ResizeObserver !== 'undefined' && el) {
    resizeObserver = new ResizeObserver(() => updateFadeState())
    resizeObserver.observe(el)
  }
  updateFadeState()
})

onBeforeUnmount(() => {
  scrollRef.value?.removeEventListener('scroll', handleScroll)
  resizeObserver?.disconnect?.()
  resizeObserver = null
})

watch(
  () => props.sessions.length,
  () => {
    nextTick(() => updateFadeState())
  },
  { immediate: true }
)

watch(
  () => props.currentSessionId,
  () => {
    if (editingSessionId.value && editingSessionId.value !== props.currentSessionId) {
      cancelRename()
    }
    nextTick(() => updateFadeState())
  }
)
</script>

<style scoped>
.ai-session-rail {
  display: flex;
  align-items: stretch;
  gap: 0;
  min-width: 0;
  width: 100%;
  height: 40px;
  border-top: 1px solid var(--border-base, color-mix(in srgb, var(--border-color) 24%, transparent));
  border-left: 1px solid var(--border-base, color-mix(in srgb, var(--border-color) 24%, transparent));
  border-right: 1px solid var(--border-base, color-mix(in srgb, var(--border-color) 24%, transparent));
  background: color-mix(in srgb, var(--surface-hover) 26%, transparent);
}

.ai-session-rail__strip-wrap {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
}

.ai-session-rail__strip {
  display: flex;
  align-items: stretch;
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  min-width: 0;
  scrollbar-width: none;
}

.ai-session-rail__strip::-webkit-scrollbar {
  display: none;
}

.ai-session-rail__tab-shell {
  position: relative;
  display: flex;
  align-items: stretch;
  flex: 0 0 auto;
  min-width: 0;
  max-width: 220px;
  border-right: 1px solid var(--border-base, color-mix(in srgb, var(--border-color) 24%, transparent));
}

.ai-session-rail__tab {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
  padding: 0 12px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
  transition: background-color 140ms ease, color 140ms ease;
}

.ai-session-rail__tab:hover {
  background: color-mix(in srgb, var(--surface-hover) 44%, transparent);
  color: var(--text-primary);
}

.ai-session-rail__tab.is-active {
  background: color-mix(in srgb, var(--surface-base) 68%, transparent);
  color: var(--text-primary);
  font-weight: 600;
}

.ai-session-rail__status-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  flex: 0 0 auto;
  background: color-mix(in srgb, var(--text-tertiary) 68%, transparent);
}

.ai-session-rail__status-dot.is-running {
  background: color-mix(in srgb, var(--warning) 82%, white 18%);
}

.ai-session-rail__status-dot.has-error {
  background: color-mix(in srgb, var(--error) 82%, white 18%);
}

.ai-session-rail__title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 1.2;
}

.ai-session-rail__running-pill {
  flex: 0 0 auto;
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--warning) 14%, transparent);
  font-size: 10px;
  line-height: 1.2;
  color: color-mix(in srgb, var(--warning) 82%, var(--text-primary) 18%);
}

.ai-session-rail__close,
.ai-session-rail__create {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease;
}

.ai-session-rail__close {
  opacity: 0;
}

.ai-session-rail__tab-shell:hover .ai-session-rail__close,
.ai-session-rail__tab-shell.is-active .ai-session-rail__close {
  opacity: 1;
}

.ai-session-rail__close:hover,
.ai-session-rail__create:hover {
  background: color-mix(in srgb, var(--surface-hover) 50%, transparent);
  color: var(--text-primary);
}

.ai-session-rail__create {
  flex: 0 0 auto;
  border-left: 1px solid var(--border-base, color-mix(in srgb, var(--border-color) 24%, transparent));
}

.ai-session-rail__editor {
  display: flex;
  align-items: center;
  padding: 5px 8px;
  min-width: 180px;
  background: color-mix(in srgb, var(--surface-base) 62%, transparent);
}

.ai-session-rail__input {
  width: 100%;
}

.ai-session-rail__editor :deep(.ui-input-shell) {
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-base) 92%, transparent);
}

.ai-session-rail__fade {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 28px;
  pointer-events: none;
  z-index: 1;
}

.ai-session-rail__fade--left {
  left: 0;
  background: linear-gradient(90deg, color-mix(in srgb, var(--surface-hover) 56%, transparent), transparent);
}

.ai-session-rail__fade--right {
  right: 0;
  background: linear-gradient(270deg, color-mix(in srgb, var(--surface-hover) 56%, transparent), transparent);
}
</style>
