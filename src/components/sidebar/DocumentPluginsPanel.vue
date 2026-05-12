<template>
  <div class="document-plugin-page">
    <div v-if="!container" class="document-plugin-page__empty">
      {{ t('No document plugins available') }}
    </div>

    <div v-else-if="usesDocumentActionPanel" class="document-plugin-page__shell">
      <ExtensionDocumentActionPanel
        :container="container"
        :presentation="documentActionPresentation"
        :target="resolvedTarget"
        :title="containerTitle"
      />
    </div>

    <div v-else class="document-plugin-page__shell">
      <div class="document-plugin-page__meta">
        <div class="document-plugin-page__title-row">
          <div class="document-plugin-page__title">{{ containerTitle }}</div>
          <ExtensionCountBadge
            v-if="containerBadge != null"
            :value="containerBadge"
            :title="containerBadgeTooltip"
          />
        </div>
        <div v-if="containerDescription" class="document-plugin-page__description">
          {{ containerDescription }}
        </div>
        <div v-if="targetSummary" class="document-plugin-page__target">
          {{ targetSummary }}
        </div>
        <ExtensionHostStatusSurface
          v-if="hostDiagnosticSummary"
          :title="t('Host Runtime')"
          :description="hostDiagnosticSummary"
          :tone-class="hostDiagnosticToneClass"
          :recovery-action="recoveryAction"
          compact
          @recover="void triggerRecoveryAction()"
        />
      </div>

      <div class="document-plugin-page__content">
        <div class="document-plugin-page__stack">
          <ExtensionSidebarPanel
            :key="container.panelId"
            :container="container"
            :context="extensionContext"
            :target="resolvedTarget"
          />
        </div>
        <section v-if="extensionTasks.length > 0" class="document-plugin-page__tasks">
          <div class="document-plugin-page__section-title">{{ t('Plugin Tasks') }}</div>
          <ExtensionTaskPanel :extension-id="container.extensionId" />
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { useExtensionsStore } from '../../stores/extensions'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../i18n'
import { useExtensionHostStatusPresentation } from '../../composables/useExtensionHostStatusPresentation'
import { buildExtensionContext } from '../../domains/extensions/extensionContext.js'
import { buildExtensionHostStatusSurface } from '../../domains/extensions/extensionHostStatusSurface'
import { buildExtensionPluginContainerPresentation } from '../../domains/extensions/extensionPluginContainerPresentation.js'
import { buildExtensionTargetSummary } from '../../domains/extensions/extensionTargetPresentation.js'
import ExtensionCountBadge from '../extensions/ExtensionCountBadge.vue'
import ExtensionDocumentActionPanel from '../extensions/ExtensionDocumentActionPanel.vue'
import ExtensionHostStatusSurface from '../extensions/ExtensionHostStatusSurface.vue'
import ExtensionSidebarPanel from '../extensions/ExtensionSidebarPanel.vue'
import ExtensionTaskPanel from '../extensions/ExtensionTaskPanel.vue'

const props = defineProps({
  filePath: { type: String, default: '' },
  panelId: { type: String, required: true },
})

const { t } = useI18n()
const workspace = useWorkspaceStore()
const extensionsStore = useExtensionsStore()

const fallbackTarget = computed(() => ({
  kind: String(props.filePath || '').toLowerCase().endsWith('.pdf') ? 'pdf' : 'workspace',
  referenceId: '',
  path: String(props.filePath || ''),
}))

const container = computed(() => extensionsStore.containerForPanelId(props.panelId))
const resolvedTarget = computed(() =>
  extensionsStore.sidebarTargetForPanel(props.panelId, fallbackTarget.value)
)

const extensionContext = computed(() =>
  buildExtensionContext(resolvedTarget.value, {
    workbench: {
      surface: 'workspace',
      panel: 'documentDock',
      activeView: String(props.panelId || ''),
      hasWorkspace: workspace.isOpen,
      workspaceFolder: workspace.path || '',
    },
  })
)

const firstView = computed(() => {
  const currentContainer = container.value
  if (!currentContainer) return null
  return extensionsStore.viewsForContainer(currentContainer.id, extensionContext.value)[0] || null
})

const firstViewState = computed(() => {
  const view = firstView.value
  if (!view) return null
  return extensionsStore.viewStateFor(`${view.extensionId}:${view.id}`) || null
})
const currentExtension = computed(() =>
  container.value?.extensionId
    ? extensionsStore.registry.find((entry) => entry.id === container.value.extensionId) || null
    : null
)
const fallbackDocumentActionCommandId = computed(() => {
  const commands = Array.isArray(currentExtension.value?.contributedCommands)
    ? currentExtension.value.contributedCommands
    : []
  if (commands.length !== 1) return ''
  const command = commands[0] || {}
  return String(command.commandId || command.command || '').trim()
})

