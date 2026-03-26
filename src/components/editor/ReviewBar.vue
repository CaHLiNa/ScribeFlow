<template>
  <div
    v-if="fileEdits.length > 0"
    class="review-bar-shell flex items-center justify-between px-2 shrink-0"
  >
    <span class="review-bar-label text-xs">
      {{
        t(fileEdits.length === 1 ? '{count} change' : '{count} changes', {
          count: fileEdits.length,
        })
      }}
    </span>
    <div class="flex items-center gap-1.5">
      <UiButton
        class="review-bar-btn review-bar-accept"
        variant="ghost"
        size="sm"
        @click="reviews.acceptAllForFile(filePath)"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <path d="M3 8.5l3.5 3.5 6.5-8" />
        </svg>
        {{ t('Keep All') }}
      </UiButton>
      <UiButton
        class="review-bar-btn review-bar-reject"
        variant="ghost"
        size="sm"
        @click="reviews.rejectAllForFile(filePath)"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        >
          <path d="M2 2l6 6M8 2l-6 6" />
        </svg>
        {{ t('Revert All') }}
      </UiButton>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useReviewsStore } from '../../stores/reviews'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'

const props = defineProps({
  filePath: { type: String, default: null },
})

const reviews = useReviewsStore()
const { t } = useI18n()

const fileEdits = computed(() => {
  if (!props.filePath) return []
  return reviews.editsForFile(props.filePath)
})
</script>

<style scoped>
.review-bar-shell {
  height: 28px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--warning) 8%, transparent);
}

.review-bar-label {
  color: var(--warning);
}
</style>
