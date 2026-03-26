<template>
  <div class="execution-result-card" :class="`execution-result-card-${tone}`">
    <div class="execution-result-header">
      <div class="execution-result-meta">
        <span class="execution-result-status">{{ statusText || t('Not run') }}</span>
        <span v-if="producerLabel" class="execution-result-label">{{ producerLabel }}</span>
        <span v-if="generatedAtLabel" class="execution-result-label">{{ generatedAtLabel }}</span>
      </div>
      <div class="execution-result-actions">
        <UiButton
          v-if="showInsert"
          class="execution-result-btn"
          variant="primary"
          size="sm"
          type="button"
          :disabled="insertDisabled"
          @click="$emit('insert')"
        >
          {{ insertLabel || t('Insert result') }}
        </UiButton>
        <UiButton
          v-if="showDismiss"
          class="execution-result-btn execution-result-btn-secondary"
          variant="secondary"
          size="sm"
          type="button"
          @click="$emit('dismiss')"
        >
          {{ dismissLabel || t('Dismiss output') }}
        </UiButton>
      </div>
    </div>

    <div v-if="hint" class="execution-result-hint">{{ hint }}</div>
    <CellOutput v-if="outputs && outputs.length > 0" :outputs="outputs" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import CellOutput from './CellOutput.vue'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'

const props = defineProps({
  outputs: { type: Array, default: () => [] },
  tone: { type: String, default: 'muted' },
  statusText: { type: String, default: '' },
  hint: { type: String, default: '' },
  producerLabel: { type: String, default: '' },
  generatedAtLabel: { type: String, default: '' },
  showInsert: { type: Boolean, default: false },
  insertDisabled: { type: Boolean, default: false },
  insertLabel: { type: String, default: '' },
  showDismiss: { type: Boolean, default: false },
  dismissLabel: { type: String, default: '' },
})

defineEmits(['insert', 'dismiss'])

const { t } = useI18n()

const tone = computed(() => props.tone || 'muted')
</script>

<style scoped>
.execution-result-card {
  margin-top: 8px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-secondary);
  overflow: hidden;
}

.execution-result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}

.execution-result-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.execution-result-status {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: var(--ui-font-micro);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.execution-result-label {
  font-size: var(--ui-font-micro);
  color: var(--fg-muted);
}

.execution-result-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.execution-result-btn {
  font-size: var(--ui-font-micro);
}

.execution-result-btn-secondary {
  color: var(--text-muted);
}

.execution-result-hint {
  padding: 8px 10px 0;
  font-size: var(--ui-font-micro);
  color: var(--fg-muted);
  line-height: 1.5;
}

.execution-result-card-muted .execution-result-status {
  background: rgba(128, 128, 128, 0.12);
  color: var(--fg-muted);
}

.execution-result-card-info .execution-result-status {
  background: rgba(122, 162, 247, 0.14);
  color: var(--accent);
}

.execution-result-card-success .execution-result-status {
  background: rgba(80, 250, 123, 0.14);
  color: var(--success, #50fa7b);
}

.execution-result-card-warning .execution-result-status {
  background: rgba(226, 185, 61, 0.14);
  color: var(--warning, #e2b93d);
}

.execution-result-card-danger .execution-result-status {
  background: rgba(247, 118, 142, 0.14);
  color: var(--error, #f7768e);
}
</style>
