<template>
  <div class="extension-sidebar-panel">
    <div class="extension-sidebar-panel__header">
      <div class="extension-sidebar-panel__header-main">
        <div class="extension-sidebar-panel__title">{{ title }}</div>
        <div class="extension-sidebar-panel__meta">{{ extensionName }}</div>
      </div>
      <div class="extension-sidebar-panel__header-actions">
        <ExtensionBlockedActionButton
          v-for="action in viewTitleActionsWithState"
          :key="`${action.extensionId}:${action.commandId}`"
          native
          :extra-class="['extension-sidebar-panel__refresh', action.blocked ? 'is-blocked' : '']"
          :blocked="action.blocked"
          :blocked-label="action.blockedLabel"
          :blocked-message="action.blockedMessage"
          :label="t(action.title || action.commandId)"
          :title="t(action.title || action.commandId)"
          @click="runHeaderAction(action)"
        />
        <button type="button" class="extension-sidebar-panel__refresh" @click="refreshViews">
          {{ t('Refresh') }}
        </button>
      </div>
    </div>

    <div v-if="views.length === 0" class="extension-sidebar-panel__empty">
      {{ t('No extension views found') }}
    </div>

    <div v-else class="extension-sidebar-panel__views">
      <ExtensionSidebarViewSection
        v-for="view in views"
        :key="resolvedViewKey(view)"
        :view="view"
        :context="props.context"
        :expanded-item-keys="expandedItemKeys"
        :result-action-busy-key="resultActionBusyKey"
        :active-result-entry="activeResultEntry"
        :is-active-result-entry="isActiveResultEntry"
        :resolved-child-items="resolvedChildItems"
        :resolved-items="resolvedItems"
        :resolved-view-action-label="resolvedViewActionLabel"
        :resolved-view-badge="resolvedViewBadge"
        :resolved-view-badge-tooltip="resolvedViewBadgeTooltip"
        :resolved-view-description="resolvedViewDescription"
        :resolved-view-message="resolvedViewMessage"
        :resolved-view-results="resolvedViewResults"
        :resolved-view-sections="resolvedViewSections"
        :resolved-view-status-label="resolvedViewStatusLabel"
        :resolved-view-status-tone="resolvedViewStatusTone"
        :resolved-view-title="resolvedViewTitle"
        :status-tone-class="statusToneClass"
        :summary-tone-class="summaryToneClass"
        @open-result-entry="openResultEntry"
        @run-header-action="runHeaderAction"
        @run-item-command="runItemCommand"
        @select-result-entry="selectResultEntry"
        @toggle-item-expansion="toggleItemExpansion"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from '../../i18n'
import { useExtensionsStore } from '../../stores/extensions'
import { useToastStore } from '../../stores/toast'
import { describeExtensionCommandError } from '../../domains/extensions/extensionCommandHostState'
import {
  buildExtensionSidebarHeaderActionsState,
  extensionSidebarViewKey,
  isExtensionSidebarActiveResultEntry,
  isExtensionSidebarTreeItemExpandable,
  isExtensionSidebarTreeItemExpanded,
  resolveExtensionSidebarActiveResultEntry,
  resolveExtensionSidebarItemExpansionKey,
  resolveExtensionSidebarPanelExtensionName,
  resolveExtensionSidebarPanelTitle,
  resolveExtensionSidebarResultActionKey,
  resolveExtensionSidebarResultActionMessageKey,
  resolveExtensionSidebarViewPresentation,
} from '../../domains/extensions/extensionSidebarPresentation'
import { normalizeExtensionToneClass } from '../../domains/extensions/extensionToneClass'
import ExtensionBlockedActionButton from './ExtensionBlockedActionButton.vue'
import ExtensionSidebarViewSection from './ExtensionSidebarViewSection.vue'

const props = defineProps({
  container: { type: Object, required: true },
  context: { type: Object, default: () => ({}) },
  target: { type: Object, default: () => ({}) },
})

const { t } = useI18n()
const extensionsStore = useExtensionsStore()
const toastStore = useToastStore()
const activeResultEntryKeys = ref({})
const resultActionBusyKey = ref('')

