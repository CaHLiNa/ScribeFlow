<template>
  <template v-if="extension">
    <section class="settings-group extension-options-navigation">
      <div class="extensions-group-heading">
        <div class="extension-options-title">
          <button
            type="button"
            class="extension-card-icon-button"
            :title="t('Back to loaded extensions')"
            :aria-label="t('Back to loaded extensions')"
            @click="$emit('back')"
          >
            <IconChevronLeft :size="18" :stroke-width="1.9" />
          </button>
        </div>
      </div>
    </section>

    <section v-if="settingGroups.length === 0 && actionGroups.length === 0" class="settings-group">
      <h4 class="settings-group-title">{{ t('Extension options') }}</h4>
      <div class="settings-group-body">
        <div class="extension-empty-row">
          {{ t('This extension has no configurable options.') }}
        </div>
      </div>
    </section>

    <template v-else>
      <section
        v-for="group in actionGroups"
        :key="`${extension.id}:action-group:${group.id}`"
        class="settings-group extension-options-settings-group"
      >
        <h4 class="settings-group-title">{{ t(group.title) }}</h4>
        <div class="settings-group-body">
          <div
            v-for="action in group.actions"
            :key="`${extension.id}:action:${action.id}`"
            class="settings-row extension-setting-row extension-action-row"
          >
            <div class="settings-row-copy extension-setting-copy">
              <div class="settings-row-title extension-setting-label-row">
                <span>{{ t(action.title) }}</span>
              </div>
              <div v-if="actionMessage(action.id)" class="extension-action-hint">
                {{ actionMessage(action.id) }}
              </div>
            </div>
            <div class="settings-row-control extension-setting-control extension-action-control">
              <UiButton
                variant="secondary"
                size="sm"
                :disabled="isActionBusy(action.id)"
                @click="$emit('run-action', action)"
              >
                {{ actionButtonLabel(action.id, action.title) }}
              </UiButton>
            </div>
          </div>
        </div>
      </section>

      <section
        v-for="group in settingGroups"
        :key="`${extension.id}:${group.id}`"
        class="settings-group extension-options-settings-group"
      >
        <h4 class="settings-group-title">{{ t(group.titleKey) }}</h4>
        <div class="settings-group-body">
          <div
            v-for="[key, setting] in group.entries"
            :key="`${extension.id}:${key}`"
            class="settings-row extension-setting-row"
          >
            <div class="settings-row-copy extension-setting-copy">
              <div class="settings-row-title extension-setting-label-row">
                <span>{{ t(setting.label || humanizeExtensionSettingKey(key)) }}</span>
              </div>
            </div>
            <div class="settings-row-control extension-setting-control" :class="{ 'is-wide': isLongTextSetting(key, setting) }">
              <UiSwitch
                v-if="setting.type === 'boolean'"
                :model-value="Boolean(settingValue(extension, key))"
                size="sm"
                :title="t(setting.label || humanizeExtensionSettingKey(key))"
                @update:model-value="(value) => $emit('update-now', extension.id, key, value)"
              />
              <UiSelect
                v-else-if="settingOptions(setting).length"
                :model-value="settingValue(extension, key)"
                :options="settingOptions(setting)"
                :placeholder="t(setting.label || humanizeExtensionSettingKey(key))"
                @update:model-value="(value) => $emit('update-now', extension.id, key, value)"
              />
              <textarea
                v-else-if="isLongTextSetting(key, setting)"
                class="extension-setting-textarea"
                :value="settingDraftValue(extension, key)"
                spellcheck="false"
                rows="4"
                @input="(event) => $emit('update-draft', extension.id, key, event.target.value)"
                @blur="$emit('flush-draft', extension.id, key)"
              ></textarea>
              <UiInput
                v-else
                :model-value="settingDraftValue(extension, key)"
                :type="inputTypeForSetting(key, setting)"
                :placeholder="hasPersistedSecureSetting(extension, key) ? t('Saved') : ''"
                :monospace="isTechnicalSetting(key)"
                size="sm"
                @update:model-value="(value) => $emit('update-draft', extension.id, key, coerceSettingValue(setting, value))"
                @blur="$emit('flush-draft', extension.id, key)"
              />
            </div>
          </div>
        </div>
      </section>
    </template>
  </template>
