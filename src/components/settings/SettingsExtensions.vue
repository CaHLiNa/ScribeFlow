<template>
  <div class="settings-page extensions-page">
    <div class="extensions-page-header">
      <h3 class="settings-section-title">{{ t('Extensions') }}</h3>
      <UiButton
        variant="secondary"
        size="sm"
        :disabled="extensionsStore.loadingRegistry"
        @click="refreshExtensionRegistry"
      >
        {{ t('Refresh Extension Registry') }}
      </UiButton>
    </div>

    <section class="settings-group">
      <div class="settings-group-title">{{ t('Installed Extensions') }}</div>
      <div class="settings-group-body">
        <div v-if="extensionsStore.loadingRegistry" class="extension-empty-row">
          {{ t('Loading extensions...') }}
        </div>
        <div v-else-if="extensions.length === 0" class="extension-empty-row">
          {{ t('No extensions found') }}
        </div>
        <div v-for="extension in extensions" v-else :key="extension.id" class="extension-card">
          <div class="extension-header">
            <div class="extension-copy">
              <div class="extension-title-line">
                <span class="extension-name">{{ t(extension.name || extension.id) }}</span>
                <span class="extension-status" :class="`is-${displayStatus(extension)}`">{{ t(displayStatus(extension)) }}</span>
                <span class="extension-scope">{{ t(extension.scope) }}</span>
              </div>
              <div class="extension-description">{{ t(extension.description || extension.id) }}</div>
              <div class="extension-meta-grid">
                <div class="extension-meta-item">
                  <span class="extension-meta-label">{{ t('Manifest') }}</span>
                  <span class="extension-meta-value">{{ extension.manifestFormat || t('Not configured') }}</span>
                </div>
                <div class="extension-meta-item">
                  <span class="extension-meta-label">{{ t('Entrypoint') }}</span>
                  <span class="extension-meta-value">
                    {{ extension.main || extension.runtime?.command || t('Not configured') }}
                  </span>
                </div>
                <div class="extension-meta-item">
                  <span class="extension-meta-label">{{ t('Runtime') }}</span>
                  <span class="extension-meta-value">{{ extension.runtime?.runtimeType || t('Not configured') }}</span>
                </div>
                <div class="extension-meta-item">
                  <span class="extension-meta-label">{{ t('Commands') }}</span>
                  <span class="extension-meta-value">{{ commandSummary(extension) }}</span>
                </div>
                <div class="extension-meta-item">
                  <span class="extension-meta-label">{{ t('Keybindings') }}</span>
                  <span class="extension-meta-value">{{ keybindingSummary(extension) }}</span>
                </div>
                <div class="extension-meta-item">
                  <span class="extension-meta-label">{{ t('Permissions') }}</span>
                  <span class="extension-meta-value">{{ permissionSummary(extension) }}</span>
                </div>
              </div>
              <div v-if="extension.activationEvents?.length" class="extension-meta-list">
                <span class="extension-meta-label">{{ t('Activation Events') }}</span>
                <span class="extension-meta-value">{{ extension.activationEvents.join(' · ') }}</span>
              </div>
              <div class="extension-chip-row">
                <span v-for="capability in extension.capabilities" :key="capability" class="extension-chip">
                  {{ capability }}
                </span>
              </div>
              <div v-if="extension.errors.length" class="extension-message is-error">
                {{ extension.errors.map((message) => t(message)).join('; ') }}
              </div>
              <div v-else-if="extension.warnings.length" class="extension-message">
                {{ extension.warnings.map((message) => t(message)).join('; ') }}
              </div>
            </div>
            <div class="extension-controls">
              <span class="extension-enable-label">{{ t('Enabled') }}</span>
              <UiSwitch
                :model-value="isEnabled(extension.id)"
                :disabled="extension.status === 'invalid' || extension.status === 'blocked'"
                :title="t('Enable extension')"
                @update:model-value="(value) => extensionsStore.setExtensionEnabled(extension.id, value)"
              />
            </div>
          </div>

          <div v-if="settingGroups(extension).length" class="extension-settings-panel">
            <section
              v-for="group in settingGroups(extension)"
              :key="`${extension.id}:${group.id}`"
              class="extension-setting-group"
            >
              <div class="extension-setting-group-heading">
                <div class="extension-setting-group-title">{{ t(group.titleKey) }}</div>
                <div class="extension-setting-group-hint">{{ t(group.hintKey) }}</div>
              </div>
              <div class="extension-setting-list">
                <div
                  v-for="[key, setting] in group.entries"
                  :key="`${extension.id}:${key}`"
                  class="extension-setting-row"
                >
                  <div class="extension-setting-copy">
                    <div class="extension-setting-label">{{ t(setting.label || humanizeSettingKey(key)) }}</div>
                    <div v-if="setting.description" class="extension-setting-hint">
                      {{ t(setting.description) }}
                    </div>
                  </div>
                  <div class="extension-setting-control" :class="{ 'is-wide': isLongTextSetting(key, setting) }">
                    <UiSwitch
                      v-if="setting.type === 'boolean'"
                      :model-value="Boolean(settingValue(extension, key))"
                      size="sm"
                      :title="t(setting.label || humanizeSettingKey(key))"
                      @update:model-value="(value) => updateSetting(extension.id, key, value)"
                    />
                    <UiSelect
                      v-else-if="settingOptions(setting).length"
                      :model-value="settingValue(extension, key)"
                      :options="settingOptions(setting)"
                      :placeholder="t(setting.label || humanizeSettingKey(key))"
                      @update:model-value="(value) => updateSetting(extension.id, key, value)"
                    />
                    <textarea
                      v-else-if="isLongTextSetting(key, setting)"
                      class="extension-setting-textarea"
                      :value="settingValue(extension, key)"
                      spellcheck="false"
                      rows="4"
                      @input="(event) => updateSetting(extension.id, key, event.target.value)"
                    ></textarea>
                    <UiInput
                      v-else
                      :model-value="settingValue(extension, key)"
                      :type="inputTypeForSetting(key, setting)"
                      :monospace="isTechnicalSetting(key)"
                      size="sm"
                      @update:model-value="(value) => updateSetting(extension.id, key, coerceSettingValue(setting, value))"
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </section>

    <section v-if="extensionsStore.recentTasks.length > 0" class="settings-group">
      <div class="settings-group-title">{{ t('Recent Extension Tasks') }}</div>
      <div class="settings-group-body">
        <ExtensionTaskPanel />
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useI18n } from '../../i18n'
import { useExtensionsStore } from '../../stores/extensions'
import UiInput from '../shared/ui/UiInput.vue'
import UiSelect from '../shared/ui/UiSelect.vue'
import UiSwitch from '../shared/ui/UiSwitch.vue'
import ExtensionTaskPanel from '../extensions/ExtensionTaskPanel.vue'

