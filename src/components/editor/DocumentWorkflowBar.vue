<template>
  <Teleport :to="teleportTo || 'body'" :disabled="!teleportTo">
    <div
      class="workflow-bar"
      :class="{
        'workflow-bar-split': showSplitLayout,
        'is-shell-integrated': shellIntegrated,
        'is-inline-header': inlineHeader,
      }"
      :data-tauri-drag-region="shellIntegrated ? '' : null"
    >
      <div class="workflow-left">
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
              <component :is="primaryIcon" :size="15" :stroke-width="1.7" />
            </UiButton>
          </template>
          <UiButton
            v-if="showRunButtons"
            class="workflow-primary-btn"
            variant="ghost"
            size="icon-sm"
            icon-only
            :title="t('Run selection or line ({shortcut})', { shortcut: `${modKey}+Enter` })"
            :aria-label="t('Run selection or line ({shortcut})', { shortcut: `${modKey}+Enter` })"
            @click="$emit('run-code')"
          >
            <IconPlayerPlay :size="15" :stroke-width="1.7" />
          </UiButton>
          <UiButton
            v-if="showRunButtons"
            class="workflow-primary-btn"
            variant="ghost"
            size="icon-sm"
            icon-only
            :title="t('Run entire file ({shortcut})', { shortcut: `Shift+${modKey}+Enter` })"
            :aria-label="t('Run entire file ({shortcut})', { shortcut: `Shift+${modKey}+Enter` })"
            @click="$emit('run-file')"
          >
            <IconPlayerTrackNext :size="15" :stroke-width="1.7" />
          </UiButton>
        </div>

        <div v-if="showInlineMeta" class="workflow-meta">
          <span class="workflow-kind">{{ kindLabel }}</span>
          <template v-if="phaseLabel">
            <span class="workflow-separator">·</span>
            <span class="workflow-phase">{{ phaseLabel }}</span>
          </template>
          <span v-if="statusText" class="workflow-status" :class="statusClass">
            <span class="workflow-status-dot"></span>
            {{ statusText }}
          </span>
        </div>

        <span v-else-if="showShellStatus" class="workflow-shell-status" :class="statusClass">
          <span class="workflow-status-dot"></span>
          {{ statusText }}
        </span>
      </div>

      <div v-if="showPreviewSection" class="workflow-right">
        <div class="workflow-preview-tools">
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
            <IconEye :size="15" :stroke-width="1.7" />
          </UiButton>
          <UiButton
            v-if="showPdfButton"
            class="workflow-secondary-btn"
            variant="ghost"
            size="icon-sm"
            icon-only
            :title="pdfButtonLabel"
            :aria-label="pdfButtonLabel"
            @click="$emit('reveal-pdf')"
          >
            <IconFileTypePdf :size="15" :stroke-width="1.7" />
          </UiButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import { IconEye, IconFileTypePdf, IconPlayerPlay, IconPlayerTrackNext } from '@tabler/icons-vue'
import UiButton from '../shared/ui/UiButton.vue'
import { modKey } from '../../platform'
import { useI18n } from '../../i18n'

const props = defineProps({
  uiState: { type: Object, default: null },
  previewState: { type: Object, default: null },
  statusText: { type: String, default: '' },
  statusTone: { type: String, default: 'muted' },
  showRunButtons: { type: Boolean, default: false },
  teleportTo: { type: String, default: '' },
  shellIntegrated: { type: Boolean, default: false },
  inlineHeader: { type: Boolean, default: false },
})

defineEmits([
  'primary-action',
  'reveal-preview',
  'reveal-pdf',
  'run-code',
  'run-file',
])

const { t } = useI18n()

