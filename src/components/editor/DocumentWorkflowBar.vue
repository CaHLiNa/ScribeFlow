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
              <component :is="primaryIcon" :size="primaryActionIconSize" :stroke-width="buttonIconStroke" />
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
            <IconPlayerPlay :size="primaryActionIconSize" :stroke-width="buttonIconStroke" />
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
            <IconPlayerTrackNext :size="secondaryActionIconSize" :stroke-width="buttonIconStroke" />
          </UiButton>
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
            :disabled="!canOpenPdf"
            :active="isPdfButtonActive"
            :title="pdfButtonLabel"
            :aria-label="pdfButtonLabel"
            @click="$emit('reveal-pdf')"
          >
            <IconFileTypePdf :size="pdfActionIconSize" :stroke-width="buttonIconStroke" />
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

const canOpenPdf = computed(() => props.uiState?.canOpenPdf === true)
const showPdfButton = computed(() => {
  if (props.uiState?.kind === 'latex' || props.uiState?.kind === 'typst') return true
  return canOpenPdf.value
})
const pdfButtonLabel = computed(() => {
  if (!canOpenPdf.value) return t('Compile to generate PDF')
  return activePreviewMode.value === 'pdf-artifact' ? t('Hide PDF preview') : t('Open PDF')
})

const activePreviewMode = computed(() => props.previewState?.previewMode || null)

const isPreviewButtonActive = computed(
  () => activePreviewMode.value === 'markdown' || activePreviewMode.value === 'typst-native'
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
const buttonIconStroke = computed(() => (compactPaneBar.value ? 1.9 : 1.8))
const primaryActionIconSize = computed(() => (compactPaneBar.value ? 15 : 17))
const secondaryActionIconSize = computed(() => (compactPaneBar.value ? 14 : 17))
const pdfActionIconSize = computed(() => (compactPaneBar.value ? 15 : 16))
</script>

<style scoped>
.workflow-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 5px;
  width: 100%;
  height: var(--document-header-row-height, 28px);
  min-width: 0;
  box-sizing: border-box;
  padding: 0;
  background: transparent;
}

.workflow-bar.is-shell-integrated {
  --shell-top-control-size: 31px;
  --shell-top-control-radius: 9px;
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
  min-height: 31px;
  height: 31px;
  justify-content: flex-end;
  gap: 3px;
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
  gap: 0;
  padding: 0;
}

.workflow-right {
  flex: 0 0 auto;
  justify-content: flex-end;
  gap: 0;
}

.workflow-bar.is-inline-header .workflow-left {
  flex: 0 1 auto;
  min-width: 0;
}

.workflow-bar.is-shell-integrated .workflow-left {
  width: auto;
  height: var(--shell-top-control-size);
  min-height: var(--shell-top-control-size);
  padding: 0;
}

.workflow-bar.is-shell-integrated .workflow-left {
  flex: 0 1 auto;
}

.workflow-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  font-size: 12px;
  font-weight: 560;
  line-height: 22px;
  color: color-mix(in srgb, var(--text-muted) 88%, transparent);
  white-space: nowrap;
  opacity: 0.9;
  font-variant-numeric: tabular-nums;
}

.workflow-bar.is-inline-header .workflow-meta {
  flex: 0 1 auto;
  gap: 4px;
}

.workflow-shell-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  line-height: 22px;
  color: color-mix(in srgb, var(--text-muted) 92%, transparent);
  opacity: 0.94;
  font-variant-numeric: tabular-nums;
}

.workflow-kind {
  color: color-mix(in srgb, var(--text-primary) 86%, transparent);
  font-weight: 600;
}

.workflow-phase {
  color: color-mix(in srgb, var(--text-muted) 86%, transparent);
  font-weight: 560;
}

.workflow-separator {
  color: color-mix(in srgb, var(--text-muted) 60%, transparent);
  font-weight: 500;
  opacity: 0.72;
}

