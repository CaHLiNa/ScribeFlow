<template>
  <AiRuntimeStateCard
    :visible="planMode?.active"
    tone="accent"
    :title="t('Plan mode is active')"
    :body="planSummary"
    :items="planItems"
    :max-visible-items="1"
    :max-detail-length="52"
  />
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '../../i18n'
import AiRuntimeStateCard from './AiRuntimeStateCard.vue'

const props = defineProps({
  planMode: { type: Object, default: () => ({ active: false, summary: '', note: '' }) },
})

const { t } = useI18n()
const planSummary = computed(() => truncateText(props.planMode?.summary, 140))
const planItems = computed(() => {
  const note = truncateText(props.planMode?.note, 60)
  return note
    ? [
        {
          key: 'note',
          label: t('Note'),
          detail: note,
        },
      ]
    : []
})

function truncateText(value = '', maxLength = 140) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ')
  if (!normalized) return ''
  const limit = Math.max(20, Number(maxLength || 140))
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit - 1).trimEnd()}…`
}
</script>