const kindLabel = computed(() => {
  if (!props.uiState || props.uiState.kind === 'text') return ''
  if (props.uiState.kind === 'markdown') return t('Markdown')
  if (props.uiState.kind === 'latex') return t('LaTeX')
  if (props.uiState.kind === 'typst') return t('Typst')
  return ''
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

const showMeta = computed(() => !!kindLabel.value || !!phaseLabel.value || !!props.statusText)
const showInlineMeta = computed(() => showMeta.value && !props.shellIntegrated && !props.inlineHeader)
const showShellStatus = computed(() => !!props.statusText && props.shellIntegrated && !props.inlineHeader)

const showPrimaryAction = computed(() => !!props.uiState && props.uiState.kind !== 'text')

const primaryLabel = computed(() => {
  if (props.uiState?.kind === 'latex' || props.uiState?.kind === 'typst') {
    return t('Compile')
  }
  return t('Preview')
})

const primaryIcon = computed(() => {
  if (props.uiState?.kind === 'latex' || props.uiState?.kind === 'typst') {
    return IconPlayerPlay
  }
  return IconEye
})

const showPreviewButton = computed(() => {
  if (!props.uiState?.kind || props.uiState.kind === 'text') return false
  if (props.uiState.kind === 'latex') return false
  if (props.uiState.kind === 'typst') return props.uiState.canRevealPreview === true
  return true
})

const previewButtonLabel = computed(() =>
  props.uiState?.kind === 'markdown' ? t('Toggle preview') : t('Preview')
)

const showPdfButton = computed(() => props.uiState?.canOpenPdf === true)
const pdfButtonLabel = computed(() => t('Open PDF'))

const activePreviewMode = computed(() => props.previewState?.previewMode || null)

const isPreviewButtonActive = computed(
  () => activePreviewMode.value === 'markdown' || activePreviewMode.value === 'typst-native'
)

const showPreviewSection = computed(
  () => showPreviewButton.value || showPdfButton.value || !!props.previewState?.previewVisible
)

const showSplitLayout = computed(
  () => !!props.previewState?.previewVisible && !props.shellIntegrated
)

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
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  height: var(--document-header-row-height, 28px);
  min-width: 0;
  box-sizing: border-box;
  padding: 0;
  background: transparent;
}

.workflow-bar.is-shell-integrated {
  --shell-top-control-size: 28px;
  --shell-top-control-radius: 8px;
  width: auto;
  min-height: var(--shell-top-control-size);
  height: var(--shell-top-control-size);
  padding: 0;
  gap: 6px;
}

.workflow-bar.is-inline-header {
  width: auto;
  min-width: 0;
  flex: 0 1 auto;
  justify-content: flex-end;
  gap: 6px;
}

.workflow-bar-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0;
  padding: 0;
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
  gap: 4px;
  padding: 0;
}

.workflow-right {
  flex: 0 0 auto;
  gap: 2px;
  margin-left: auto;
  padding: 0;
}

.workflow-bar.is-inline-header .workflow-left {
  flex: 0 1 auto;
  min-width: 0;
}

.workflow-bar.is-inline-header .workflow-right {
  margin-left: 0;
  gap: 3px;
}

.workflow-bar.is-shell-integrated .workflow-left,
.workflow-bar.is-shell-integrated .workflow-right {
  width: auto;
  height: var(--shell-top-control-size);
  min-height: var(--shell-top-control-size);
  padding: 0;
}

.workflow-bar.is-shell-integrated .workflow-left {
  flex: 0 1 auto;
}

.workflow-bar.is-shell-integrated .workflow-right {
  gap: 2px;
}

.workflow-bar-split .workflow-left,
.workflow-bar-split .workflow-right {
  min-width: 0;
  width: 100%;
  height: 100%;
}

.workflow-bar-split .workflow-left {
  margin-left: 0;
}

.workflow-bar-split .workflow-right {
  margin-left: 0;
  justify-content: flex-start;
  border-left: 0;
}

.workflow-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  font-size: var(--ui-font-caption);
  color: var(--text-muted);
  white-space: nowrap;
  opacity: 0.72;
}

.workflow-bar.is-inline-header .workflow-meta {
  flex: 0 1 auto;
  gap: 4px;
}

.workflow-shell-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  white-space: nowrap;
  font-size: var(--ui-font-caption);
  color: var(--text-muted);
  opacity: 0.82;
}

.workflow-kind {
  color: var(--text-secondary);
  font-weight: 500;
}

.workflow-separator {
  opacity: 0.45;
}