const containerPresentation = computed(() =>
  buildExtensionPluginContainerPresentation(
    container.value || {},
    firstViewState.value || {},
    t,
  )
)
const containerTitle = computed(() => containerPresentation.value.title)
const containerDescription = computed(() => containerPresentation.value.description)
const containerBadge = computed(() => containerPresentation.value.badgeValue)
const containerBadgeTooltip = computed(() => containerPresentation.value.badgeTooltip)
const firstViewPresentation = computed(() => firstViewState.value?.presentation || {})
const usesDocumentActionPanel = computed(() => {
  const mode = String(firstViewPresentation.value?.mode || firstView.value?.presentation || '').trim()
  return mode === 'documentAction'
})
const latestTask = computed(() => extensionTasks.value[0] || null)
const documentActionPresentation = computed(() => {
  const base = firstViewPresentation.value && typeof firstViewPresentation.value === 'object'
    ? firstViewPresentation.value
    : {}
  const targetPath = String(base.target?.path || resolvedTarget.value.path || '').trim()
  const action = base.action && typeof base.action === 'object'
    ? base.action
    : {}
  const actionCommandId = String(
    action.commandId ||
    action.command ||
    fallbackDocumentActionCommandId.value ||
    '',
  ).trim()
  const baseTargetPath = String(base.target?.path || '').trim()
  const actionDisabled = Object.prototype.hasOwnProperty.call(action, 'disabled') &&
    baseTargetPath === targetPath
    ? Boolean(action.disabled)
    : !targetPath
  const presentation = {
    ...base,
    target: {
      ...(base.target || {}),
      label: String(base.target?.label || '').trim(),
      path: targetPath,
    },
    action: {
      ...action,
      commandId: actionCommandId,
      disabled: actionDisabled,
    },
  }
  const task = latestTask.value
  if (!task) return presentation
  const progress = task.progress || {}
  return {
    ...presentation,
    progress: {
      ...(presentation.progress || {}),
      label: progress.label || presentation.progress?.label || '',
      state: task.state || presentation.progress?.state || '',
      current: progress.current || presentation.progress?.current || 0,
      total: progress.total || presentation.progress?.total || 0,
    },
  }
})
const extensionTasks = computed(() =>
  container.value?.extensionId
    ? extensionsStore.recentTasksForExtension(container.value.extensionId)
    : []
)
const hostDiagnostics = computed(() =>
  container.value?.extensionId
    ? extensionsStore.hostDiagnosticsFor(container.value.extensionId, workspace.path || '')
    : null
)
const hostStatusSurface = computed(() =>
  buildExtensionHostStatusSurface(hostDiagnostics.value || {})
)
const {
  presentation: hostStatusPresentation,
  recoveryAction,
  triggerRecoveryAction,
} = useExtensionHostStatusPresentation(() => hostStatusSurface.value)

const targetSummaryPresentation = computed(() => buildExtensionTargetSummary(resolvedTarget.value))
const targetSummary = computed(() =>
  targetSummaryPresentation.value.available
    ? t(targetSummaryPresentation.value.textKey, targetSummaryPresentation.value.params)
    : ''
)

const hostDiagnosticSummary = computed(() => {
  return hostStatusPresentation.value.summaryText
})

const hostDiagnosticToneClass = computed(() => {
  return hostStatusPresentation.value.toneClass || ''
})

watch(
  () => ({
    extensionId: firstView.value?.extensionId || '',
    viewId: firstView.value?.id || '',
    mode: String(firstView.value?.presentation || '').trim(),
    targetKind: resolvedTarget.value.kind,
    targetPath: resolvedTarget.value.path,
    referenceId: resolvedTarget.value.referenceId,
  }),
  (next) => {
    if (next.mode !== 'documentAction' || !next.extensionId || !next.viewId) return
    void extensionsStore.resolveView(firstView.value, resolvedTarget.value).catch(() => {})
  },
  { immediate: true }
)

</script>

<style scoped>
.document-plugin-page {
  display: flex;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  overflow: hidden;
}

.document-plugin-page__shell {
  display: flex;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
}

.document-plugin-page__meta {
  display: flex;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px 0;
}

.document-plugin-page__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.document-plugin-page__title {
  min-width: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-plugin-page__description,
.document-plugin-page__target,
.document-plugin-page__empty {
  min-width: 0;
  color: var(--text-muted);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.document-plugin-page__content {
  display: flex;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  padding: 8px;
  overflow: hidden;
}

.document-plugin-page__stack {
  display: flex;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 0;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
}

.document-plugin-page__tasks {
  flex: 0 0 auto;
  border-top: 1px solid color-mix(in srgb, var(--border) 36%, transparent);
  padding-top: 8px;
}

.document-plugin-page__section-title {
  padding: 0 8px 6px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.document-plugin-page__empty {
  padding: 16px;
}
</style>
