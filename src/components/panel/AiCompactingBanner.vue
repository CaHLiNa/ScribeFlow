<template>
  <AiRuntimeStateCard
    :visible="compaction?.active"
    tone="warning"
    :title="t('Compacting context')"
    :body="t('The runtime is compacting earlier context before continuing.')"
  />
</template>

<script setup>
import { useI18n } from '../../i18n'
import AiRuntimeStateCard from './AiRuntimeStateCard.vue'

defineProps({
  compaction: {
    type: Object,
    default: () => ({ active: false, lastCompletedAt: 0 }),
  },
})

const { t } = useI18n()
</script>