const title = computed(() =>
  resolveExtensionSidebarPanelTitle({
    container: props.container,
    translate: t,
  })
)
const extensionName = computed(() => resolveExtensionSidebarPanelExtensionName(props.container))
const views = computed(() => extensionsStore.viewsForContainer(props.container?.id, props.context))
const expandedItemKeys = ref({})
const hostDiagnostics = computed(() =>
  props.container?.extensionId
    ? extensionsStore.hostDiagnosticsFor(props.container.extensionId)
    : {}
)
const viewTitleActions = computed(() => {
  const firstView = views.value[0] || {}
  return extensionsStore.viewTitleActionsForView(firstView, props.context)
})
const viewTitleActionsWithState = computed(() =>
  buildExtensionSidebarHeaderActionsState({
    actions: viewTitleActions.value,
    hostDiagnostics: hostDiagnostics.value,
    translate: t,
  })
)
const resolvedViewRefreshTokens = computed(() =>
  views.value.map((view) => ({
    key: resolvedViewKey(view),
    token: extensionsStore.viewRefreshTickFor(resolvedViewKey(view)),
  }))
)
const viewControllerTokens = computed(() =>
  views.value.map((view) => {
    const key = resolvedViewKey(view)
    const controller = extensionsStore.viewControllerStateFor(key) || {}
    return {
      key,
      selectedHandle: String(controller.selectedHandle || ''),
      focusedHandle: String(controller.focusedHandle || ''),
      revealedPathHandles: Array.isArray(controller.revealedPathHandles)
        ? controller.revealedPathHandles.join('|')
        : '',
    }
  })
)

watch(
  views,
  (nextViews) => {
    for (const view of nextViews) {
      void refreshSingleView(view).catch(() => {})
    }
  },
  { immediate: true }
)

watch(resolvedViewRefreshTokens, (next, previous = []) => {
  const previousTokens = new Map(previous.map((entry) => [entry.key, entry.token]))
  const changedViews = next
    .filter((entry) => previousTokens.has(entry.key) && previousTokens.get(entry.key) !== entry.token)
    .map((entry) => views.value.find((view) => resolvedViewKey(view) === entry.key))
    .filter(Boolean)

  for (const view of changedViews) {
    void refreshSingleView(view).catch(() => {})
  }
})

watch(viewControllerTokens, (next, previous = []) => {
  const previousTokens = new Map(previous.map((entry) => [entry.key, entry]))
  const changedViews = next
    .filter((entry) => {
      const previousEntry = previousTokens.get(entry.key)
      if (!previousEntry) return true
      return previousEntry.selectedHandle !== entry.selectedHandle
        || previousEntry.focusedHandle !== entry.focusedHandle
        || previousEntry.revealedPathHandles !== entry.revealedPathHandles
    })
    .map((entry) => views.value.find((view) => resolvedViewKey(view) === entry.key))
    .filter(Boolean)

  for (const view of changedViews) {
    void applyViewControllerState(view).catch(() => {})
  }
}, { immediate: true })

function resolvedViewKey(view = {}) {
  return extensionSidebarViewKey(view)
}

function resolvedViewRecord(view = {}) {
  return extensionsStore.resolvedViewFor(resolvedViewKey(view))
}

function resolvedViewPresentation(view = {}) {
  return resolveExtensionSidebarViewPresentation({
    view,
    viewState: extensionsStore.viewStateFor(resolvedViewKey(view)),
    resolvedView: resolvedViewRecord(view),
  })
}

function resolvedViewTitle(view = {}) {
  return resolvedViewPresentation(view).title
}

function resolvedViewDescription(view = {}) {
  return resolvedViewPresentation(view).description
}

function resolvedViewMessage(view = {}) {
  return resolvedViewPresentation(view).message
}

function resolvedViewStatusLabel(view = {}) {
  return resolvedViewPresentation(view).statusLabel
}

function resolvedViewStatusTone(view = {}) {
  return resolvedViewPresentation(view).statusTone
}

function resolvedViewActionLabel(view = {}) {
  return resolvedViewPresentation(view).actionLabel
}

function resolvedViewBadge(view = {}) {
  return resolvedViewPresentation(view).badgeValue
}

function resolvedViewBadgeTooltip(view = {}) {
  return resolvedViewPresentation(view).badgeTooltip
}

function resolvedViewSections(view = {}) {
  return resolvedViewPresentation(view).sections
}

function resolvedViewResults(view = {}) {
  return resolvedViewPresentation(view).resultEntries
}

function viewResultStateKey(view = {}) {
  return resolvedViewKey(view)
}

function activeResultEntry(view = {}) {
  return resolveExtensionSidebarActiveResultEntry({
    resultEntries: resolvedViewResults(view),
    selectedEntryId: activeResultEntryKeys.value[viewResultStateKey(view)],
  })
}

function isActiveResultEntry(view = {}, entry = {}) {
  return isExtensionSidebarActiveResultEntry({
    activeEntry: activeResultEntry(view),
    entry,
  })
}