</template>

<script setup lang="ts">
import { IconChevronLeft } from '@tabler/icons-vue'
import { useI18n } from '../../i18n'
import { humanizeExtensionSettingKey } from '../../domains/extensions/extensionSettingsGroups'
import { secureSettingInputType, shortExtensionSettingKey } from '../../domains/extensions/extensionSettingPresentation'
import UiButton from '../shared/ui/UiButton.vue'
import UiInput from '../shared/ui/UiInput.vue'
import UiSelect from '../shared/ui/UiSelect.vue'
import UiSwitch from '../shared/ui/UiSwitch.vue'

defineEmits(['back', 'run-action', 'update-now', 'update-draft', 'flush-draft'])

defineProps({
  extension: {
    type: Object,
    default: null,
  },
  settingGroups: {
    type: Array,
    default: () => [],
  },
  actionGroups: {
    type: Array,
    default: () => [],
  },
  actionMessage: {
    type: Function,
    required: true,
  },
  isActionBusy: {
    type: Function,
    required: true,
  },
  actionButtonLabel: {
    type: Function,
    required: true,
  },
  settingValue: {
    type: Function,
    required: true,
  },
  settingDraftValue: {
    type: Function,
    required: true,
  },
  hasPersistedSecureSetting: {
    type: Function,
    required: true,
  },
})

const { t } = useI18n()

function settingOptions(setting = {}) {
  return Array.isArray(setting.options)
    ? setting.options.map((option) => ({
        value: option?.value,
        label: t(option?.label || String(option?.value ?? '')),
      }))
    : []
}

function coerceSettingValue(setting = {}, value = '') {
  if (setting.type === 'integer') {
    const parsed = Number.parseInt(value, 10)
    return Number.isNaN(parsed) ? value : parsed
  }
  if (setting.type === 'number') {
    const parsed = Number.parseFloat(value)
    return Number.isNaN(parsed) ? value : parsed
  }
  return value
}

function inputTypeForSetting(key = '', setting = {}) {
  return secureSettingInputType(key, setting)
}

function isLongTextSetting(key = '', setting = {}) {
  const normalized = shortExtensionSettingKey(key).toLowerCase()
  return normalized.includes('json') ||
    normalized.includes('extradata') ||
    String(setting.default ?? '').length > 80
}

function isTechnicalSetting(key = '') {
  const normalized = shortExtensionSettingKey(key).toLowerCase()
  return normalized.includes('url') ||
    normalized.includes('path') ||
    normalized.includes('json') ||
    normalized.includes('model')
}
</script>

<style scoped>
.extensions-group-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.extension-options-title {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  flex: 1 1 auto;
}

.extension-options-title .extension-card-icon-button {
  margin: 0 0 0 4px;
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

.extension-empty-row {
  padding: 16px;
  color: var(--text-muted);
  font-size: 12px;
}

.extension-setting-row {
  min-height: 52px;
}

.extension-setting-copy {
  gap: 2px;
}

.extension-setting-label-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.extension-setting-control {
  width: min(100%, var(--settings-select-width, 280px));
}

.extension-setting-control.is-wide {
  width: min(100%, 360px);
}

.extension-action-row {
  min-height: 52px;
}

.extension-action-hint {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.45;
}

.extension-action-control {
  justify-content: flex-end;
}

.extension-setting-textarea {
  width: 100%;
  min-height: 86px;
  resize: vertical;
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--border-subtle) 88%, transparent);
  border-radius: 6px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--surface-base) 86%, transparent);
  color: var(--text-primary);
  font: 12px/1.45 var(--font-mono);
  outline: none;
}

.extension-setting-textarea:focus {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent),
    0 0 0 1px var(--accent);
}

@media (max-width: 720px) {
  .extension-setting-row {
    align-items: stretch;
    flex-direction: column;
    gap: 6px;
  }

  .extension-setting-control {
    width: 100%;
    justify-content: stretch;
  }

  .extension-action-control {
    width: 100%;
  }

  .extension-action-control :deep(.ui-button) {
    width: 100%;
  }
}
</style>
