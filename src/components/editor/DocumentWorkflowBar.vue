<template>
  <div class="workflow-bar">
    <div class="workflow-meta">
      <span class="workflow-kind">{{ kindLabel }}</span>
      <span class="workflow-separator">·</span>
      <span class="workflow-preview">{{ previewLabel }}</span>
      <span class="workflow-separator">·</span>
      <span class="workflow-phase">{{ phaseLabel }}</span>
      <span v-if="uiState.errorCount > 0" class="workflow-count workflow-count-error">
        {{ t('Errors') }} {{ uiState.errorCount }}
      </span>
      <span v-if="uiState.warningCount > 0" class="workflow-count workflow-count-warning">
        {{ t('Warnings') }} {{ uiState.warningCount }}
      </span>
    </div>

    <div class="workflow-controls">
      <div v-if="uiState.kind === 'markdown'" class="workflow-toggle-group">
        <button
          class="workflow-toggle-btn"
          :class="{ 'workflow-toggle-btn-active': uiState.previewKind === 'html' }"
          @click="$emit('set-preview-kind', 'html')"
        >
          HTML
        </button>
        <button
          class="workflow-toggle-btn"
          :class="{ 'workflow-toggle-btn-active': uiState.previewKind === 'pdf' }"
          @click="$emit('set-preview-kind', 'pdf')"
        >
          PDF
        </button>
      </div>

      <button class="workflow-primary-btn" @click="$emit('primary-action')">
        {{ primaryLabel }}
      </button>

      <PreviewSyncActions
        :can-reveal-preview="uiState.canRevealPreview"
        :can-jump-to-preview="uiState.forwardSync !== 'none'"
        :can-jump-to-source="false"
        :can-toggle-problems="uiState.canShowProblems"
        :can-view-log="canViewLog"
        :problems-expanded="problemsExpanded"
        @reveal-preview="$emit('reveal-preview')"
        @jump-preview="$emit('jump-preview')"
        @jump-source="$emit('jump-source')"
        @toggle-problems="$emit('toggle-problems')"
        @view-log="$emit('view-log')"
      />

      <slot />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '../../i18n'
import PreviewSyncActions from './PreviewSyncActions.vue'

const props = defineProps({
  uiState: { type: Object, required: true },
  canViewLog: { type: Boolean, default: false },
  problemsExpanded: { type: Boolean, default: false },
})

defineEmits([
  'primary-action',
  'reveal-preview',
  'jump-preview',
  'jump-source',
  'toggle-problems',
  'view-log',
  'set-preview-kind',
])

const { t } = useI18n()

const kindLabel = computed(() => {
  if (props.uiState.kind === 'markdown') return t('Markdown')
  if (props.uiState.kind === 'latex') return t('LaTeX')
  if (props.uiState.kind === 'typst') return t('Typst')
  return ''
})

const previewLabel = computed(() => props.uiState.previewKind === 'pdf' ? 'PDF' : 'HTML')

const phaseLabel = computed(() => {
  if (props.uiState.phase === 'compiling') return t('Compiling...')
  if (props.uiState.phase === 'rendering') return t('Rendering...')
  if (props.uiState.phase === 'error') return t('Errors')
  if (props.uiState.phase === 'ready') return t('Ready')
  return t('Idle')
})

const primaryLabel = computed(() => {
  if (props.uiState.kind === 'latex' || props.uiState.kind === 'typst') {
    return t('Compile')
  }
  if (props.uiState.kind === 'markdown' && props.uiState.previewKind === 'pdf') {
    return t('Create PDF')
  }
  return t('Preview')
})
</script>

<style scoped>
.workflow-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 0 6px;
}

.workflow-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: var(--ui-font-caption);
  color: var(--fg-muted);
  white-space: nowrap;
}

.workflow-kind {
  color: var(--fg-primary);
  font-weight: 600;
}

.workflow-separator {
  opacity: 0.45;
}

.workflow-count {
  padding: 0 6px;
  border-radius: 999px;
  border: 1px solid var(--border);
}

.workflow-count-error {
  color: var(--error);
}

.workflow-count-warning {
  color: var(--warning);
}

.workflow-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.workflow-toggle-group {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 7px;
  background: var(--bg-hover);
}

.workflow-toggle-btn,
.workflow-primary-btn {
  height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  font-size: var(--ui-font-caption);
  color: var(--fg-muted);
}

.workflow-toggle-btn-active {
  background: var(--bg-primary);
  color: var(--fg-primary);
  border-color: var(--border);
}

.workflow-primary-btn {
  color: var(--accent);
}

.workflow-primary-btn:hover,
.workflow-toggle-btn:hover {
  background: var(--bg-hover);
}
</style>
