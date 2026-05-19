<template>
  <section class="extension-sidebar-panel__section">
    <div class="extension-sidebar-panel__section-header">
      <div class="extension-sidebar-panel__view-title">
        {{ t(resolvedViewTitle(view)) }}
      </div>
      <div class="extension-sidebar-panel__view-meta">
        <span v-if="resolvedViewDescription(view)">{{ resolvedViewDescription(view) }}</span>
        <span v-else>{{ view.id }}</span>
      </div>
      <ExtensionCountBadge
        v-if="resolvedViewBadge(view) != null"
        :value="resolvedViewBadge(view)"
        :title="resolvedViewBadgeTooltip(view)"
      />
    </div>

    <div v-if="resolvedViewMessage(view)" class="extension-sidebar-panel__view-message">
      {{ resolvedViewMessage(view) }}
    </div>

    <div v-if="resolvedViewStatusLabel(view)" class="extension-sidebar-panel__status">
      <ExtensionStatusPill
        :label="resolvedViewStatusLabel(view)"
        :tone-class="statusToneClass(resolvedViewStatusTone(view))"
      />
      <span v-if="resolvedViewActionLabel(view)" class="extension-sidebar-panel__status-action">
        {{ resolvedViewActionLabel(view) }}
      </span>
    </div>

    <div v-if="resolvedViewSections(view).length > 0" class="extension-sidebar-panel__summary">
      <ExtensionSummaryCard
        v-for="section in resolvedViewSections(view)"
        :key="section.id"
        :title="section.title"
        :value="section.value"
        :tone-class="summaryToneClass(section.tone)"
      />
    </div>

    <div v-if="resolvedViewResults(view).length > 0" class="extension-sidebar-panel__results">
      <div class="extension-sidebar-panel__results-title">{{ t('Results') }}</div>
      <button
        v-for="entry in resolvedViewResults(view)"
        :key="entry.id"
        type="button"
        class="extension-sidebar-panel__result-entry"
        :class="{ 'is-active': isActiveResultEntry(view, entry) }"
        @click="$emit('select-result-entry', view, entry)"
      >
        <span class="extension-sidebar-panel__result-label">{{ entry.label }}</span>
        <span v-if="entry.description" class="extension-sidebar-panel__result-description">
          {{ entry.description }}
        </span>
      </button>
    </div>

    <ExtensionResultPreview
      v-if="activeResultEntry(view)"
      :entry="activeResultEntry(view)"
      :busy-action-key="resultActionBusyKey"
      @run-action="$emit('open-result-entry', $event)"
    />

    <div v-if="resolvedItems(view).length === 0" class="extension-sidebar-panel__empty">
      {{ t('No extension view items found') }}
    </div>

    <div class="extension-sidebar-panel__tree">
      <ExtensionSidebarTreeNode
        v-for="item in resolvedItems(view)"
        :key="`${view.extensionId}:${view.id}:${item.handle || item.id}`"
        :view="view"
        :item="item"
        :context="context"
        :depth="0"
        :expanded-item-keys="expandedItemKeys"
        :child-items-resolver="(entry) => resolvedChildItems(view, entry)"
        @run-command="(item) => $emit('run-item-command', view, item)"
        @toggle-expand="(item) => $emit('toggle-item-expansion', view, item)"
        @run-item-action="$emit('run-header-action', $event)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from '../../i18n'
import ExtensionCountBadge from './ExtensionCountBadge.vue'
import ExtensionResultPreview from './ExtensionResultPreview.vue'
import ExtensionSidebarTreeNode from './ExtensionSidebarTreeNode.vue'
import ExtensionStatusPill from './ExtensionStatusPill.vue'
import ExtensionSummaryCard from './ExtensionSummaryCard.vue'

defineEmits([
  'open-result-entry',
  'run-header-action',
  'run-item-command',
  'select-result-entry',
  'toggle-item-expansion',
])

defineProps({
  view: { type: Object, required: true },
  context: { type: Object, default: () => ({}) },
  expandedItemKeys: { type: Object, default: () => ({}) },
  resultActionBusyKey: { type: String, default: '' },
  activeResultEntry: { type: Function, required: true },
  isActiveResultEntry: { type: Function, required: true },
  resolvedChildItems: { type: Function, required: true },
  resolvedItems: { type: Function, required: true },
  resolvedViewActionLabel: { type: Function, required: true },
  resolvedViewBadge: { type: Function, required: true },
  resolvedViewBadgeTooltip: { type: Function, required: true },
  resolvedViewDescription: { type: Function, required: true },
  resolvedViewMessage: { type: Function, required: true },
  resolvedViewResults: { type: Function, required: true },
  resolvedViewSections: { type: Function, required: true },
  resolvedViewStatusLabel: { type: Function, required: true },
  resolvedViewStatusTone: { type: Function, required: true },
  resolvedViewTitle: { type: Function, required: true },
  statusToneClass: { type: Function, required: true },
  summaryToneClass: { type: Function, required: true },
})

const { t } = useI18n()
</script>

<style scoped>
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

.extension-sidebar-panel__view-meta,
.extension-sidebar-panel__empty {
  color: var(--text-muted);
  font-size: 11px;
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
</style>