const { t } = useI18n()
const extensionsStore = useExtensionsStore()
const extensions = computed(() => extensionsStore.registry)
function isEnabled(extensionId = '') {
  return extensionsStore.enabledExtensionIds.includes(String(extensionId || '').trim().toLowerCase())
}

function displayStatus(extension = {}) {
  if (extension.status !== 'available') return extension.status
  return isEnabled(extension.id) ? extension.status : 'disabled'
}

function permissionSummary(extension = {}) {
  const permissions = extension.permissions || {}
  const labels = []
  if (permissions.readWorkspaceFiles) labels.push(t('workspace files'))
  if (permissions.readReferenceLibrary) labels.push(t('reference library'))
  if (permissions.writeArtifacts) labels.push(t('artifact output'))
  if (permissions.writeReferenceMetadata) labels.push(t('reference metadata'))
  if (permissions.spawnProcess) labels.push(t('local process'))
  const network = String(permissions.network || 'none')
  labels.push(network === 'none' ? t('no network') : t('{value} network', { value: t(network) }))
  return labels.join(' · ')
}

function commandSummary(extension = {}) {
  const commands = Array.isArray(extension.contributedCommands) ? extension.contributedCommands : []
  if (!commands.length) return t('Not configured')
  return commands.map((command) => command.commandId).join(' · ')
}

