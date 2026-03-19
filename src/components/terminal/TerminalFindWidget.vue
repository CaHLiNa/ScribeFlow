<template>
  <div class="terminal-find-widget flex items-center gap-2 rounded-md border px-2 py-1.5">
    <input
      ref="inputRef"
      :value="modelValue"
      class="terminal-find-input"
      :placeholder="t('Find')"
      @input="emit('update:modelValue', $event.target.value)"
      @keydown.enter.prevent="emit('next')"
      @keydown.shift.enter.prevent="emit('previous')"
      @keydown.esc.prevent="emit('close')"
    />
    <button class="terminal-find-btn" type="button" @click="emit('previous')">↑</button>
    <button class="terminal-find-btn" type="button" @click="emit('next')">↓</button>
    <button class="terminal-find-btn" :class="{ 'is-active': caseSensitive }" type="button" @click="emit('toggle-case')">Aa</button>
    <button class="terminal-find-btn" :class="{ 'is-active': wholeWord }" type="button" @click="emit('toggle-word')">W</button>
    <button class="terminal-find-btn" :class="{ 'is-active': regex }" type="button" @click="emit('toggle-regex')">.*</button>
    <button class="terminal-find-btn" type="button" @click="emit('close')">×</button>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'
import { useI18n } from '../../i18n'

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  visible: {
    type: Boolean,
    default: false,
  },
  caseSensitive: {
    type: Boolean,
    default: false,
  },
  wholeWord: {
    type: Boolean,
    default: false,
  },
  regex: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'update:modelValue',
  'next',
  'previous',
  'toggle-case',
  'toggle-word',
  'toggle-regex',
  'close',
])

const inputRef = ref(null)
const { t } = useI18n()

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    nextTick(() => {
      inputRef.value?.focus()
      inputRef.value?.select()
    })
  },
)
</script>

<style scoped>
.terminal-find-widget {
  background: color-mix(in srgb, var(--bg-secondary) 98%, transparent);
  border-color: color-mix(in srgb, var(--border) 86%, transparent);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.28);
  color: var(--fg-primary);
}

.terminal-find-input {
  width: 220px;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--fg-primary);
  font-size: var(--ui-font-label);
}

.terminal-find-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--fg-muted);
  font-size: var(--ui-font-caption);
}

.terminal-find-btn:hover {
  background: var(--bg-hover);
  color: var(--fg-primary);
}

.terminal-find-btn.is-active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}
</style>
