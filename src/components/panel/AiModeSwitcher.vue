<template>
  <div class="ai-mode-switcher">
    <UiButton
      variant="secondary"
      size="sm"
      :active="currentMode === 'chat'"
      :disabled="disabled"
      @click="$emit('change', 'chat')"
    >
      {{ t('Chat') }}
    </UiButton>
    <UiButton
      variant="secondary"
      size="sm"
      :active="currentMode === 'agent'"
      :disabled="disabled"
      @click="$emit('change', 'agent')"
    >
      {{ t('Agent') }}
    </UiButton>
  </div>
</template>

<script setup>
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'

defineProps({
  currentMode: { type: String, default: 'agent' },
  disabled: { type: Boolean, default: false },
})

defineEmits(['change'])

const { t } = useI18n()
</script>

<style scoped>
.ai-mode-switcher {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px 6px;
}
</style>
