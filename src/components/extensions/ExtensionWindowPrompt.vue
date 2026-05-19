<template>
  <UiModalShell
    :visible="visible"
    size="lg"
    position="center"
    :body-padding="false"
    surface-class="extension-window-prompt"
    overlay-class="extension-window-prompt-overlay"
    :close-on-backdrop="!busy"
    @close="close"
  >
    <div class="extension-window-prompt__shell">
      <div class="extension-window-prompt__header">
        <div class="extension-window-prompt__title">{{ titleText }}</div>
        <div v-if="subtitleText" class="extension-window-prompt__subtitle">{{ subtitleText }}</div>
      </div>

      <div v-if="isQuickPick" class="extension-window-prompt__body">
        <div class="extension-window-prompt__search">
          <UiInput
            ref="inputRef"
            v-model="query"
            size="lg"
            variant="ghost"
            :placeholder="placeholderText"
            @keydown="handleQuickPickKeydown"
          />
        </div>
        <div
          class="extension-window-prompt__list"
          role="listbox"
          :aria-multiselectable="supportsMultiSelect ? 'true' : 'false'"
        >
          <button
            v-for="(item, index) in filteredItems"
            :key="item.id"
            type="button"
            class="extension-window-prompt__item"
            :class="{ 'is-active': index === activeIndex, 'is-selected': isItemSelected(item.id) }"
            :aria-selected="supportsMultiSelect ? String(isItemSelected(item.id)) : String(index === activeIndex)"
            :disabled="busy"
            @mouseenter="activeIndex = index"
            @mousedown.prevent="handleQuickPickPointer(item)"
          >
            <div class="extension-window-prompt__item-main">
              <span
                v-if="supportsMultiSelect"
                class="extension-window-prompt__item-check"
                aria-hidden="true"
              >
                {{ isItemSelected(item.id) ? '✓' : '' }}
              </span>
              <span class="extension-window-prompt__item-label">{{ item.label }}</span>
              <span v-if="item.description" class="extension-window-prompt__item-description">{{ item.description }}</span>
            </div>
            <span v-if="item.detail" class="extension-window-prompt__item-detail">{{ item.detail }}</span>
          </button>
          <div v-if="filteredItems.length === 0" class="extension-window-prompt__empty">
            {{ t('No matching items') }}
          </div>
        </div>
      </div>

      <div v-else class="extension-window-prompt__body extension-window-prompt__body--input">
        <div v-if="promptText" class="extension-window-prompt__prompt">{{ promptText }}</div>
        <UiInput
          ref="inputRef"
          v-model="inputValue"
          size="lg"
          variant="ghost"
          :type="request?.password ? 'password' : 'text'"
          :placeholder="placeholderText"
          @keydown="handleInputBoxKeydown"
        />
      </div>

      <div class="extension-window-prompt__footer">
        <button type="button" class="extension-window-prompt__button" :disabled="busy" @click="close">
          {{ t('Cancel') }}
        </button>
        <button
          type="button"
          class="extension-window-prompt__button extension-window-prompt__button--primary"
          :disabled="busy || confirmDisabled"
          @click="submitPrimary"
        >
          {{ t('Confirm') }}
        </button>
      </div>
    </div>
  </UiModalShell>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from '../../i18n'
import {
  isQuickPickItemSelected,
  resolveQuickPickSubmission,
  seedQuickPickSelection,
  toggleQuickPickSelection,
} from '../../domains/extensions/extensionWindowPromptState.ts'
import UiInput from '../shared/ui/UiInput.vue'
import UiModalShell from '../shared/ui/UiModalShell.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  request: { type: Object, default: null },
})

const emit = defineEmits(['cancel', 'submit'])

const { t } = useI18n()
const inputRef = ref(null)
const query = ref('')
const inputValue = ref('')
const activeIndex = ref(0)
const selectedItemIds = ref([])

const isQuickPick = computed(() => String(props.request?.kind || '') === 'quickPick')
const supportsMultiSelect = computed(() => isQuickPick.value && Boolean(props.request?.canPickMany))
const placeholderText = computed(() => props.request?.placeholder || t('Type to filter'))
const titleText = computed(() => props.request?.title || (isQuickPick.value ? t('Select item') : t('Input required')))
const subtitleText = computed(() => props.request?.extensionId || '')
const promptText = computed(() => props.request?.prompt || '')
const filteredItems = computed(() => {
  const items = Array.isArray(props.request?.items) ? props.request.items : []
  const normalized = query.value.trim().toLowerCase()
  if (!normalized) return items
  return items.filter((item) =>
    [item.label, item.description, item.detail]
      .join(' ')
      .toLowerCase()
      .includes(normalized)
  )
})
const confirmDisabled = computed(() =>
  isQuickPick.value
    ? supportsMultiSelect.value
      ? selectedItemIds.value.length === 0
      : filteredItems.value.length === 0
    : String(inputValue.value || '').trim().length === 0
)

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return
    query.value = ''
    inputValue.value = String(props.request?.value || '')
    activeIndex.value = 0
    selectedItemIds.value = seedQuickPickSelection(props.request?.items)
    await nextTick()
    inputRef.value?.focus?.()
  }
)

