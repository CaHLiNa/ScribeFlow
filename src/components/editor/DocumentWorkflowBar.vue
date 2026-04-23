<!-- START OF FILE src/components/editor/DocumentWorkflowBar.vue -->
<template>
  <Teleport :to="teleportTo || 'body'" :disabled="!teleportTo">
    <div
      class="workflow-bar"
      :class="{
        'is-shell-integrated': shellIntegrated,
        'is-inline-header': inlineHeader,
      }"
      :data-tauri-drag-region="shellIntegrated ? '' : null"
    >
      <div class="workflow-left">
        <div v-if="showInlineMeta" class="workflow-meta">
          <span v-if="showKindLabel" class="workflow-kind">{{ kindLabel }}</span>
          <template v-if="phaseLabel">
            <span v-if="showKindLabel" class="workflow-separator">·</span>
            <span class="workflow-phase">{{ phaseLabel }}</span>
          </template>
          <span v-if="statusText" class="workflow-status" :class="statusClass">
            <span v-if="showKindLabel || phaseLabel" class="workflow-separator">·</span>
            <span class="workflow-status-dot"></span>
            {{ statusText }}
          </span>
        </div>

        <span v-else-if="showShellStatus" class="workflow-shell-status" :class="statusClass">
          <span class="workflow-status-dot"></span>
          {{ statusText }}
        </span>
      </div>

      <div class="workflow-right">
        <div class="workflow-doc-tools">
          <template v-if="showPrimaryAction && uiState?.kind !== 'markdown'">
            <UiButton
              class="workflow-primary-btn"
              variant="ghost"
              size="icon-sm"
              icon-only
              :title="primaryLabel"
              :aria-label="primaryLabel"
              @click="$emit('primary-action')"
            >
              <component
                :is="primaryIcon"
                :size="primaryActionIconSize"
                :stroke-width="buttonIconStroke"
              />
            </UiButton>
          </template>
          <UiButton
            v-if="showPreviewButton"
            class="workflow-secondary-btn"
            variant="ghost"
            size="icon-sm"
            icon-only
            :active="isPreviewButtonActive"
            :title="previewButtonLabel"
            :aria-label="previewButtonLabel"
            @click="$emit('reveal-preview')"
          >
            <IconEye :size="secondaryActionIconSize" :stroke-width="buttonIconStroke" />
          </UiButton>
          <UiButton
            v-if="showPdfButton"
            class="workflow-secondary-btn"
            variant="ghost"
            size="icon-sm"
            icon-only
            :active="isPdfButtonActive"
            :title="pdfButtonLabel"
            :aria-label="pdfButtonLabel"
            @click="$emit('reveal-pdf')"
          >
            <component :is="pdfIcon" :size="pdfActionIconSize" :stroke-width="buttonIconStroke" />
          </UiButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import { IconEye, IconFileTypePdf, IconPlayerPlay } from '@tabler/icons-vue'
import UiButton from '../shared/ui/UiButton.vue'
import { useI18n } from '../../i18n'

const props = defineProps({
  uiState: { type: Object, default: null },
  previewState: { type: Object, default: null },
  statusText: { type: String, default: '' },
  statusTone: { type: String, default: 'muted' },
  teleportTo: { type: String, default: '' },
  shellIntegrated: { type: Boolean, default: false },
  inlineHeader: { type: Boolean, default: false },
})

defineEmits(['primary-action', 'reveal-preview', 'reveal-pdf'])

const { t } = useI18n()

const kindLabel = computed(() => {
  if (!props.uiState || props.uiState.kind === 'text') return ''
  if (props.uiState.kind === 'markdown') return t('Markdown')
  if (props.uiState.kind === 'latex') return t('LaTeX')
  if (props.uiState.kind === 'python') return t('Python')
  return ''
})