function selectResultEntry(view = {}, entry = {}) {
  const key = viewResultStateKey(view)
  activeResultEntryKeys.value = {
    ...activeResultEntryKeys.value,
    [key]: String(entry?.id || ''),
  }
}

function resolvedItems(view = {}) {
  return extensionsStore.resolvedViewChildrenFor(resolvedViewKey(view), '')
}

function resolvedChildItems(view = {}, item = {}) {
  return extensionsStore.resolvedViewChildrenFor(
    resolvedViewKey(view),
    item.handle || item.id,
  )
}

function viewControllerState(view = {}) {
  return extensionsStore.viewControllerStateFor(resolvedViewKey(view)) || {}
}

function isExpandable(item = {}) {
  return isExtensionSidebarTreeItemExpandable(item)
}

function itemExpansionKey(view = {}, item = {}) {
  return resolveExtensionSidebarItemExpansionKey(view, item)
}

function isItemExpanded(view = {}, item = {}) {
  return isExtensionSidebarTreeItemExpanded({
    view,
    item,
    expandedItemKeys: expandedItemKeys.value,
    controllerState: viewControllerState(view),
  })
}

async function loadExpandedChildren(view = {}, items = []) {
  for (const item of items) {
    if (!isExpandable(item) || !isItemExpanded(view, item)) continue
    await extensionsStore.resolveView(view, props.target, {}, item.handle || item.id).catch(() => {})
    const children = resolvedChildItems(view, item)
    if (children.length > 0) {
      await loadExpandedChildren(view, children)
    }
  }
}

function fallbackCommandForView(view = {}, item = {}) {
  const itemCommandId = String(item?.commandId || '').trim()
  const extension = extensionsStore.registry.find((entry) => entry.id === view.extensionId)
  if (!extension) return null
  if (itemCommandId) {
    return (extension.contributedCommands || []).find((command) => command.commandId === itemCommandId) || null
  }
  return (extension.contributedCommands || [])[0] || null
}

async function runItemCommand(view = {}, item = {}) {
  await extensionsStore.notifyViewSelection(view, item?.handle || item?.id || '').catch(() => {})
  extensionsStore.setViewControllerState(resolvedViewKey(view), {
    selectedHandle: String(item?.handle || item?.id || ''),
    focusedHandle: String(item?.handle || item?.id || ''),
  })
  if (isExpandable(item) && !item.commandId) {
    await toggleItemExpansion(view, item)
    return
  }
  const command = fallbackCommandForView(view, item)
  if (!command) {
    toastStore.show(t('No extension commands found'), { type: 'error', duration: 3200 })
    return
  }
  try {
    await extensionsStore.executeCommand({
      ...command,
      extensionId: view.extensionId,
      itemId: String(item?.id || ''),
      itemHandle: String(item?.handle || ''),
    }, props.target)
    toastStore.show(t('Extension task started'), { type: 'success', duration: 2400 })
  } catch (error) {
    const commandError = describeExtensionCommandError(error, t('Failed to start extension task'))
    toastStore.show(
      commandError.messageKey
        ? t(commandError.messageKey, commandError.messageParams)
        : commandError.messageText || t('Failed to start extension task'),
      {
        type: commandError.type,
        duration: 4200,
      },
    )
  }
}

async function runHeaderAction(action = {}) {
  const command = fallbackCommandForView({ extensionId: action.extensionId }, action)
  if (!command) return
  try {
    await extensionsStore.executeCommand({
      ...command,
      extensionId: action.extensionId,
      commandId: action.commandId || command.commandId,
    }, props.target)
    toastStore.show(t('Extension task started'), { type: 'success', duration: 2400 })
  } catch (error) {
    const commandError = describeExtensionCommandError(error, t('Failed to start extension task'))
    toastStore.show(
      commandError.messageKey
        ? t(commandError.messageKey, commandError.messageParams)
        : commandError.messageText || t('Failed to start extension task'),
      {
        type: commandError.type,
        duration: 4200,
      },
    )
  }
}

async function refreshViews() {
  for (const view of views.value) {
    await refreshSingleView(view).catch(() => {})
  }
}

async function refreshSingleView(view = {}) {
  await extensionsStore.resolveView(view, props.target).catch(() => {})
  await loadExpandedChildren(view, resolvedItems(view))
  await applyViewControllerState(view)
}

async function toggleItemExpansion(view = {}, item = {}) {
  if (!isExpandable(item)) return
  const key = itemExpansionKey(view, item)
  const nextExpanded = !isItemExpanded(view, item)
  expandedItemKeys.value = {
    ...expandedItemKeys.value,
    [key]: nextExpanded,
  }
  if (!nextExpanded) return
  await extensionsStore.resolveView(view, props.target, {}, item.handle || item.id).catch(() => {})
}

