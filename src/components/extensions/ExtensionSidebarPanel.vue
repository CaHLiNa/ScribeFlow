<template>
  <div class="extension-sidebar-panel">
    <div class="extension-sidebar-panel__header">
      <div class="extension-sidebar-panel__header-main">
        <div class="extension-sidebar-panel__title">{{ title }}</div>
        <div class="extension-sidebar-panel__meta">{{ extensionName }}</div>
      </div>
      <button type="button" class="extension-sidebar-panel__refresh" @click="refreshViews">
        {{ t('Refresh') }}
      </button>
    </div>

    <div v-if="views.length === 0" class="extension-sidebar-panel__empty">
      {{ t('No extension views found') }}
    </div>

    <div v-else class="extension-sidebar-panel__views">
      <section
        v-for="view in views"
        :key="`${view.extensionId}:${view.id}`"
        class="extension-sidebar-panel__section"
      >
        <div class="extension-sidebar-panel__section-header">
          <div class="extension-sidebar-panel__view-title">
            {{ t(resolvedViewTitle(view)) }}
          </div>
          <div class="extension-sidebar-panel__view-meta">{{ view.id }}</div>
        </div>

        <div v-if="resolvedItems(view).length === 0" class="extension-sidebar-panel__empty">
          {{ t('No extension view items found') }}
        </div>

        <div class="extension-sidebar-panel__tree">
          <template v-for="item in resolvedItems(view)" :key="`${view.extensionId}:${view.id}:${item.id}`">
            <button
              type="button"
              class="extension-sidebar-panel__view"
              :class="{ 'is-parent': hasChildren(item) }"
              @click="runItemCommand(view, item)"
            >
              <div class="extension-sidebar-panel__view-row">
                <span v-if="hasChildren(item)" class="extension-sidebar-panel__chevron">
                  {{ item.collapsibleState === 'expanded' ? '▾' : '▸' }}
                </span>
                <div class="extension-sidebar-panel__view-title">{{ item.label }}</div>
              </div>
              <div v-if="item.description" class="extension-sidebar-panel__view-meta">{{ item.description }}</div>
            </button>

            <div
              v-if="hasChildren(item) && item.collapsibleState === 'expanded'"
              class="extension-sidebar-panel__children"
            >
              <button
                v-for="child in item.children"
                :key="`${view.extensionId}:${view.id}:${item.id}:${child.id}`"
                type="button"
                class="extension-sidebar-panel__view is-child"
                @click="runItemCommand(view, child)"
              >
                <div class="extension-sidebar-panel__view-title">{{ child.label }}</div>
                <div v-if="child.description" class="extension-sidebar-panel__view-meta">{{ child.description }}</div>
              </button>
            </div>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { useI18n } from '../../i18n'
import { useExtensionsStore } from '../../stores/extensions'
import { useToastStore } from '../../stores/toast'

const props = defineProps({
  container: { type: Object, required: true },
  context: { type: Object, default: () => ({}) },
  target: { type: Object, default: () => ({}) },
})

const { t } = useI18n()
const extensionsStore = useExtensionsStore()
const toastStore = useToastStore()

const title = computed(() => t(props.container?.title || props.container?.id || 'Extension'))
const extensionName = computed(() => props.container?.extensionName || props.container?.extensionId || '')
const views = computed(() => extensionsStore.viewsForContainer(props.container?.id, props.context))

watch(
  views,
  (nextViews) => {
    for (const view of nextViews) {
      void extensionsStore.resolveView(view, props.target).catch(() => {})
    }
  },
  { immediate: true }
)

function resolvedViewRecord(view = {}) {
  return extensionsStore.resolvedViewFor(`${view.extensionId}:${view.id}`)
}

function resolvedViewTitle(view = {}) {
  return resolvedViewRecord(view)?.title || view.contextualTitle || view.title || view.id
}

function resolvedItems(view = {}) {
  return Array.isArray(resolvedViewRecord(view)?.items) ? resolvedViewRecord(view).items : []
}

function hasChildren(item = {}) {
  return Array.isArray(item.children) && item.children.length > 0
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
  const command = fallbackCommandForView(view, item)
  if (!command) {
    toastStore.show(t('No extension commands found'), { type: 'error', duration: 3200 })
    return
  }
  try {
    await extensionsStore.executeCommand({
      ...command,
      extensionId: view.extensionId,
    }, props.target)
    toastStore.show(t('Extension task started'), { type: 'success', duration: 2400 })
  } catch (error) {
    toastStore.show(error?.message || String(error || t('Failed to start extension task')), {
      type: 'error',
      duration: 4200,
    })
  }
}

async function refreshViews() {
  for (const view of views.value) {
    await extensionsStore.resolveView(view, props.target).catch(() => {})
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

.extension-sidebar-panel__view {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--border) 35%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--surface-base) 78%, transparent);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}

.extension-sidebar-panel__view.is-parent {
  padding-bottom: 8px;
}

.extension-sidebar-panel__view.is-child {
  margin-left: 18px;
}

.extension-sidebar-panel__view:hover {
  background: var(--surface-hover);
}

.extension-sidebar-panel__view-row {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.extension-sidebar-panel__chevron {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-size: 11px;
}

.extension-sidebar-panel__view-title {
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
}

.extension-sidebar-panel__children {
  display: flex;
  flex-direction: column;
  gap: 6px;
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