const phaseLabel = computed(() => {
  if (!props.uiState || props.uiState.kind === 'text') return ''
  if (props.uiState.phase === 'running') return t('Running...')
  if (props.uiState.phase === 'compiling') return t('Compiling...')
  if (props.uiState.phase === 'queued') return t('Queued')
  if (props.uiState.phase === 'rendering') return t('Rendering...')
  if (props.uiState.phase === 'error') return ''
  if (props.uiState.phase === 'ready') return t('Ready')
  return t('Idle')
})

const showMeta = computed(() => !!kindLabel.value || !!phaseLabel.value || !!props.statusText)
const showInlineMeta = computed(
  () => showMeta.value && !props.shellIntegrated && !props.inlineHeader
)
const showShellStatus = computed(
  () => !!props.statusText && props.shellIntegrated && !props.inlineHeader
)

const showPrimaryAction = computed(() => !!props.uiState && props.uiState.kind !== 'text')

const primaryLabel = computed(() => {
  if (props.uiState?.primaryAction === 'run') {
    return t('Run')
  }
  if (props.uiState?.primaryAction === 'compile' || props.uiState?.kind === 'latex') {
    return t('Compile')
  }
  return t('Preview')
})

const primaryIcon = computed(() => {
  if (
    props.uiState?.primaryAction === 'run'
    || props.uiState?.primaryAction === 'compile'
    || props.uiState?.kind === 'latex'
  ) {
    return IconPlayerPlay
  }
  return IconEye
})

const showPreviewButton = computed(() => props.uiState?.canRevealPreview === true)

const previewButtonLabel = computed(() =>
  props.uiState?.kind === 'markdown'
    ? t('Toggle preview')
    : props.uiState?.kind === 'python'
      ? t('Toggle terminal output')
      : t('Preview')
)

const canOpenPdf = computed(() => props.uiState?.canOpenPdf === true)
const showPdfButton = computed(() => {
  if (props.uiState?.kind === 'latex') return true
  return canOpenPdf.value
})
const pdfButtonLabel = computed(() => {
  if (!canOpenPdf.value) return t('Build and open PDF')
  return activePreviewMode.value === 'pdf-artifact' ? t('Hide PDF preview') : t('Open PDF')
})
const pdfIcon = computed(() =>
  props.uiState?.kind === 'latex' ? IconEye : IconFileTypePdf
)

const activePreviewMode = computed(() => props.previewState?.previewMode || null)

const isPreviewButtonActive = computed(
  () => activePreviewMode.value === 'markdown' || activePreviewMode.value === 'terminal-output'
)
const isPdfButtonActive = computed(() => activePreviewMode.value === 'pdf-artifact')

const statusClass = computed(() => ({
  'workflow-status-success': props.statusTone === 'success',
  'workflow-status-warning': props.statusTone === 'warning',
  'workflow-status-error': props.statusTone === 'error',
  'workflow-status-running': props.statusTone === 'running',
}))

const compactPaneBar = computed(() => !props.inlineHeader && !props.shellIntegrated)
const showKindLabel = computed(() => !!kindLabel.value)
const buttonIconStroke = computed(() => (compactPaneBar.value ? 1.8 : 1.8))
const primaryActionIconSize = computed(() => 16)
const secondaryActionIconSize = computed(() => 16)
const pdfActionIconSize = computed(() => 16)
</script>

/* START OF FILE src/components/editor/DocumentWorkflowBar.vue (只替换 style 部分) */
<style scoped>
.workflow-bar {
  --workflow-control-size: 30px;
  --workflow-control-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: var(--document-header-row-height, 30px);
  min-width: 0;
  box-sizing: border-box;
  padding: 0;
  background: transparent;
}

.workflow-bar.is-shell-integrated {
  --shell-top-control-size: var(--workflow-control-size);
  --shell-top-control-radius: var(--workflow-control-radius);
  width: auto;
  min-height: var(--shell-top-control-size);
  height: var(--shell-top-control-size);
  padding: 0;
  gap: 4px;
}

