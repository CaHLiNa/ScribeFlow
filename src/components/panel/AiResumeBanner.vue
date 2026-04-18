<template>
  <AiRuntimeStateCard
    :visible="resumeState?.active"
    tone="info"
    :title="t('Waiting to resume')"
    :body="resumeBody"
  />
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '../../i18n'
import AiRuntimeStateCard from './AiRuntimeStateCard.vue'

const props = defineProps({
  resumeState: {
    type: Object,
    default: () => ({ active: false, message: '' }),
  },
})

const { t } = useI18n()
const resumeBody = computed(
  () =>
    String(props.resumeState?.message || '').trim()
    || t('The agent is collecting background task results before resuming.')
)
</script>
