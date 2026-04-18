<template>
  <article
    v-if="artifact"
    class="ai-inline-artifact"
    :class="`is-${artifact.status || 'pending'}`"
  >
    <div class="ai-inline-artifact__header">
      <div class="ai-inline-artifact__title">{{ artifact.title || artifact.type }}</div>
      <div class="ai-inline-artifact__badge">
        {{ artifact.status === 'applied' ? t('Applied') : t('Ready to apply') }}
      </div>
    </div>
    <div class="ai-inline-artifact__type">{{ artifactTypeLabel }}</div>
    <div class="ai-inline-artifact__preview">
      {{ preview }}
    </div>
    <div v-if="canApply" class="ai-inline-artifact__actions">
      <UiButton
        variant="secondary"
        size="sm"
        :disabled="artifact.status === 'applied'"
        @click="$emit('apply', artifact.id)"
      >
        {{ actionLabel }}
      </UiButton>
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'

const props = defineProps({
  artifact: { type: Object, default: null },
  actionLabel: { type: String, default: '' },
  canApply: { type: Boolean, default: false },
})

defineEmits(['apply'])

const { t } = useI18n()

const preview = computed(() => {
  if (!props.artifact) return ''
  return String(
    props.artifact.replacementText
      || props.artifact.content
      || props.artifact.rationale
      || ''
  ).trim()
})

const artifactTypeLabel = computed(() => {
  if (!props.artifact?.type) return ''
  if (props.artifact.type === 'doc_patch') return t('Document patch')
  if (props.artifact.type === 'note_draft') return t('Note draft')
  return props.artifact.type
})
</script>

<style scoped>
.ai-inline-artifact {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--border-color) 44%, transparent);
  background: color-mix(in srgb, var(--surface-base) 70%, transparent);
}

.ai-inline-artifact.is-applied {
  border-color: color-mix(in srgb, var(--success) 34%, var(--border-color) 66%);
  background: color-mix(in srgb, var(--success) 8%, var(--surface-base) 92%);
}

.ai-inline-artifact__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.ai-inline-artifact__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.ai-inline-artifact__badge,
.ai-inline-artifact__type {
  font-size: 10px;
  color: var(--text-tertiary);
}

.ai-inline-artifact__badge {
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--panel-muted) 64%, transparent);
}

.ai-inline-artifact__preview {
  font-size: 11px;
  line-height: 1.52;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-inline-artifact__actions {
  display: flex;
  justify-content: flex-end;
}
</style>
