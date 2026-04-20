<template>
  <article
    v-if="artifact"
    class="ai-inline-artifact"
    :class="`is-${artifact.status || 'pending'}`"
  >
    <div class="ai-inline-artifact__header">
      <div class="ai-inline-artifact__title">{{ artifact.title || artifact.type }}</div>
      <div class="ai-inline-artifact__badge">
        {{ badgeLabel }}
      </div>
    </div>
    <div class="ai-inline-artifact__type">{{ artifactTypeLabel }}</div>
    <div class="ai-inline-artifact__preview">
      {{ preview }}
    </div>
    <div v-if="evidencePreview.length > 0" class="ai-inline-artifact__sources">
      <div class="ai-inline-artifact__sources-label">{{ t('Sources') }}</div>
      <div
        v-for="evidence in evidencePreview"
        :key="evidence.id || `${evidence.label}:${evidence.sourcePath}`"
        class="ai-inline-artifact__source"
      >
        <div class="ai-inline-artifact__source-title">
          {{ evidence.label || evidence.citationKey || evidence.sourcePath || evidence.sourceType }}
        </div>
        <div v-if="evidence.excerpt" class="ai-inline-artifact__source-excerpt">
          {{ evidence.excerpt }}
        </div>
        <div
          v-if="evidence.whyRelevant || evidence.sourcePath || evidence.citationKey"
          class="ai-inline-artifact__source-meta"
        >
          <span v-if="evidence.whyRelevant">{{ evidence.whyRelevant }}</span>
          <span v-if="evidence.citationKey">{{ evidence.citationKey }}</span>
          <span v-if="evidence.sourcePath">{{ evidence.sourcePath }}</span>
        </div>
      </div>
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
      || props.artifact.citationSuggestion
      || props.artifact.content
      || props.artifact.selectionPreview
      || summarizeReferenceUpdates(props.artifact.updates)
      || props.artifact.rationale
      || ''
  ).trim()
})

const evidencePreview = computed(() =>
  Array.isArray(props.artifact?.evidencePreview) ? props.artifact.evidencePreview : []
)

const artifactTypeLabel = computed(() => {
  if (!props.artifact?.type) return ''
  if (props.artifact.type === 'doc_patch') return t('Document patch')
  if (props.artifact.type === 'note_draft') return t('Note draft')
  if (props.artifact.type === 'citation_insert') return t('Citation insert')
  if (props.artifact.type === 'reference_patch') return t('Reference update')
  if (props.artifact.type === 'related_work_outline') return t('Related work outline')
  if (props.artifact.type === 'reading_note_bundle') return t('Reading note')
  if (props.artifact.type === 'evidence_bundle') return t('Evidence bundle')
  if (props.artifact.type === 'claim_evidence_map') return t('Claim evidence map')
  if (props.artifact.type === 'compile_fix') return t('Compile fix')
  if (props.artifact.type === 'comparison_table') return t('Comparison table')
  return props.artifact.type
})

const badgeLabel = computed(() => {
  if (props.artifact?.status === 'applied') return t('Applied')
  if (props.canApply) return t('Ready to apply')
  return t('Review only')
})

function summarizeReferenceUpdates(updates = null) {
  if (!updates || typeof updates !== 'object') return ''
  return Object.entries(updates)
    .filter(([, value]) => String(value ?? '').trim())
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
}
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

.ai-inline-artifact__sources {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-inline-artifact__sources-label,
.ai-inline-artifact__source-meta {
  font-size: 10px;
  color: var(--text-tertiary);
}

.ai-inline-artifact__source {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--panel-muted) 38%, transparent);
}

.ai-inline-artifact__source-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
}

.ai-inline-artifact__source-excerpt {
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-inline-artifact__source-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ai-inline-artifact__actions {
  display: flex;
  justify-content: flex-end;
}
</style>