function keybindingSummary(extension = {}) {
  const keybindings = Array.isArray(extension.contributedKeybindings)
    ? extension.contributedKeybindings
    : []
  if (!keybindings.length) return t('Not configured')
  return keybindings
    .map((keybinding) => keybinding.mac || keybinding.key || keybinding.win || keybinding.linux)
    .filter(Boolean)
    .join(' · ')
}

function shortSettingKey(key = '') {
  const normalized = String(key || '').trim()
  return normalized.split('.').pop() || normalized
}

const settingGroupDefinitions = [
  {
    id: 'basic',
    titleKey: 'Basic',
    hintKey: 'Core extension choices.',
    keys: ['engine', 'service', 'sourceLang', 'targetLang'],
    match: (key) => ['engine', 'service', 'sourceLang', 'targetLang', 'targetLanguage'].includes(shortSettingKey(key)),
  },
  {
    id: 'model',
    titleKey: 'Model Access',
    hintKey: 'Extension endpoint, credentials, and model selection.',
    keys: ['apiKey', 'apiUrl', 'model'],
    match: (key) => {
      const normalized = shortSettingKey(key).toLowerCase()
      return normalized.includes('api') ||
        normalized.includes('model') ||
        normalized.includes('extension') ||
        normalized.includes('token') ||
        normalized.includes('secret')
    },
  },
  {
    id: 'output',
    titleKey: 'Output',
    hintKey: 'Generated PDF type and layout behavior.',
    keys: ['outputMode', 'translationMode', 'dualMode', 'noWatermark', 'ocr', 'autoOcr'],
    match: (key) => ['outputMode', 'translationMode', 'dualMode', 'noWatermark', 'ocr', 'autoOcr'].includes(shortSettingKey(key)),
  },
  {
    id: 'runtime',
    titleKey: 'Runtime',
    hintKey: 'Local Python server and dependency environment.',
    keys: ['serverPort', 'pythonPath', 'enableVenv', 'envTool', 'enableMirror', 'skipInstall'],
    match: (key) => {
      const normalized = shortSettingKey(key).toLowerCase()
      return normalized.includes('server') ||
        normalized.includes('python') ||
        normalized.includes('venv') ||
        normalized.includes('env') ||
        normalized.includes('mirror') ||
        normalized.includes('install') ||
        normalized.includes('port')
    },
  },
  {
    id: 'performance',
    titleKey: 'Performance',
    hintKey: 'Concurrency and throughput controls.',
    keys: ['qps', 'poolSize', 'threadNum'],
    match: (key) => ['qps', 'poolSize', 'threadNum', 'chunkSize'].includes(shortSettingKey(key)),
  },
]

function settingEntries(extension = {}) {
  return Object.entries(extension.settingsSchema || {})
}

function sortSettingEntries(entries = [], orderedKeys = []) {
  const order = new Map(orderedKeys.map((key, index) => [key, index]))
  return [...entries].sort(([left], [right]) => {
    const leftOrder = order.has(left) ? order.get(left) : Number.MAX_SAFE_INTEGER
    const leftShort = shortSettingKey(left)
    const rightShort = shortSettingKey(right)
    const normalizedLeftOrder = order.has(leftShort) ? order.get(leftShort) : leftOrder
    const rightOrder = order.has(right) ? order.get(right) : Number.MAX_SAFE_INTEGER
    const normalizedRightOrder = order.has(rightShort) ? order.get(rightShort) : rightOrder
    if (normalizedLeftOrder !== normalizedRightOrder) return normalizedLeftOrder - normalizedRightOrder
    return left.localeCompare(right)
  })
}

function settingGroups(extension = {}) {
  const remaining = new Map(settingEntries(extension))
  const groups = []
  for (const definition of settingGroupDefinitions) {
    const entries = []
    for (const [key, setting] of [...remaining.entries()]) {
      if (definition.match(key, setting)) {
        entries.push([key, setting])
        remaining.delete(key)
      }
    }
    if (entries.length) {
      groups.push({
        ...definition,
        entries: sortSettingEntries(entries, definition.keys),
      })
    }
  }
  if (remaining.size) {
    groups.push({
      id: 'advanced',
      titleKey: 'Advanced',
      hintKey: 'Less common extension-specific options.',
      entries: sortSettingEntries([...remaining.entries()]),
    })
  }
  return groups
}

