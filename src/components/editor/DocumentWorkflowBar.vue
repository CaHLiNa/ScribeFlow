<template>
  <div class="workflow-bar">
    <div class="workflow-meta">
      <span class="workflow-kind">{{ kindLabel }}</span>
      <span class="workflow-separator">·</span>
      <span class="workflow-preview">{{ previewLabel }}</span>
      <span class="workflow-separator">·</span>
      <span class="workflow-phase">{{ phaseLabel }}</span>
      <span v-if="statusText" class="workflow-status" :class="statusClass">
        <span class="workflow-status-dot"></span>
        {{ statusText }}
      </span>
      <span v-if="uiState.errorCount > 0" class="workflow-count workflow-count-error">
        {{ t('Errors') }} {{ uiState.errorCount }}
      </span>
      <span v-if="uiState.warningCount > 0" class="workflow-count workflow-count-warning">
        {{ t('Warnings') }} {{ uiState.warningCount }}
      </span>
    </div>

    <div class="workflow-controls">
      <template v-if="uiState.kind === 'markdown'">
        <button
          class="workflow-primary-btn"
          @click="$emit('primary-action')"
        >
          {{ t('Preview') }}
        </button>
        <button
          class="workflow-secondary-btn"
          @click="$emit('reveal-preview')"
        >
          PDF
        </button>
        <button
          class="workflow-secondary-btn"
          @click="$emit('create-pdf')"
        >
          {{ t('Create PDF') }}
        </button>
      </template>

      <button v-else class="workflow-primary-btn" @click="$emit('primary-action')">
        {{ primaryLabel }}
      </button>

      <button
        v-if="uiState.kind !== 'markdown' && showPreviewButton"
        class="workflow-secondary-btn"
        @click="$emit('reveal-preview')"
      >
        {{ previewButtonLabel }}
      </button>
      <button
        v-if="uiState.canShowProblems"
        class="workflow-secondary-btn"
        @click="$emit('toggle-problems')"
      >
        {{ problemsExpanded ? t('Hide problems') : t('Show problems') }}
      </button>
      <button
        v-if="canViewLog"
        class="workflow-secondary-btn workflow-secondary-btn-accent"
        @click="$emit('view-log')"
      >
        {{ t('View log') }}
      </button>

      <slot />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '../../i18n'

const props = defineProps({
  uiState: { type: Object, required: true },
  canViewLog: { type: Boolean, default: false },
  problemsExpanded: { type: Boolean, default: false },
  statusText: { type: String, default: '' },
  statusTone: { type: String, default: 'muted' },
})

defineEmits([
  'primary-action',
  'reveal-preview',
  'create-pdf',
  'toggle-problems',
  'view-log',
])

const { t } = useI18n()

const kindLabel = computed(() => {
  if (props.uiState.kind === 'markdown') return t('Markdown')
  if (props.uiState.kind === 'latex') return t('LaTeX')
  if (props.uiState.kind === 'typst') return t('Typst')
  return ''
})

const previewLabel = computed(() => {
  if (props.uiState.kind === 'markdown') return t('Preview')
  return props.uiState.previewKind === 'pdf' ? 'PDF' : 'HTML'
})

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
  return t('Preview')
})

const showPreviewButton = computed(() => (
  props.uiState.kind === 'latex'
  || props.uiState.kind === 'typst'
  || props.uiState.previewKind === 'pdf'
))

const previewButtonLabel = computed(() => (
  props.uiState.previewKind === 'pdf' ? 'PDF' : t('Preview')
))

const statusClass = computed(() => ({
  'workflow-status-success': props.statusTone === 'success',
  'workflow-status-warning': props.statusTone === 'warning',
  'workflow-status-error': props.statusTone === 'error',
  'workflow-status-running': props.statusTone === 'running',
}))
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

.workflow-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  height: auto;
  color: var(--fg-muted);
}

.workflow-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: currentColor;
}

.workflow-status-success {
  color: var(--success, #4ade80);
}

.workflow-status-warning {
  color: var(--warning);
}

.workflow-status-error {
  color: var(--error);
}

.workflow-status-running {
  color: var(--fg-muted);
}

.workflow-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.workflow-primary-btn,
.workflow-secondary-btn {
  height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  font-size: var(--ui-font-caption);
  color: var(--fg-muted);
}

.workflow-primary-btn {
  color: var(--success, #4ade80);
}

.workflow-primary-btn:hover,
.workflow-secondary-btn:hover {
  background: var(--bg-hover);
}

.workflow-secondary-btn {
  color: var(--accent);
}

.workflow-secondary-btn-accent {
  color: var(--accent);
}
</style>
