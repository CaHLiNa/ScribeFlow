<template>
  <UiModalShell
    :visible="visible"
    size="sm"
    surface-class="snapshot-dialog"
    @close="cancel"
  >
    <template #header>
      <div class="snapshot-header">
        <span class="snapshot-title">{{ t('Name this version') }}</span>
        <UiButton variant="ghost" size="icon-sm" icon-only :aria-label="t('Close')" @click="cancel">
          <span aria-hidden="true">&times;</span>
        </UiButton>
      </div>
    </template>

    <div class="snapshot-body">
      <UiInput
        ref="inputEl"
        v-model="name"
        shell-class="snapshot-input"
        :placeholder="t('e.g., Submitted draft')"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        @keydown.enter="submit"
      />
      <p class="snapshot-helper">
        {{ t('Use this dialog to name a saved version.') }}
      </p>
      <UiButton variant="primary" block @click="submit">{{ t('Save') }}</UiButton>
    </div>
  </UiModalShell>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'
import UiInput from '../shared/ui/UiInput.vue'
import UiModalShell from '../shared/ui/UiModalShell.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['resolve'])
const { t } = useI18n()

const inputEl = ref(null)
const name = ref('')

watch(() => props.visible, async (v) => {
  if (v) {
    name.value = ''
    await nextTick()
    inputEl.value?.focus()
  }
})

function submit() {
  const trimmed = name.value.trim()
  emit('resolve', trimmed || null)
}

function cancel() {
  emit('resolve', null)
}
</script>

<style scoped>
.snapshot-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.snapshot-title {
  font-size: var(--ui-font-body);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.snapshot-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.snapshot-helper {
  font-size: var(--ui-font-caption);
  line-height: var(--line-height-regular);
  color: var(--text-muted);
}
</style>
