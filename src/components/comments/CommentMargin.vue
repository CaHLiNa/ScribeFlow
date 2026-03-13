<template>
  <div class="comment-margin flex flex-col">
    <!-- Header -->
    <div class="comment-margin-header">
      <div class="flex items-center justify-between">
        <button
          class="comment-toggle-btn"
          :class="{ 'comment-toggle-btn-on': showResolved }"
          @click="toggleShowResolved"
          :title="showResolved ? t('Hide resolved') : t('Show resolved')"
        >
          <IconEye v-if="showResolved" :size="13" :stroke-width="1.5" />
          <IconEyeOff v-else :size="13" :stroke-width="1.5" />
        </button>

        <button
          class="comment-add-btn"
          :class="{ 'comment-add-btn-active': hasSelection }"
          :disabled="!hasSelection"
          @click="handleAddComment"
          :title="hasSelection ? t('Add comment on selection') : t('Select text in the editor first')"
        >
          <IconPlus :size="11" :stroke-width="2.5" />
          <span>{{ t('Add') }}</span>
        </button>
      </div>
    </div>

    <!-- Cards list -->
    <div class="flex-1 overflow-y-auto">
      <CommentCard
        v-for="comment in visibleComments"
        :key="comment.id"
        :comment="comment"
        :active="comment.id === commentsStore.activeCommentId"
        @click="handleCardClick(comment)"
      />

      <!-- Empty state -->
      <div
        v-if="!visibleComments.length"
        class="px-3 py-6 text-center"
        :style="{
          color: 'var(--fg-muted)',
          fontSize: 'calc(var(--ui-font-size, 13px) - 2px)',
        }"
      >
        {{ t('Select text and press') }}<br>
        <kbd
          :style="{
            display: 'inline-block',
            padding: '1px 5px',
            marginTop: '4px',
            fontSize: 'calc(var(--ui-font-size, 13px) - 3px)',
            fontFamily: 'var(--font-sans)',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            color: 'var(--fg-secondary)',
          }"
        >{{ modKey }}+Shift+L</kbd><br>
        {{ t('to add a comment') }}
      </div>
    </div>

    <!-- Submit footer -->
    <div v-if="unresolvedCount > 0" class="comment-margin-footer">
      <button
        class="comment-btn-primary comment-submit-full"
        @click="handleSubmit"
      >
        {{ t('Submit {count}', { count: unresolvedCount }) }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { IconPlus, IconEye, IconEyeOff } from '@tabler/icons-vue'
import { useCommentsStore } from '../../stores/comments'
import CommentCard from './CommentCard.vue'
import { modKey } from '../../platform'
import { useI18n } from '../../i18n'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
  hasSelection: { type: Boolean, default: false },
})

const commentsStore = useCommentsStore()
const { t } = useI18n()

const showResolved = computed(() => commentsStore.showResolved)

const visibleComments = computed(() => {
  if (showResolved.value) {
    return commentsStore.commentsForFile(props.filePath)
  }
  return commentsStore.unresolvedForFile(props.filePath)
})

const unresolvedCount = computed(() => commentsStore.unresolvedCount(props.filePath))

function handleCardClick(comment) {
  commentsStore.setActiveComment(comment.id)
  window.dispatchEvent(new CustomEvent('comment-scroll-to', {
    detail: { commentId: comment.id, filePath: props.filePath },
  }))
}

function handleSubmit() {
  commentsStore.submitToChat(props.filePath)
}

function handleAddComment() {
  if (!props.hasSelection) return
  window.dispatchEvent(new CustomEvent('comment-create', {
    detail: { paneId: props.paneId },
  }))
}

function toggleShowResolved() {
  commentsStore.showResolved = !commentsStore.showResolved
}
</script>
