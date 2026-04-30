<template>
  <div class="settings-page plugins-page">
    <h3 class="settings-section-title">{{ t('Plugins') }}</h3>

    <section class="settings-group">
      <div class="settings-group-title">{{ t('Installed Plugins') }}</div>
      <div class="settings-group-body">
        <div v-if="pluginsStore.loadingRegistry" class="plugin-empty-row">
          {{ t('Loading plugins...') }}
        </div>
        <div v-else-if="plugins.length === 0" class="plugin-empty-row">
          {{ t('No plugins found') }}
        </div>
        <div v-for="plugin in plugins" v-else :key="plugin.id" class="plugin-card">
          <div class="plugin-header">
            <div class="plugin-copy">
              <div class="plugin-title-line">
                <span class="plugin-name">{{ t(plugin.name || plugin.id) }}</span>
                <span class="plugin-status" :class="`is-${displayStatus(plugin)}`">{{ t(displayStatus(plugin)) }}</span>
                <span class="plugin-scope">{{ t(plugin.scope) }}</span>
              </div>
              <div class="plugin-description">{{ t(plugin.description || plugin.id) }}</div>
              <div class="plugin-meta-grid">
                <div class="plugin-meta-item">
                  <span class="plugin-meta-label">{{ t('Command') }}</span>
                  <span class="plugin-meta-value">{{ plugin.runtime?.command || t('Not configured') }}</span>
                </div>
                <div class="plugin-meta-item">
                  <span class="plugin-meta-label">{{ t('Permissions') }}</span>
                  <span class="plugin-meta-value">{{ permissionSummary(plugin) }}</span>
                </div>
              </div>
              <div class="plugin-chip-row">
                <span v-for="capability in plugin.capabilities" :key="capability" class="plugin-chip">
                  {{ capability }}
                </span>
              </div>
              <div v-if="plugin.errors.length" class="plugin-message is-error">
                {{ plugin.errors.map((message) => t(message)).join('; ') }}
              </div>
              <div v-else-if="plugin.warnings.length" class="plugin-message">
                {{ plugin.warnings.map((message) => t(message)).join('; ') }}
              </div>
            </div>
            <div class="plugin-controls">
              <span class="plugin-enable-label">{{ t('Enabled') }}</span>
              <UiSwitch
                :model-value="isEnabled(plugin.id)"
                :disabled="plugin.status === 'invalid' || plugin.status === 'blocked'"
                :title="t('Enable plugin')"
                @update:model-value="(value) => pluginsStore.setPluginEnabled(plugin.id, value)"
              />
            </div>
          </div>

          <div v-if="settingGroups(plugin).length" class="plugin-settings-panel">
            <section
              v-for="group in settingGroups(plugin)"
              :key="`${plugin.id}:${group.id}`"
              class="plugin-setting-group"
            >
              <div class="plugin-setting-group-heading">
                <div class="plugin-setting-group-title">{{ t(group.titleKey) }}</div>
                <div class="plugin-setting-group-hint">{{ t(group.hintKey) }}</div>
              </div>
              <div class="plugin-setting-list">
                <div
                  v-for="[key, setting] in group.entries"
                  :key="`${plugin.id}:${key}`"
                  class="plugin-setting-row"
                >
                  <div class="plugin-setting-copy">
                    <div class="plugin-setting-label">{{ t(setting.label || humanizeSettingKey(key)) }}</div>
                    <div v-if="setting.description" class="plugin-setting-hint">
                      {{ t(setting.description) }}
                    </div>
                  </div>
                  <div class="plugin-setting-control" :class="{ 'is-wide': isLongTextSetting(key, setting) }">
                    <UiSwitch
                      v-if="setting.type === 'boolean'"
                      :model-value="Boolean(settingValue(plugin, key))"
                      size="sm"
                      :title="t(setting.label || humanizeSettingKey(key))"
                      @update:model-value="(value) => updateSetting(plugin.id, key, value)"
                    />
                    <UiSelect
                      v-else-if="settingOptions(setting).length"
                      :model-value="settingValue(plugin, key)"
                      :options="settingOptions(setting)"
                      :placeholder="t(setting.label || humanizeSettingKey(key))"
                      @update:model-value="(value) => updateSetting(plugin.id, key, value)"
                    />
                    <textarea
                      v-else-if="isLongTextSetting(key, setting)"
                      class="plugin-setting-textarea"
                      :value="settingValue(plugin, key)"
                      spellcheck="false"
                      rows="4"
                      @input="(event) => updateSetting(plugin.id, key, event.target.value)"
                    ></textarea>
                    <UiInput
                      v-else
                      :model-value="settingValue(plugin, key)"
                      :type="inputTypeForSetting(key, setting)"
                      :monospace="isTechnicalSetting(key)"
                      size="sm"
                      @update:model-value="(value) => updateSetting(plugin.id, key, coerceSettingValue(setting, value))"
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </section>

    <section class="settings-group">
      <div class="settings-group-title">{{ t('Default Providers') }}</div>
      <div class="settings-group-body">
        <div v-for="capability in visibleCapabilities" :key="capability" class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ capability }}</div>
            <div class="settings-row-hint">{{ t('Choose the plugin used by this capability.') }}</div>
          </div>
          <div class="settings-row-control">
            <UiSelect
              :model-value="pluginsStore.defaultProviderForCapability(capability)?.id || ''"
              :options="providerOptions(capability)"
              :disabled="providerOptions(capability).length === 0"
              :placeholder="t('No provider')"
              @update:model-value="(value) => pluginsStore.setDefaultProvider(capability, value)"
            />
          </div>
        </div>
      </div>
    </section>

    <section class="settings-group">
      <div class="settings-group-title">{{ t('Recent Plugin Jobs') }}</div>
      <div class="settings-group-body">
        <PluginJobPanel />
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useI18n } from '../../i18n'
import { usePluginsStore } from '../../stores/plugins'
import UiInput from '../shared/ui/UiInput.vue'
import UiSelect from '../shared/ui/UiSelect.vue'
import UiSwitch from '../shared/ui/UiSwitch.vue'
import PluginJobPanel from '../plugins/PluginJobPanel.vue'