function markExpandedForHandle(view = {}, handle = '', expanded = true) {
  const normalizedHandle = String(handle || '').trim()
  if (!normalizedHandle) return
  const key = resolveExtensionSidebarItemExpansionKey(view, { handle: normalizedHandle })
  expandedItemKeys.value = {
    ...expandedItemKeys.value,
    [key]: Boolean(expanded),
  }
}

async function ensureItemChainLoaded(view = {}, handles = []) {
  let parentHandle = ''
  for (const handle of handles) {
    const normalized = String(handle || '').trim()
    if (!normalized) continue
    const existingChildren = extensionsStore.resolvedViewChildrenFor(
      resolvedViewKey(view),
      parentHandle,
    )
    const exists = existingChildren.some((item) => String(item?.handle || item?.id || '') === normalized)
    if (!exists) {
      await extensionsStore.resolveView(view, props.target, {}, parentHandle).catch(() => {})
    }
    markExpandedForHandle(view, normalized, true)
    parentHandle = normalized
  }
}

async function applyViewControllerState(view = {}) {
  const controller = viewControllerState(view)
  const revealedPathHandles = Array.isArray(controller.revealedPathHandles)
    ? controller.revealedPathHandles.map((entry) => String(entry || '').trim()).filter(Boolean)
    : []
  if (revealedPathHandles.length > 0) {
    await ensureItemChainLoaded(view, revealedPathHandles)
    await loadExpandedChildren(view, resolvedItems(view))
  }
}

const statusToneClass = normalizeExtensionToneClass
const summaryToneClass = normalizeExtensionToneClass

function describeResultAction(entry = {}) {
  const messageKey = resolveExtensionSidebarResultActionMessageKey(entry)
  return messageKey ? t(messageKey) : ''
}

function resultActionKey(entry = {}) {
  return resolveExtensionSidebarResultActionKey(entry)
}

async function openResultEntry(entry = {}) {
  const busyKey = resultActionKey(entry)
  resultActionBusyKey.value = busyKey
  try {
    await extensionsStore.runResultEntryAction(entry, props.target)
    const successMessage = describeResultAction(entry)
    if (successMessage) {
      toastStore.show(successMessage, { type: 'success', duration: 2200 })
    }
  } catch (error) {
    const commandError = describeExtensionCommandError(error, t('Failed to open result entry'))
    toastStore.show(
      commandError.messageKey
        ? t(commandError.messageKey, commandError.messageParams)
        : commandError.messageText || t('Failed to open result entry'),
      {
        type: commandError.type,
        duration: 4200,
      },
    )
  } finally {
    if (resultActionBusyKey.value === busyKey) {
      resultActionBusyKey.value = ''
    }
  }
}
</script>

<style scoped>
.extension-sidebar-panel {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
  padding: 6px 2px 0;
}

.extension-sidebar-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 0 8px;
}

.extension-sidebar-panel__header-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.extension-sidebar-panel__header-main {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
}

.extension-sidebar-panel__title {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
}

.extension-sidebar-panel__meta,
.extension-sidebar-panel__view-meta,
.extension-sidebar-panel__empty {
  color: var(--text-muted);
  font-size: 11px;
}

.extension-sidebar-panel__views {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  padding: 0 6px 8px;
}

.extension-sidebar-panel__tree {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.extension-sidebar-panel__section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.extension-sidebar-panel__section-header {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
  padding: 0 4px;
}

.extension-sidebar-panel__view-message {
  padding: 0 4px;
  color: var(--text-muted);
  font-size: 11px;
}

.extension-sidebar-panel__status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px;
}

.extension-sidebar-panel__status-action {
  color: var(--text-muted);
  font-size: 11px;
}

.extension-sidebar-panel__summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
  padding: 0 4px;
}

.extension-sidebar-panel__results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 4px;
}

.extension-sidebar-panel__results-title {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
}

.extension-sidebar-panel__result-entry {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
  border: 1px solid color-mix(in srgb, var(--border) 35%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-base) 82%, transparent);
  padding: 10px;
  text-align: left;
  cursor: pointer;
}

.extension-sidebar-panel__result-entry.is-active {
  border-color: color-mix(in srgb, var(--accent) 38%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface-base));
}

.extension-sidebar-panel__result-entry:hover {
  background: var(--surface-hover);
}

.extension-sidebar-panel__result-label {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
}

.extension-sidebar-panel__result-description {
  color: var(--text-muted);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.extension-sidebar-panel__empty {
  padding: 0 10px;
}

.extension-sidebar-panel__refresh {
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
}

</style>