.workflow-doc-tools,
.workflow-preview-tools {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex: 0 0 auto;
  min-height: 24px;
  padding: 0;
  border-radius: 0;
  background: transparent;
  border: 0;
}

.workflow-bar.is-shell-integrated .workflow-doc-tools,
.workflow-bar.is-shell-integrated .workflow-preview-tools {
  gap: 4px;
  min-height: var(--shell-top-control-size);
  height: var(--shell-top-control-size);
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.workflow-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0;
  height: auto;
  color: var(--text-muted);
}

.workflow-status-dot {
  width: 6px;
  height: 6px;
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

.workflow-primary-btn,
.workflow-secondary-btn {
  flex: 0 0 auto;
  height: 22px;
  width: 22px;
  min-height: 22px;
  white-space: nowrap;
  color: var(--text-secondary);
  border-radius: 7px;
  background: transparent;
  opacity: 0.88;
  box-shadow: none;
  transition:
    background-color 140ms ease,
    color 140ms ease,
    border-color 140ms ease,
    box-shadow 140ms ease;
}

.workflow-bar.is-shell-integrated .workflow-primary-btn,
.workflow-bar.is-shell-integrated .workflow-secondary-btn {
  width: var(--shell-top-control-size);
  height: var(--shell-top-control-size);
  min-height: var(--shell-top-control-size);
  padding: 0;
  border-radius: var(--shell-top-control-radius);
  opacity: 0.92;
  background: transparent;
  box-shadow: none;
}

.workflow-primary-btn {
  color: var(--text-secondary);
}

.workflow-bar:hover .workflow-primary-btn,
.workflow-bar:hover .workflow-secondary-btn,
.workflow-bar:focus-within .workflow-primary-btn,
.workflow-bar:focus-within .workflow-secondary-btn {
  opacity: 0.92;
}

.workflow-primary-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--chrome-surface) 18%, transparent);
  color: var(--text-primary);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border) 12%, transparent);
}

.workflow-secondary-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--chrome-surface) 18%, transparent);
  color: var(--text-primary);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border) 12%, transparent);
}

.workflow-secondary-btn {
  color: var(--text-secondary);
}

.workflow-secondary-btn.is-active {
  background: color-mix(in srgb, var(--chrome-surface) 24%, transparent);
  color: var(--text-primary);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border) 14%, transparent);
}

.workflow-bar.is-shell-integrated .workflow-primary-btn.is-active,
.workflow-bar.is-shell-integrated .workflow-secondary-btn.is-active {
  background: transparent;
  color: var(--text-primary);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border) 12%, transparent);
}

.workflow-bar.is-shell-integrated .workflow-primary-btn:hover:not(:disabled),
.workflow-bar.is-shell-integrated .workflow-secondary-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--chrome-surface) 50%, transparent);
}

.workflow-secondary-btn-accent {
  color: var(--accent);
}

.workflow-ai-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 2px;
}

.workflow-preview-slot {
  display: flex;
  align-items: center;
  min-width: 0;
}

.workflow-preview-slot-pdf {
  margin-left: 0;
  padding-left: 4px;
  border-left: 0;
}

.workflow-preview-slot-pdf :deep(.pdf-toolbar-wrap-embedded) {
  width: auto;
  background: transparent;
  border: 0;
}

.workflow-preview-slot-pdf :deep(.pdf-toolbar) {
  width: auto;
  justify-content: flex-start;
  gap: 8px;
  padding: 0;
  overflow: visible;
}

.workflow-preview-slot-pdf :deep(.pdf-toolbar-left),
.workflow-preview-slot-pdf :deep(.pdf-toolbar-right) {
  flex: none;
  gap: 4px;
}

.workflow-preview-slot-pdf :deep(.pdf-toolbar-center) {
  position: static;
  inset: auto;
  transform: none;
  flex: none;
}

.workflow-preview-slot-pdf :deep(.pdf-toolbar-group) {
  gap: 3px;
}

.workflow-preview-slot-pdf :deep(.pdf-page-indicator) {
  padding-right: 2px;
}
</style>
