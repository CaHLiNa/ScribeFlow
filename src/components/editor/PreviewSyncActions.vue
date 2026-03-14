<template>
  <div class="flex items-center gap-1">
    <button
      v-if="canRevealPreview"
      class="workflow-action-btn"
      @click="$emit('reveal-preview')"
    >
      {{ t('Reveal Preview') }}
    </button>
    <button
      v-if="canJumpToPreview"
      class="workflow-action-btn"
      @click="$emit('jump-preview')"
    >
      {{ t('Jump to Preview') }}
    </button>
    <button
      v-if="canJumpToSource"
      class="workflow-action-btn"
      @click="$emit('jump-source')"
    >
      {{ t('Jump to Source') }}
    </button>
    <button
      v-if="canToggleProblems"
      class="workflow-action-btn"
      @click="$emit('toggle-problems')"
    >
      {{ problemsExpanded ? t('Hide problems') : t('Show problems') }}
    </button>
    <button
      v-if="canViewLog"
      class="workflow-action-btn workflow-action-btn-accent"
      @click="$emit('view-log')"
    >
      {{ t('View log') }}
    </button>
  </div>
</template>

<script setup>
import { useI18n } from '../../i18n'

defineProps({
  canRevealPreview: { type: Boolean, default: false },
  canJumpToPreview: { type: Boolean, default: false },
  canJumpToSource: { type: Boolean, default: false },
  canToggleProblems: { type: Boolean, default: false },
  canViewLog: { type: Boolean, default: false },
  problemsExpanded: { type: Boolean, default: false },
})

defineEmits(['reveal-preview', 'jump-preview', 'jump-source', 'toggle-problems', 'view-log'])

const { t } = useI18n()
</script>

<style scoped>
.workflow-action-btn {
  height: 20px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  font-size: var(--ui-font-caption);
  color: var(--fg-muted);
  background: transparent;
}

.workflow-action-btn:hover {
  background: var(--bg-hover);
  color: var(--fg-primary);
}

.workflow-action-btn-accent {
  color: var(--accent);
}
</style>