watch(filteredItems, () => {
  if (activeIndex.value >= filteredItems.value.length) {
    activeIndex.value = Math.max(0, filteredItems.value.length - 1)
  }
})

function close() {
  if (props.busy) return
  emit('cancel')
}

function move(delta) {
  const total = filteredItems.value.length
  if (!total) return
  activeIndex.value = (activeIndex.value + delta + total) % total
}

function submitQuickPick(item = null) {
  if (props.busy) return
  const result = resolveQuickPickSubmission({
    requestItems: props.request?.items,
    filteredItems: filteredItems.value,
    activeIndex: activeIndex.value,
    selectedItemIds: selectedItemIds.value,
    canPickMany: supportsMultiSelect.value,
    explicitItem: item,
  })
  if (supportsMultiSelect.value) {
    if (!Array.isArray(result) || result.length === 0) return
    emit('submit', result)
    return
  }
  if (typeof result === 'undefined') return
  emit('submit', result)
}

function toggleSelectedItem(itemId = '') {
  selectedItemIds.value = toggleQuickPickSelection(selectedItemIds.value, itemId)
}

function isItemSelected(itemId = '') {
  return isQuickPickItemSelected(selectedItemIds.value, itemId)
}

function handleQuickPickPointer(item = null) {
  if (!item || props.busy) return
  if (supportsMultiSelect.value) {
    toggleSelectedItem(item.id)
    return
  }
  submitQuickPick(item)
}

function submitInputBox() {
  if (props.busy) return
  emit('submit', String(inputValue.value || ''))
}

function submitPrimary() {
  if (isQuickPick.value) {
    submitQuickPick()
  } else {
    submitInputBox()
  }
}

function handleQuickPickKeydown(event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    if (supportsMultiSelect.value) {
      const target = filteredItems.value[activeIndex.value]
      if (!target) return
      if (selectedItemIds.value.length === 0 || !isItemSelected(target.id)) {
        toggleSelectedItem(target.id)
        return
      }
    }
    submitQuickPick()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

function handleInputBoxKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault()
    submitInputBox()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}
</script>

<style scoped>
:global(.extension-window-prompt-overlay) {
  align-items: flex-start;
  padding-top: min(14vh, 96px);
}

:global(.extension-window-prompt) {
  width: min(720px, calc(100vw - 32px));
  border-radius: 8px;
}

.extension-window-prompt__shell {
  display: flex;
  min-height: 0;
  max-height: min(560px, calc(100vh - 140px));
  flex-direction: column;
}

.extension-window-prompt__header,
.extension-window-prompt__footer {
  flex: 0 0 auto;
  padding: 12px;
}

.extension-window-prompt__header {
  border-bottom: 1px solid color-mix(in srgb, var(--border) 42%, transparent);
}

.extension-window-prompt__title {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
}

.extension-window-prompt__subtitle,
.extension-window-prompt__prompt,
.extension-window-prompt__empty,
.extension-window-prompt__item-description,
.extension-window-prompt__item-detail {
  color: var(--text-muted);
  font-size: 11px;
}

.extension-window-prompt__subtitle,
.extension-window-prompt__prompt {
  margin-top: 4px;
}

.extension-window-prompt__body {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
}

.extension-window-prompt__body--input {
  gap: 10px;
  padding: 12px;
}

.extension-window-prompt__search {
  padding: 10px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 42%, transparent);
}

.extension-window-prompt__search :deep(.ui-input-shell),
.extension-window-prompt__body--input :deep(.ui-input-shell) {
  height: 38px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--surface-base) 86%, transparent);
}

.extension-window-prompt__list {
  min-height: 0;
  overflow-y: auto;
  padding: 4px;
}

.extension-window-prompt__item {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(100px, 220px);
  gap: 12px;
  align-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 9px 10px;
  text-align: left;
}

.extension-window-prompt__item:hover,
.extension-window-prompt__item.is-active,
.extension-window-prompt__item.is-selected {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface-hover));
}

.extension-window-prompt__item-main {
  min-width: 0;
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.extension-window-prompt__item-check {
  width: 16px;
  min-width: 16px;
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

.extension-window-prompt__item-label {
  min-width: 0;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
}

.extension-window-prompt__item-description,
.extension-window-prompt__item-detail {
  min-width: 0;
}

.extension-window-prompt__empty {
  padding: 16px 12px;
}

.extension-window-prompt__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid color-mix(in srgb, var(--border) 42%, transparent);
}

.extension-window-prompt__button {
  min-width: 88px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--border) 64%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--surface-base) 88%, transparent);
  color: var(--text-primary);
  font-size: 12px;
}

.extension-window-prompt__button--primary {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  background: color-mix(in srgb, var(--accent) 18%, var(--surface-hover));
}
</style>