.workflow-doc-tools {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  flex: 0 0 auto;
  min-height: 22px;
  padding: 0;
  border-radius: 0;
  background: transparent;
  border: 0;
}

.workflow-bar.is-inline-header .workflow-doc-tools {
  gap: 1px;
  min-height: 31px;
  height: 31px;
}

.workflow-bar.is-shell-integrated .workflow-doc-tools {
  gap: 2px;
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
  gap: 4px;
  padding: 0;
  height: auto;
  color: color-mix(in srgb, var(--text-muted) 82%, transparent);
}

.workflow-status-dot {
  width: 5px;
  height: 5px;
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
  color: color-mix(in srgb, var(--text-secondary) 86%, transparent);
  border-radius: 6px;
  background: transparent;
  opacity: 0.9;
  box-shadow: none;
  transition:
    background-color 140ms ease,
    color 140ms ease,
    opacity 140ms ease,
    box-shadow 140ms ease;
}

.workflow-bar.is-inline-header .workflow-primary-btn,
.workflow-bar.is-inline-header .workflow-secondary-btn {
  width: 31px;
  height: 31px;
  min-height: 31px;
  border-radius: 9px;
  color: color-mix(in srgb, var(--text-secondary) 78%, transparent);
  opacity: 0.74;
}

.workflow-bar.is-shell-integrated .workflow-primary-btn,
.workflow-bar.is-shell-integrated .workflow-secondary-btn {
  width: var(--shell-top-control-size);
  height: var(--shell-top-control-size);
  min-height: var(--shell-top-control-size);
  padding: 0;
  border-radius: var(--shell-top-control-radius);
  opacity: 0.74;
  background: transparent;
  box-shadow: none;
}

.workflow-primary-btn {
  color: color-mix(in srgb, var(--text-secondary) 88%, transparent);
}

.workflow-bar:hover .workflow-primary-btn,
.workflow-bar:hover .workflow-secondary-btn,
.workflow-bar:focus-within .workflow-primary-btn,
.workflow-bar:focus-within .workflow-secondary-btn {
  opacity: 0.88;
}

.workflow-bar.is-inline-header:hover .workflow-primary-btn,
.workflow-bar.is-inline-header:hover .workflow-secondary-btn,
.workflow-bar.is-inline-header:focus-within .workflow-primary-btn,
.workflow-bar.is-inline-header:focus-within .workflow-secondary-btn {
  opacity: 0.82;
}

.workflow-primary-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--surface-hover) 9%, transparent);
  color: var(--text-primary);
}

.workflow-secondary-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--surface-hover) 9%, transparent);
  color: var(--text-primary);
}

.workflow-bar.is-inline-header .workflow-primary-btn:hover:not(:disabled),
.workflow-bar.is-inline-header .workflow-secondary-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--surface-hover) 7%, transparent);
}

.workflow-secondary-btn {
  color: var(--text-secondary);
}

.workflow-secondary-btn.is-active {
  background: color-mix(in srgb, var(--surface-hover) 10%, transparent);
  color: var(--text-primary);
}

.workflow-bar.is-inline-header .workflow-secondary-btn.is-active {
  background: color-mix(in srgb, var(--surface-hover) 9%, transparent);
  color: color-mix(in srgb, var(--text-primary) 92%, transparent);
}

.workflow-bar.is-shell-integrated .workflow-primary-btn.is-active,
.workflow-bar.is-shell-integrated .workflow-secondary-btn.is-active {
  background: color-mix(in srgb, var(--surface-hover) 10%, transparent);
  color: var(--text-primary);
}

.workflow-bar.is-shell-integrated .workflow-primary-btn:hover:not(:disabled),
.workflow-bar.is-shell-integrated .workflow-secondary-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--surface-hover) 12%, transparent);
}

.workflow-secondary-btn-accent {
  color: var(--accent);
}

</style>
