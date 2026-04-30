<template>
  <div class="extension-sidebar-panel">
    <div class="extension-sidebar-panel__header">
      <div class="extension-sidebar-panel__title">{{ title }}</div>
      <div class="extension-sidebar-panel__meta">{{ extensionName }}</div>
    </div>

    <div v-if="views.length === 0" class="extension-sidebar-panel__empty">
      {{ t('No extension views found') }}
    </div>

    <div v-else class="extension-sidebar-panel__views">
      <button
        v-for="view in views"
        :key="`${view.extensionId}:${view.id}`"
        type="button"
        class="extension-sidebar-panel__view"
        @click="runFirstCommand(view)"
      >
        <div class="extension-sidebar-panel__view-title">
          {{ t(view.contextualTitle || view.title || view.id) }}
        </div>
        <div class="extension-sidebar-panel__view-meta">{{ view.id }}</div>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
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

function fallbackCommandForView(view = {}) {
  const extension = extensionsStore.registry.find((entry) => entry.id === view.extensionId)
  if (!extension) return null
  return (extension.contributedCommands || [])[0] || null
}

async function runFirstCommand(view = {}) {
  const command = fallbackCommandForView(view)
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
  min-width: 0;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px;
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

.extension-sidebar-panel__view:hover {
  background: var(--surface-hover);
}

.extension-sidebar-panel__view-title {
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
}

.extension-sidebar-panel__empty {
  padding: 0 10px;
}
</style>
