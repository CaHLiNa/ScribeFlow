<template>
  <div class="extension-tree-node">
    <div class="extension-tree-node__row" :style="{ '--extension-tree-depth': depth }">
      <button
        v-if="isExpandable"
        type="button"
        class="extension-tree-node__chevron"
        @click.stop="$emit('toggle-expand', item)"
      >
        {{ expanded ? '▾' : '▸' }}
      </button>
      <span v-else class="extension-tree-node__chevron extension-tree-node__chevron--empty"></span>

      <ExtensionSidebarTreePrimaryButton
        :selected="isSelected"
        :focused="isFocused"
        :blocked="primaryBlocked"
        :icon="item.icon"
        :label="item.label"
        :meta="item.description"
        :title="primaryBlocked ? blockedMessage : (item.tooltip || item.description || '')"
        :blocked-label="blockedLabel"
        :blocked-message="blockedMessage"
        :blocked-tone-class="blockPresentation.toneClass"
        @click="$emit('run-command', item)"
      />

      <div v-if="itemActions.length > 0" class="extension-tree-node__actions">
        <ExtensionBlockedActionButton
          v-for="action in itemActions"
          :key="`${action.extensionId}:${action.commandId}:${item.id}`"
          native
          :extra-class="['extension-tree-node__action', secondaryBlocked(action) ? 'extension-tree-node__action--blocked' : '']"
          :blocked="secondaryBlocked(action)"
          :blocked-label="blockedLabel"
          :blocked-message="blockedMessage"
          :label="t(action.title || action.commandId)"
          :title="t(action.title || action.commandId)"
          @click.stop="$emit('run-item-action', action)"
        />
      </div>
    </div>

    <div v-if="isExpandable && expanded && childItems.length > 0" class="extension-tree-node__children">
      <ExtensionSidebarTreeNode
        v-for="child in childItems"
        :key="`${view.extensionId}:${view.id}:${child.handle || child.id}`"
        :view="view"
        :item="child"
        :context="context"
        :depth="depth + 1"
        :expanded-item-keys="expandedItemKeys"
        :child-items-resolver="childItemsResolver"
        @run-command="$emit('run-command', $event)"
        @toggle-expand="$emit('toggle-expand', $event)"
        @run-item-action="$emit('run-item-action', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '../../i18n'
import { useExtensionsStore } from '../../stores/extensions'
import { buildExtensionActionSurfaceState } from '../../domains/extensions/extensionActionSurfaceState'
import { describeExtensionRuntimeBlockPresentation } from '../../domains/extensions/extensionRuntimeBlockPresentation'
import ExtensionBlockedActionButton from './ExtensionBlockedActionButton.vue'
import ExtensionSidebarTreePrimaryButton from './ExtensionSidebarTreePrimaryButton.vue'

defineOptions({ name: 'ExtensionSidebarTreeNode' })

const props = defineProps({
  view: { type: Object, required: true },
  item: { type: Object, required: true },
  context: { type: Object, default: () => ({}) },
  depth: { type: Number, default: 0 },
  expandedItemKeys: { type: Object, required: true },
  childItemsResolver: { type: Function, required: true },
})

defineEmits(['run-command', 'toggle-expand', 'run-item-action'])

const { t } = useI18n()
const extensionsStore = useExtensionsStore()

const itemKey = computed(() => `${props.view.extensionId}:${props.view.id}:${props.item.handle || props.item.id}`)
const isExpandable = computed(() => {
  const state = String(props.item?.collapsibleState || '')
  return state && state !== 'none'
})
const expanded = computed(() => {
  if (props.expandedItemKeys?.[itemKey.value] != null) {
    return Boolean(props.expandedItemKeys[itemKey.value])
  }
  return String(props.item?.collapsibleState || '') === 'expanded'
})
const childItems = computed(() => props.childItemsResolver(props.item))
const itemActions = computed(() => extensionsStore.viewItemActionsForItem(props.view, props.item, props.context))
const controllerState = computed(() => extensionsStore.viewControllerStateFor(`${props.view.extensionId}:${props.view.id}`) || {})
const currentHandle = computed(() => String(props.item?.handle || props.item?.id || ''))
const isSelected = computed(() => currentHandle.value && currentHandle.value === String(controllerState.value.selectedHandle || ''))
const isFocused = computed(() => currentHandle.value && currentHandle.value === String(controllerState.value.focusedHandle || ''))
const hostDiagnostics = computed(() => extensionsStore.hostDiagnosticsFor(props.view.extensionId))
const actionSurfaceState = computed(() =>
  buildExtensionActionSurfaceState({
    hostDiagnostics: hostDiagnostics.value,
    primaryTreeItem: props.item,
  })
)
const blockPresentation = computed(() =>
  describeExtensionRuntimeBlockPresentation(actionSurfaceState.value.runtimeBlock, t)
)
const primaryBlocked = computed(() => actionSurfaceState.value.primaryTreeItemBlocked)
const blockedLabel = computed(() => blockPresentation.value.label)
const blockedMessage = computed(() => blockPresentation.value.message)

function secondaryBlocked(action = {}) {
  return buildExtensionActionSurfaceState({
    hostDiagnostics: hostDiagnostics.value,
    treeAction: action,
  }).treeActionBlocked
}
</script>

<style scoped>
.extension-tree-node {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.extension-tree-node__row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: start;
  gap: 6px;
  padding-left: calc(var(--extension-tree-depth, 0) * 14px);
}

.extension-tree-node__chevron,
.extension-tree-node__action {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.extension-tree-node__chevron {
  width: 18px;
  height: 18px;
  padding: 0;
  color: var(--text-muted);
}

.extension-tree-node__chevron--empty {
  cursor: default;
}

.extension-tree-node__action:disabled {
  cursor: not-allowed;
}

.extension-tree-node__chevron:hover:not(.extension-tree-node__chevron--empty),
.extension-tree-node__action:hover:not(:disabled) {
  background: var(--surface-hover);
}

.extension-tree-node__actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.extension-tree-node__action {
  color: var(--text-muted);
  font-size: 10px;
}

.extension-tree-node__action--blocked {
  color: color-mix(in srgb, var(--warning) 78%, var(--text-primary));
}

.extension-tree-node__children {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