.workflow-bar.is-inline-header {
  width: auto;
  min-width: 0;
  flex: 0 1 auto;
  min-height: var(--workflow-control-size);
  height: var(--workflow-control-size);
  justify-content: flex-end;
  gap: 4px;
}

.workflow-left,
.workflow-right {
  display: flex;
  align-items: center;
  min-width: 0;
  box-sizing: border-box;
}

.workflow-left {
  flex: 1 1 auto;
  gap: 0;
  padding: 0;
}

.workflow-right {
  flex: 0 0 auto;
  justify-content: flex-end;
  gap: 0;
}

.workflow-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  font-family: var(--font-ui);
  font-size: 11px;
  text-transform: none;
  letter-spacing: 0.02em;
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
}

.workflow-bar.is-inline-header .workflow-meta {
  flex: 0 1 auto;
}

.workflow-shell-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0.02em;
  color: var(--text-muted);
}

.workflow-kind {
  color: var(--text-primary);
}

.workflow-phase {
  color: var(--text-muted);
}

.workflow-separator {
  color: color-mix(in srgb, var(--text-muted) 40%, transparent);
}

.workflow-doc-tools {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex: 0 0 auto;
  min-height: var(--workflow-control-size);
  height: var(--workflow-control-size);
  padding: 0;
  border: 0;
  background: transparent;
}

.workflow-bar.is-shell-integrated .workflow-doc-tools {
  min-height: var(--shell-top-control-size);
  height: var(--shell-top-control-size);
}

.workflow-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  color: var(--text-muted);
}

.workflow-status-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.workflow-status-success { color: var(--success); }
.workflow-status-warning { color: var(--warning); }
.workflow-status-error { color: var(--error); }
.workflow-status-running { color: var(--fg-muted); }

.workflow-primary-btn,
.workflow-secondary-btn {
  flex: 0 0 auto;
  width: var(--workflow-control-size);
  height: var(--workflow-control-size);
  min-height: var(--workflow-control-size);
  white-space: nowrap;
  color: var(--text-secondary);
  border-radius: var(--workflow-control-radius);
  background: transparent;
  box-shadow: none;
  transition: background-color 0.1s, color 0.1s;
}

.workflow-bar.is-inline-header .workflow-primary-btn,
.workflow-bar.is-inline-header .workflow-secondary-btn {
  width: var(--workflow-control-size);
  height: var(--workflow-control-size);
  min-height: var(--workflow-control-size);
  border-radius: var(--workflow-control-radius);
}

.workflow-bar.is-shell-integrated .workflow-primary-btn,
.workflow-bar.is-shell-integrated .workflow-secondary-btn {
  width: var(--shell-top-control-size);
  height: var(--shell-top-control-size);
  min-height: var(--shell-top-control-size);
  border-radius: var(--shell-top-control-radius);
}

.workflow-primary-btn:hover:not(:disabled),
.workflow-secondary-btn:hover:not(:disabled),
.workflow-bar.is-inline-header .workflow-primary-btn:hover:not(:disabled),
.workflow-bar.is-inline-header .workflow-secondary-btn:hover:not(:disabled),
.workflow-bar.is-shell-integrated .workflow-primary-btn:hover:not(:disabled),
.workflow-bar.is-shell-integrated .workflow-secondary-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--surface-hover) 60%, transparent);
  color: var(--text-primary);
}

.workflow-secondary-btn.is-active,
.workflow-bar.is-inline-header .workflow-secondary-btn.is-active,
.workflow-bar.is-shell-integrated .workflow-primary-btn.is-active,
.workflow-bar.is-shell-integrated .workflow-secondary-btn.is-active {
  color: var(--text-primary);
  background: transparent !important;
}

.workflow-primary-btn :deep(svg),
.workflow-secondary-btn :deep(svg) {
  display: block;
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}
</style>
