<template>
  <div class="workflow-bar">
    <div v-if="showMeta" class="workflow-meta">
      <span class="workflow-kind">{{ kindLabel }}</span>
      <template v-if="previewLabel">
        <span class="workflow-separator">·</span>
        <span class="workflow-preview">{{ previewLabel }}</span>
      </template>
      <template v-if="phaseLabel">
        <span class="workflow-separator">·</span>
        <span class="workflow-phase">{{ phaseLabel }}</span>
      </template>
      <span v-if="statusText" class="workflow-status" :class="statusClass">
        <span class="workflow-status-dot"></span>
        {{ statusText }}
      </span>
    </div>

    <div class="workflow-controls">
      <template v-if="showPrimaryAction && uiState?.kind === 'markdown'">
        <button
          class="workflow-primary-btn"
          type="button"
          :title="t('Preview')"
          :aria-label="t('Preview')"
          @click="$emit('primary-action')"
        >
          <IconEye :size="14" :stroke-width="1.8" />
        </button>
      </template>

      <button
        v-else-if="showPrimaryAction"
        class="workflow-primary-btn"
        type="button"
        :title="primaryLabel"
        :aria-label="primaryLabel"
        @click="$emit('primary-action')"
      >
        <component :is="primaryIcon" :size="14" :stroke-width="1.8" />
      </button>
      <button
        v-if="uiState.kind !== 'markdown' && showPreviewButton"
        class="workflow-secondary-btn"
        type="button"
        :title="previewButtonLabel"
        :aria-label="previewButtonLabel"
        @click="$emit('reveal-preview')"
      >
        <IconEye :size="14" :stroke-width="1.8" />
      </button>
      <button
        v-if="showPdfButton"
        class="workflow-secondary-btn"
        type="button"
        title="PDF"
        aria-label="PDF"
        @click="$emit('reveal-pdf')"
      >
        <IconFileTypePdf :size="14" :stroke-width="1.8" />
      </button>
      <button
        v-if="showRunButtons"
        class="workflow-primary-btn"
        type="button"
        :title="t('Run selection or line ({shortcut})', { shortcut: `${modKey}+Enter` })"
        :aria-label="t('Run selection or line ({shortcut})', { shortcut: `${modKey}+Enter` })"
        @click="$emit('run-code')"
      >
        <IconPlayerPlay :size="14" :stroke-width="1.8" />
      </button>
      <button
        v-if="showRunButtons"
        class="workflow-primary-btn"
        type="button"
        :title="t('Run entire file ({shortcut})', { shortcut: `Shift+${modKey}+Enter` })"
        :aria-label="t('Run entire file ({shortcut})', { shortcut: `Shift+${modKey}+Enter` })"
        @click="$emit('run-file')"
      >
        <IconPlayerTrackNext :size="14" :stroke-width="1.8" />
      </button>
      <button
        v-if="showCommentToggle"
        class="workflow-secondary-btn workflow-comment-btn"
        :class="{ 'workflow-comment-btn-active': commentActive }"
        type="button"
        :title="t('Toggle comments')"
        :aria-label="t('Toggle comments')"
        @click="$emit('toggle-comments')"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 2.5h10a1.5 1.5 0 011.5 1.5v6a1.5 1.5 0 01-1.5 1.5H9.414l-2.707 2.707a.5.5 0 01-.854-.354V11.5H3A1.5 1.5 0 011.5 10V4A1.5 1.5 0 013 2.5z"/>
        </svg>
        <span
          v-if="commentBadgeCount > 0"
          class="workflow-comment-badge"
        >
          {{ commentBadgeCount > 9 ? '9+' : commentBadgeCount }}
        </span>
      </button>
      <div
        v-if="showAiGroup"
        class="workflow-ai-group"
        :class="{ 'workflow-ai-group-open': aiToolsExpanded }"
      >
        <div class="workflow-ai-group-tools">
          <button
            v-if="showAiDiagnoseButton"
            class="workflow-secondary-btn"
            type="button"
            :title="t('Diagnose with AI')"
            :aria-label="t('Diagnose with AI')"
            @click="handleDiagnoseClick"
          >
            <IconSearch :size="14" :stroke-width="1.8" />
          </button>
          <button
            v-if="showAiFixButton"
            class="workflow-secondary-btn workflow-secondary-btn-accent"
            type="button"
            :title="t('Fix with AI')"
            :aria-label="t('Fix with AI')"
            @click="handleFixClick"
          >
            <IconSparkles :size="14" :stroke-width="1.8" />
          </button>
        </div>
        <button
          class="workflow-secondary-btn workflow-ai-toggle-btn"
          :class="{ 'workflow-ai-toggle-btn-active': aiToolsExpanded }"
          type="button"
          :title="t(aiToolsExpanded ? 'Hide AI tools' : 'Show AI tools')"
          :aria-label="t(aiToolsExpanded ? 'Hide AI tools' : 'Show AI tools')"
          @click="toggleAiToolsExpanded"
        >
          <IconChevronRight v-if="aiToolsExpanded" :size="14" :stroke-width="1.8" />
          <IconChevronLeft v-else :size="14" :stroke-width="1.8" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  IconChevronLeft,
  IconChevronRight,
  IconEye,
  IconFileTypePdf,
  IconPlayerPlay,
  IconPlayerTrackNext,
  IconSearch,
  IconSparkles,
} from '@tabler/icons-vue'
import { modKey } from '../../platform'
import { useI18n } from '../../i18n'

const props = defineProps({
  uiState: { type: Object, default: null },
  statusText: { type: String, default: '' },
  statusTone: { type: String, default: 'muted' },
  showRunButtons: { type: Boolean, default: false },
  showCommentToggle: { type: Boolean, default: false },
  commentActive: { type: Boolean, default: false },
  commentBadgeCount: { type: Number, default: 0 },
})