const { t } = useI18n()
const pluginsStore = usePluginsStore()
const plugins = computed(() => pluginsStore.registry)
const visibleCapabilities = computed(() => {
  const capabilities = new Set()
  for (const plugin of plugins.value) {
    for (const capability of plugin.capabilities || []) {
      capabilities.add(capability)
    }
  }
  return [...capabilities].sort()
})

function isEnabled(pluginId = '') {
  return pluginsStore.enabledPluginIds.includes(String(pluginId || '').trim().toLowerCase())
}

function displayStatus(plugin = {}) {
  if (plugin.status !== 'available') return plugin.status
  return isEnabled(plugin.id) ? plugin.status : 'disabled'
}

function permissionSummary(plugin = {}) {
  const permissions = plugin.permissions || {}
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

function providerOptions(capability = '') {
  return pluginsStore.providersForCapability(capability).map((plugin) => ({
    value: plugin.id,
    label: t(plugin.name || plugin.id),
  }))
}

const settingGroupDefinitions = [
  {
    id: 'basic',
    titleKey: 'Basic',
    hintKey: 'Core translation choices.',
    keys: ['engine', 'service', 'sourceLang', 'targetLang'],
    match: (key) => ['engine', 'service', 'sourceLang', 'targetLang', 'targetLanguage'].includes(key),
  },
  {
    id: 'model',
    titleKey: 'Model Access',
    hintKey: 'Provider endpoint, credentials, and model selection.',
    keys: ['apiKey', 'apiUrl', 'model'],
    match: (key) => {
      const normalized = key.toLowerCase()
      return normalized.includes('api') ||
        normalized.includes('model') ||
        normalized.includes('provider') ||
        normalized.includes('token') ||
        normalized.includes('secret')
    },
  },
  {
    id: 'output',
    titleKey: 'Output',
    hintKey: 'Generated PDF type and layout behavior.',
    keys: ['outputMode', 'translationMode', 'dualMode', 'noWatermark', 'ocr', 'autoOcr'],
    match: (key) => ['outputMode', 'translationMode', 'dualMode', 'noWatermark', 'ocr', 'autoOcr'].includes(key),
  },
  {
    id: 'runtime',
    titleKey: 'Runtime',
    hintKey: 'Local Python server and dependency environment.',
    keys: ['serverPort', 'pythonPath', 'enableVenv', 'envTool', 'enableMirror', 'skipInstall'],
    match: (key) => {
      const normalized = key.toLowerCase()
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
    match: (key) => ['qps', 'poolSize', 'threadNum', 'chunkSize'].includes(key),
  },
]

function settingEntries(plugin = {}) {
  return Object.entries(plugin.settingsSchema || {})
}

function sortSettingEntries(entries = [], orderedKeys = []) {
  const order = new Map(orderedKeys.map((key, index) => [key, index]))
  return [...entries].sort(([left], [right]) => {
    const leftOrder = order.has(left) ? order.get(left) : Number.MAX_SAFE_INTEGER
    const rightOrder = order.has(right) ? order.get(right) : Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    return left.localeCompare(right)
  })
}

function settingGroups(plugin = {}) {
  const remaining = new Map(settingEntries(plugin))
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
      hintKey: 'Less common plugin-specific options.',
      entries: sortSettingEntries([...remaining.entries()]),
    })
  }
  return groups
}

