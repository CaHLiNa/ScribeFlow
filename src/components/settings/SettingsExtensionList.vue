<template>
  <section class="settings-group">
    <div class="extensions-group-heading">
      <h4 class="settings-group-title">{{ t('Loaded Extensions') }}</h4>
      <div class="extensions-page-actions">
        <button
          type="button"
          class="extensions-page-icon-button"
          :title="t('Refresh extensions')"
          :aria-label="t('Refresh extensions')"
          :disabled="loading"
          @click="$emit('refresh')"
        >
          <IconRefresh :size="18" :stroke-width="1.9" />
        </button>
        <button
          type="button"
          class="extensions-page-icon-button"
          :title="t('Open extension install folder')"
          :aria-label="t('Open extension install folder')"
          @click="$emit('open-install-folder')"
        >
          <IconFolder :size="19" :stroke-width="1.9" />
        </button>
      </div>
    </div>
    <div class="settings-group-body">
      <div v-if="errorMessage" class="extension-empty-row is-error">
        {{ errorMessage }}
      </div>
      <div v-if="loading" class="extension-empty-row">
        {{ t('Loading extensions...') }}
      </div>
      <div v-else-if="extensions.length === 0" class="extension-empty-row">
        {{ t('No extensions found') }}
      </div>
      <div v-for="extension in extensions" v-else :key="extension.id" class="extension-card">
        <div class="extension-header">
          <div class="extension-copy">
            <div class="extension-title-line">
              <span class="extension-name">{{ extensionDisplayName(extension) }}</span>
              <span class="extension-status" :class="`is-${displayStatus(extension)}`">{{ t(displayStatus(extension)) }}</span>
              <span class="extension-scope">{{ t(extension.scope) }}</span>
            </div>
            <div class="extension-description">{{ extensionDescription(extension) }}</div>
            <div v-if="extension.errors.length" class="extension-message is-error">
              {{ extension.errors.map((message) => t(message)).join('; ') }}
            </div>
            <div v-else-if="extension.warnings.length" class="extension-message">
              {{ extension.warnings.map((message) => t(message)).join('; ') }}
            </div>
          </div>
          <div class="extension-controls">
            <button
              type="button"
              class="extension-card-icon-button"
              :title="t('Extension options')"
              :aria-label="t('Extension options')"
              :disabled="!hasOptions(extension)"
              @click="$emit('open-options', extension.id)"
            >
              <IconSettings :size="18" :stroke-width="1.85" />
            </button>
            <UiSwitch
              :model-value="isEnabled(extension.id)"
              :disabled="extension.status === 'invalid' || extension.status === 'blocked'"
              :title="t('Enable extension')"
              @update:model-value="(value) => $emit('toggle-enabled', extension.id, value)"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { IconFolder, IconRefresh, IconSettings } from '@tabler/icons-vue'
import { useI18n } from '../../i18n'
import { buildExtensionSettingGroups } from '../../domains/extensions/extensionSettingsGroups'
import UiSwitch from '../shared/ui/UiSwitch.vue'

defineEmits(['refresh', 'open-install-folder', 'open-options', 'toggle-enabled'])

const props = defineProps({
  extensions: {
    type: Array,
    default: () => [],
  },
  enabledExtensionIds: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Boolean,
    default: false,
  },
  errorMessage: {
    type: String,
    default: '',
  },
})

const { t } = useI18n()

function isEnabled(extensionId = '') {
  return props.enabledExtensionIds.includes(String(extensionId || '').trim().toLowerCase())
}

function displayStatus(extension = {}) {
  if (extension.status !== 'available') return extension.status
  return isEnabled(extension.id) ? extension.status : 'disabled'
}

function extensionDisplayName(extension = {}) {
  return String(extension.name || extension.id || '').trim()
}

function extensionDescription(extension = {}) {
  const description = String(extension.description || '').trim()
  return description || t('No description provided')
}

function hasOptions(extension = {}) {
  return buildExtensionSettingGroups(extension).length > 0
}
</script>

<style scoped>
.extensions-group-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.extensions-group-heading .settings-group-title {
  margin-bottom: 8px;
  flex: 1 1 auto;
}

.extensions-page-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 8px 4px 8px 0;
  flex: 0 0 auto;
}

.extensions-page-icon-button {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    opacity 0.15s ease;
}

.extensions-page-icon-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--sidebar-item-hover) 70%, transparent);
  color: var(--text-primary);
}

.extensions-page-icon-button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 65%, transparent);
  outline-offset: 2px;
}

.extensions-page-icon-button:disabled {
  cursor: default;
  opacity: 0.45;
}

.extension-empty-row {
  padding: 16px;
  color: var(--text-muted);
  font-size: 12px;
}

.extension-empty-row.is-error {
  color: var(--error);
}

.extension-card {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
}

.extension-card:last-child {
  border-bottom: none;
}

.extension-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 18px;
}

.extension-copy {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.extension-title-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.extension-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.extension-status,
.extension-scope {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 7px;
  border-radius: 6px;
  background: var(--surface-raised);
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1;
}

.extension-status.is-available {
  color: var(--success);
}

.extension-status.is-invalid,
.extension-status.is-blocked {
  color: var(--error);
}

.extension-status.is-missingRuntime {
  color: var(--warning, #a56a00);
}

.extension-status.is-disabled {
  color: var(--text-muted);
}

.extension-description,
.extension-message {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.extension-message.is-error {
  color: var(--error);
}

.extension-controls {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding-top: 0;
}

.extension-card-icon-button {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    opacity 0.15s ease;
}

.extension-card-icon-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--sidebar-item-hover) 70%, transparent);
  color: var(--text-primary);
}

.extension-card-icon-button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 65%, transparent);
  outline-offset: 2px;
}

.extension-card-icon-button:disabled {
  cursor: default;
  opacity: 0.38;
}

@media (max-width: 720px) {
  .extension-header {
    flex-direction: column;
  }

  .extension-controls {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
