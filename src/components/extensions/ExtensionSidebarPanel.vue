<template>
  <div class="extension-sidebar-panel">
    <ExtensionSidebarHeader
      :actions="viewTitleActionsWithState"
      :extension-name="extensionName"
      :title="title"
      @refresh="refreshViews"
      @run-action="runHeaderAction"
    />

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

<script setup lang="ts">
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
import ExtensionSidebarHeader from './ExtensionSidebarHeader.vue'
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

.extension-sidebar-panel__empty {
  padding: 0 10px;
}
</style>
