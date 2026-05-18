<template>
  <div class="extension-sidebar-panel__header">
    <div class="extension-sidebar-panel__header-main">
      <div class="extension-sidebar-panel__title">{{ title }}</div>
      <div class="extension-sidebar-panel__meta">{{ extensionName }}</div>
    </div>
    <div class="extension-sidebar-panel__header-actions">
      <ExtensionBlockedActionButton
        v-for="action in actions"
        :key="`${action.extensionId}:${action.commandId}`"
        native
        :extra-class="['extension-sidebar-panel__refresh', action.blocked ? 'is-blocked' : '']"
        :blocked="action.blocked"
        :blocked-label="action.blockedLabel"
        :blocked-message="action.blockedMessage"
        :label="t(action.title || action.commandId)"
        :title="t(action.title || action.commandId)"
        @click="$emit('run-action', action)"
      />
      <button type="button" class="extension-sidebar-panel__refresh" @click="$emit('refresh')">
        {{ t('Refresh') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from '../../i18n'
import ExtensionBlockedActionButton from './ExtensionBlockedActionButton.vue'

defineEmits(['refresh', 'run-action'])

defineProps({
  actions: { type: Array, default: () => [] },
  extensionName: { type: String, default: '' },
  title: { type: String, default: '' },
})

const { t } = useI18n()
</script>

<style scoped>
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

.extension-sidebar-panel__meta {
  color: var(--text-muted);
  font-size: 11px;
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