function settingValue(extension = {}, key = '') {
  return extensionsStore.configForExtension(extension)?.[key]
}

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
  const normalized = shortSettingKey(key).toLowerCase()
  if (normalized.includes('key') ||
    normalized.includes('token') ||
    normalized.includes('secret') ||
    normalized.includes('password')) {
    return 'password'
  }
  if (setting.type === 'number' || setting.type === 'integer') return 'number'
  return 'text'
}

function isLongTextSetting(key = '', setting = {}) {
  const normalized = shortSettingKey(key).toLowerCase()
  return normalized.includes('json') ||
    normalized.includes('extradata') ||
    String(setting.default ?? '').length > 80
}

function isTechnicalSetting(key = '') {
  const normalized = shortSettingKey(key).toLowerCase()
  return normalized.includes('url') ||
    normalized.includes('path') ||
    normalized.includes('json') ||
    normalized.includes('model')
}

function humanizeSettingKey(key = '') {
  return (String(key || '')
    .split('.')
    .pop() || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function updateSetting(extensionId = '', key = '', value = '') {
  void extensionsStore.setExtensionConfigValue(extensionId, key, value)
}

async function refreshExtensionRegistry() {
  await extensionsStore.refreshRegistry().catch(() => {})
  await extensionsStore.refreshTasks().catch(() => {})
}

onMounted(async () => {
  await refreshExtensionRegistry()
})
</script>

<style scoped>
.extensions-page {
  gap: 32px;
}

.extensions-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.extension-empty-row {
  padding: 16px;
  color: var(--text-muted);
  font-size: 12px;
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
.extension-scope,
.extension-chip {
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

.extension-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.extension-meta-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
  margin-top: 2px;
}

.extension-meta-item {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  gap: 8px;
  font-size: 11px;
  line-height: 1.35;
}

.extension-meta-label {
  color: var(--text-muted);
}

.extension-meta-value {
  min-width: 0;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

.extension-controls {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding-top: 2px;
}

.extension-enable-label {
  font-size: 11px;
  color: var(--text-muted);
}

.extension-settings-panel {
  display: flex;
  flex-direction: column;
  border-top: 1px solid color-mix(in srgb, var(--border) 34%, transparent);
  background: transparent;
}

.extension-setting-group {
  display: flex;
  flex-direction: column;
  padding: 8px 0 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 30%, transparent);
}

.extension-setting-group:last-child {
  border-bottom: none;
}

.extension-setting-group-heading {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 6px 18px 8px;
}

.extension-setting-group-title {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  line-height: 1.35;
  letter-spacing: 0.03em;
}

.extension-setting-group-hint {
  margin-top: 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.extension-setting-list {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.extension-setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
  padding: 10px 18px;
  border-top: 1px solid color-mix(in srgb, var(--border) 24%, transparent);
  transition: background-color 0.15s ease;
}

.extension-setting-row:hover {
  background: color-mix(in srgb, var(--sidebar-item-hover) 18%, transparent);
}

.extension-setting-copy {
  min-width: 0;
  flex: 1 1 auto;
}

.extension-setting-label {
  font-size: 12px;
  color: var(--text-primary);
}

.extension-setting-hint {
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-muted);
}

.extension-setting-control {
  flex: 0 0 auto;
  width: min(100%, var(--settings-select-width, 280px));
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.extension-setting-control.is-wide {
  width: min(100%, 360px);
  justify-content: stretch;
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
  .extension-header {
    flex-direction: column;
  }

  .extension-setting-group-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }

  .extension-setting-row {
    align-items: stretch;
    flex-direction: column;
    gap: 6px;
  }

  .extension-setting-control {
    width: 100%;
    justify-content: stretch;
  }

  .extension-controls {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