const emit = defineEmits([
  'primary-action',
  'reveal-preview',
  'reveal-pdf',
  'run-code',
  'run-file',
  'diagnose-with-ai',
  'fix-with-ai',
  'toggle-comments',
])

const { t } = useI18n()

const kindLabel = computed(() => {
  if (!props.uiState || props.uiState.kind === 'text') return ''
  if (props.uiState.kind === 'markdown') return t('Markdown')
  if (props.uiState.kind === 'latex') return t('LaTeX')
  if (props.uiState.kind === 'typst') return t('Typst')
  return ''
})

const previewLabel = computed(() => {
  if (!props.uiState || props.uiState.kind === 'text') return ''
  if (props.uiState.kind === 'markdown') return t('Preview')
  if (props.uiState.previewKind === 'native') return t('Preview')
  return props.uiState.previewKind === 'pdf' ? 'PDF' : 'HTML'
})

const phaseLabel = computed(() => {
  if (!props.uiState || props.uiState.kind === 'text') return ''
  if (props.uiState.phase === 'compiling') return t('Compiling...')
  if (props.uiState.phase === 'queued') return t('Queued')
  if (props.uiState.phase === 'rendering') return t('Rendering...')
  if (props.uiState.phase === 'error') return ''
  if (props.uiState.phase === 'ready') return t('Ready')
  return t('Idle')
})

const showMeta = computed(() => (
  !!kindLabel.value || !!previewLabel.value || !!phaseLabel.value || !!props.statusText
))

const showPrimaryAction = computed(() => (
  !!props.uiState && props.uiState.kind !== 'text'
))

const primaryLabel = computed(() => {
  if (props.uiState.kind === 'latex' || props.uiState.kind === 'typst') {
    return t('Compile')
  }
  return t('Preview')
})

const primaryIcon = computed(() => {
  if (props.uiState.kind === 'latex' || props.uiState.kind === 'typst') {
    return IconPlayerPlay
  }
  return IconEye
})

const showPreviewButton = computed(() => (
  props.uiState.kind === 'latex'
  || props.uiState.kind === 'typst'
  || props.uiState.previewKind === 'pdf'
))

const previewButtonLabel = computed(() => (
  t('Preview')
))

const showPdfButton = computed(() => (
  props.uiState.kind === 'typst'
))

const showAiFixButton = computed(() => (
  props.uiState.kind === 'latex' || props.uiState.kind === 'typst'
))

const showAiDiagnoseButton = computed(() => (
  props.uiState.kind === 'latex' || props.uiState.kind === 'typst'
))

const showAiGroup = computed(() => (
  showAiDiagnoseButton.value || showAiFixButton.value
))

const aiToolsExpanded = ref(false)

watch(showAiGroup, (visible) => {
  if (!visible) aiToolsExpanded.value = false
})

watch(() => props.uiState?.kind, () => {
  aiToolsExpanded.value = false
})

function toggleAiToolsExpanded() {
  aiToolsExpanded.value = !aiToolsExpanded.value
}

function handleDiagnoseClick() {
  aiToolsExpanded.value = false
  emit('diagnose-with-ai')
}

function handleFixClick() {
  aiToolsExpanded.value = false
  emit('fix-with-ai')
}

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
  width: 100%;
  height: var(--document-header-row-height, 28px);
  min-width: 0;
  box-sizing: border-box;
  padding: 0 6px;
}

.workflow-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
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
  flex: 0 0 auto;
  flex-wrap: nowrap;
  gap: 6px;
  margin-left: auto;
  min-width: 0;
}

.workflow-primary-btn,
.workflow-secondary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  height: 22px;
  width: 24px;
  padding: 0;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  font-size: var(--ui-font-caption);
  color: var(--fg-muted);
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 0.14s ease,
    border-color 0.14s ease,
    color 0.14s ease,
    transform 0.1s ease,
    box-shadow 0.14s ease;
}

.workflow-primary-btn {
  color: var(--success, #4ade80);
}

.workflow-primary-btn:hover {
  background: color-mix(in srgb, var(--success, #4ade80) 10%, transparent);
  border-color: color-mix(in srgb, var(--success, #4ade80) 28%, var(--border));
}

.workflow-secondary-btn:hover {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border-color: color-mix(in srgb, var(--accent) 24%, var(--border));
}

.workflow-primary-btn:active,
.workflow-secondary-btn:active {
  transform: translateY(0.5px) scale(0.98);
}

.workflow-primary-btn:focus-visible,
.workflow-secondary-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 34%, transparent);
}

.workflow-secondary-btn {
  color: var(--accent);
}

.workflow-secondary-btn-accent {
  color: var(--accent);
}

.workflow-ai-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 2px;
}

.workflow-ai-group-tools {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 0;
  opacity: 0;
  overflow: hidden;
  transform: translateX(6px);
  pointer-events: none;
  transition: max-width 0.16s ease, opacity 0.14s ease, transform 0.16s ease;
}

.workflow-ai-group-open .workflow-ai-group-tools {
  max-width: 64px;
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}

.workflow-ai-toggle-btn {
  color: var(--accent);
}

.workflow-ai-toggle-btn-active {
  border-color: color-mix(in srgb, var(--accent) 24%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.workflow-comment-btn {
  position: relative;
  color: var(--fg-muted);
}

.workflow-comment-btn-active {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 26%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.workflow-comment-badge {
  position: absolute;
  top: -3px;
  right: -4px;
  min-width: 12px;
  height: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0 2px;
  color: white;
  background: var(--accent);
  font-size: var(--ui-font-tiny);
  font-weight: 600;
  line-height: 1;
}
</style>
