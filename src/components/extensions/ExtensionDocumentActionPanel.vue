<template>
  <section class="extension-document-action-panel" :aria-label="title || t('Extension action')">
    <div class="extension-document-action-panel__target">
      <div class="extension-document-action-panel__target-label">
        {{ t('Current file') }}
      </div>
      <div
        class="extension-document-action-panel__filename"
        :class="{ 'is-empty': !activeFilename }"
        :title="targetPath || activeFilename"
      >
        {{ activeFilename || emptyLabel }}
      </div>
    </div>

    <ExtensionBlockedActionButton
      :blocked="blockPresentation.blocked"
      :blocked-label="blockPresentation.label"
      :blocked-message="blockPresentation.message"
      :disabled="buttonDisabled"
      :label="buttonLabel"
      :loading="busy"
      :title="buttonLabel"
      block
      size="md"
      variant="primary"
      @click="runAction"
    />

    <div class="extension-document-action-panel__progress">
      <div class="extension-document-action-panel__progress-row">
        <span>{{ t('Progress') }}</span>
        <span class="extension-document-action-panel__progress-state" :class="progressToneClass">
          {{ progressLabel }}
        </span>
      </div>
      <div
        class="extension-document-action-panel__progress-track"
        role="progressbar"
        :aria-valuemin="0"
        :aria-valuemax="progressTotal || 100"
        :aria-valuenow="progressCurrent"
      >
        <span :style="{ width: progressWidth }"></span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '../../i18n'
import { useExtensionsStore } from '../../stores/extensions'
import { useToastStore } from '../../stores/toast'
import { useWorkspaceStore } from '../../stores/workspace'
import { buildExtensionCommandHostState } from '../../domains/extensions/extensionCommandHostState'
import { buildExtensionProgressPresentation } from '../../domains/extensions/extensionProgressPresentation'
import { describeExtensionHostStatePresentation } from '../../domains/extensions/extensionRuntimeBlockPresentation'
import { useBasename } from '../../composables/useFileMetadata'
import ExtensionBlockedActionButton from './ExtensionBlockedActionButton.vue'

const props = defineProps({
  container: { type: Object, required: true },
  presentation: { type: Object, default: () => ({}) },
  target: { type: Object, default: () => ({}) },
  title: { type: String, default: '' },
})

const { t } = useI18n()
const extensionsStore = useExtensionsStore()
const workspaceStore = useWorkspaceStore()
const toastStore = useToastStore()
const busy = ref(false)

const targetPath = computed(() =>
  String(props.presentation?.target?.path || props.target?.path || '').trim()
)
const targetBasename = useBasename(targetPath)
const activeFilename = computed(() =>
  String(props.presentation?.target?.label || targetBasename.value || '').trim()
)
const emptyLabel = computed(() =>
  String(props.presentation?.target?.emptyLabel || '').trim() || t('No active PDF')
)
const actionCommandId = computed(() => String(props.presentation?.action?.commandId || '').trim())
const buttonLabel = computed(() =>
  String(props.presentation?.action?.label || '').trim() || t('Translate')
)
const actionDisabled = computed(() => Boolean(props.presentation?.action?.disabled))
const progress = computed(() => props.presentation?.progress || {})
const progressPresentation = computed(() => buildExtensionProgressPresentation(progress.value))
const progressCurrent = computed(() => progressPresentation.value.current)
const progressTotal = computed(() => progressPresentation.value.total)
const progressLabel = computed(() =>
  progressPresentation.value.label || t('Not started')
)
const progressWidth = computed(() => progressPresentation.value.width)
const progressToneClass = computed(() => progressPresentation.value.toneClass)
const hostState = computed(() => {
  if (!props.container?.extensionId) return buildExtensionCommandHostState()
  return buildExtensionCommandHostState(
    extensionsStore.hostDiagnosticsFor(props.container.extensionId, workspaceStore.path || '')
  )
})
const blockPresentation = computed(() => describeExtensionHostStatePresentation(hostState.value, t))
const buttonDisabled = computed(() =>
  busy.value ||
  actionDisabled.value ||
  !targetPath.value ||
  !actionCommandId.value ||
  blockPresentation.value.blocked
)

async function runAction() {
  if (buttonDisabled.value) return
  busy.value = true
  try {
    await extensionsStore.executeCommand({
      extensionId: props.container.extensionId,
      commandId: actionCommandId.value,
    }, {
      kind: String(props.target?.kind || 'pdf'),
      referenceId: String(props.target?.referenceId || ''),
      path: targetPath.value,
    })
    toastStore.show(t('Extension task started'), { type: 'success', duration: 2200 })
  } catch (error) {
    toastStore.show(error?.message || String(error || t('Failed to start extension task')), {
      type: 'error',
      duration: 4200,
    })
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.extension-document-action-panel {
  display: flex;
  align-self: stretch;
  flex: 1 1 auto;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
  padding: 4px 2px 0;
}

.extension-document-action-panel__target {
  display: flex;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.extension-document-action-panel :deep(.ui-button) {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.extension-document-action-panel :deep(.ui-button-label) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.extension-document-action-panel__target-label,
.extension-document-action-panel__progress-row {
  min-width: 0;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
}

.extension-document-action-panel__filename {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--border) 64%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--surface-base) 88%, transparent);
  padding: 9px 10px;
  color: var(--text-primary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.extension-document-action-panel__filename.is-empty {
  color: var(--text-muted);
}

.extension-document-action-panel__progress {
  display: flex;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  flex-direction: column;
  gap: 7px;
}

.extension-document-action-panel__progress-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
}

.extension-document-action-panel__progress-state {
  min-width: 0;
  color: var(--text-muted);
  font-weight: 500;
  text-align: right;
}

.extension-document-action-panel__progress-state.is-running {
  color: var(--accent);
}

.extension-document-action-panel__progress-state.is-success {
  color: var(--success);
}

.extension-document-action-panel__progress-state.is-error {
  color: var(--error);
}

.extension-document-action-panel__progress-track {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-hover) 70%, transparent);
}

.extension-document-action-panel__progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
  transition: width 160ms ease;
}
</style>