function settingValue(plugin = {}, key = '') {
  return pluginsStore.configForPlugin(plugin)?.[key]
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
  const normalized = key.toLowerCase()
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
  const normalized = key.toLowerCase()
  return normalized.includes('json') ||
    normalized.includes('extradata') ||
    String(setting.default ?? '').length > 80
}

function isTechnicalSetting(key = '') {
  const normalized = key.toLowerCase()
  return normalized.includes('url') ||
    normalized.includes('path') ||
    normalized.includes('json') ||
    normalized.includes('model')
}

function humanizeSettingKey(key = '') {
  return String(key || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function updateSetting(pluginId = '', key = '', value = '') {
  void pluginsStore.setPluginConfigValue(pluginId, key, value)
}

onMounted(async () => {
  await pluginsStore.refreshRegistry().catch(() => {})
  await pluginsStore.refreshJobs().catch(() => {})
})
</script>

<style scoped>
.plugins-page {
  gap: 32px;
}

.plugin-empty-row {
  padding: 16px;
  color: var(--text-muted);
  font-size: 12px;
}

.plugin-card {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
}

.plugin-card:last-child {
  border-bottom: none;
}

.plugin-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 18px;
}

.plugin-copy {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.plugin-title-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.plugin-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.plugin-status,
.plugin-scope,
.plugin-chip {
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

.plugin-status.is-available {
  color: var(--success);
}

.plugin-status.is-invalid,
.plugin-status.is-blocked {
  color: var(--error);
}

.plugin-status.is-missingRuntime {
  color: var(--warning, #a56a00);
}

.plugin-status.is-disabled {
  color: var(--text-muted);
}

.plugin-description,
.plugin-message {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.plugin-message.is-error {
  color: var(--error);
}

.plugin-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.plugin-meta-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
  margin-top: 2px;
}

.plugin-meta-item {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  gap: 8px;
  font-size: 11px;
  line-height: 1.35;
}

.plugin-meta-label {
  color: var(--text-muted);
}

.plugin-meta-value {
  min-width: 0;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

.plugin-controls {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding-top: 2px;
}

.plugin-enable-label {
  font-size: 11px;
  color: var(--text-muted);
}

.plugin-settings-panel {
  display: flex;
  flex-direction: column;
  border-top: 1px solid color-mix(in srgb, var(--border) 34%, transparent);
  background: transparent;
}

.plugin-setting-group {
  display: flex;
  flex-direction: column;
  padding: 8px 0 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 30%, transparent);
}

.plugin-setting-group:last-child {
  border-bottom: none;
}

.plugin-setting-group-heading {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 6px 18px 8px;
}

.plugin-setting-group-title {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  line-height: 1.35;
  letter-spacing: 0.03em;
}

.plugin-setting-group-hint {
  margin-top: 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.plugin-setting-list {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.plugin-setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
  padding: 10px 18px;
  border-top: 1px solid color-mix(in srgb, var(--border) 24%, transparent);
  transition: background-color 0.15s ease;
}

.plugin-setting-row:hover {
  background: color-mix(in srgb, var(--sidebar-item-hover) 18%, transparent);
}

.plugin-setting-copy {
  min-width: 0;
  flex: 1 1 auto;
}

.plugin-setting-label {
  font-size: 12px;
  color: var(--text-primary);
}

.plugin-setting-hint {
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-muted);
}

.plugin-setting-control {
  flex: 0 0 auto;
  width: min(100%, var(--settings-select-width, 280px));
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.plugin-setting-control.is-wide {
  width: min(100%, 360px);
  justify-content: stretch;
}

.plugin-setting-textarea {
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

.plugin-setting-textarea:focus {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent),
    0 0 0 1px var(--accent);
}

@media (max-width: 720px) {
  .plugin-header {
    flex-direction: column;
  }

  .plugin-setting-group-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }

  .plugin-setting-row {
    align-items: stretch;
    flex-direction: column;
    gap: 6px;
  }

  .plugin-setting-control {
    width: 100%;
    justify-content: stretch;
  }

  .plugin-controls {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
