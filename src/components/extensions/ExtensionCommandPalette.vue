<template>
  <UiModalShell
    :visible="visible"
    size="lg"
    position="center"
    :body-padding="false"
    surface-class="extension-command-palette"
    overlay-class="extension-command-palette-overlay"
    @close="close"
  >
    <div class="command-palette-shell">
      <div class="command-palette-search">
        <UiInput
          ref="inputRef"
          v-model="query"
          size="lg"
          variant="ghost"
          :placeholder="t('Command')"
          @keydown="handleInputKeydown"
        />
      </div>

      <div class="command-palette-list" role="listbox">
        <button
          v-for="(command, index) in filteredCommands"
          :key="`${command.extensionId}:${command.commandId}`"
          type="button"
          class="command-palette-row"
          :class="{ 'is-active': index === activeIndex }"
          :disabled="busy"
          role="option"
          :aria-selected="index === activeIndex"
          @mouseenter="activeIndex = index"
          @mousedown.prevent="execute(command)"
        >
          <div class="command-palette-row-main">
            <span class="command-palette-title">{{ t(command.title || command.commandId) }}</span>
            <span class="command-palette-extension">{{ command.extensionName }}</span>
          </div>
          <span class="command-palette-id">{{ command.commandId }}</span>
        </button>

        <div v-if="filteredCommands.length === 0" class="command-palette-empty">
          {{ t('No extension commands found') }}
        </div>
      </div>
    </div>
  </UiModalShell>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from '../../i18n'
import { useExtensionsStore } from '../../stores/extensions'
import { useToastStore } from '../../stores/toast'
import UiInput from '../shared/ui/UiInput.vue'
import UiModalShell from '../shared/ui/UiModalShell.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  target: { type: Object, default: () => ({}) },
  context: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['close', 'executed'])

const { t } = useI18n()
const extensionsStore = useExtensionsStore()
const toastStore = useToastStore()
const query = ref('')
const activeIndex = ref(0)
const inputRef = ref(null)
const busy = ref(false)

const availableCommands = computed(() => {
  return extensionsStore.commandPaletteCommandsForContext(props.context)
})

const filteredCommands = computed(() => {
  const normalized = query.value.trim().toLowerCase()
  if (!normalized) return availableCommands.value
  return availableCommands.value.filter((command) =>
    [
      command.title,
      command.category,
      command.commandId,
      command.extensionName,
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalized)
  )
})

watch(
  () => props.visible,
  async (isVisible) => {
    if (!isVisible) return
    query.value = ''
    activeIndex.value = 0
    await extensionsStore.refreshRegistry().catch(() => {})
    await nextTick()
    inputRef.value?.focus?.()
  }
)

watch(filteredCommands, () => {
  if (activeIndex.value >= filteredCommands.value.length) {
    activeIndex.value = Math.max(0, filteredCommands.value.length - 1)
  }
})

function close() {
  emit('close')
}

function move(delta) {
  const total = filteredCommands.value.length
  if (!total) return
  activeIndex.value = (activeIndex.value + delta + total) % total
}

async function execute(command = null) {
  if (busy.value) return
  const selected = command || filteredCommands.value[activeIndex.value]
  if (!selected) return
  busy.value = true
  try {
    const task = await extensionsStore.executeCommand(selected, props.target)
    emit('executed', task)
    toastStore.show(t('Extension task started'), { type: 'success', duration: 2400 })
    close()
  } catch (error) {
    toastStore.show(error?.message || String(error || t('Failed to start extension task')), {
      type: 'error',
      duration: 4200,
    })
  } finally {
    busy.value = false
  }
}

function handleInputKeydown(event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    void execute()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}
</script>

<style scoped>
:global(.extension-command-palette-overlay) {
  align-items: flex-start;
  padding-top: min(12vh, 92px);
}

:global(.extension-command-palette) {
  width: min(720px, calc(100vw - 32px));
  border-radius: 8px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-raised) 96%, white 4%), var(--surface-raised));
  box-shadow:
    0 22px 60px rgba(0, 0, 0, 0.28),
    0 0 0 1px color-mix(in srgb, var(--border-subtle) 85%, transparent);
}

.command-palette-shell {
  display: flex;
  min-height: 0;
  max-height: min(560px, calc(100vh - 140px));
  flex-direction: column;
}

.command-palette-search {
  flex: 0 0 auto;
  padding: 10px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 42%, transparent);
}

.command-palette-search :deep(.ui-input-shell) {
  height: 38px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--surface-base) 86%, transparent);
}

.command-palette-search :deep(.ui-input-control) {
  font-size: 14px;
}

.command-palette-list {
  min-height: 0;
  overflow-y: auto;
  padding: 4px;
}

.command-palette-row {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(120px, 240px);
  align-items: center;
  gap: 16px;
  border: 0;
  border-radius: 6px;
  padding: 9px 10px;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}

.command-palette-row:disabled {
  cursor: wait;
}

.command-palette-row.is-active,
.command-palette-row:hover {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface-hover));
}

.command-palette-row-main {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.command-palette-title {
  min-width: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-palette-extension,
.command-palette-id {
  min-width: 0;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-palette-id {
  justify-self: end;
  font-family: var(--font-mono);
}

.command-palette-empty {
  padding: 22px 12px;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}

@media (max-width: 640px) {
  :global(.extension-command-palette-overlay) {
    padding: 10px;
  }

  .command-palette-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }

  .command-palette-id {
    justify-self: start;
  }
}
</style>
