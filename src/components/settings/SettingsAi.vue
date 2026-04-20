<template>
  <div class="settings-page">
    <h3 class="settings-section-title">{{ t('Research defaults') }}</h3>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Research defaults') }}</h4>

      <div class="settings-ai-research-panel">
        <div class="settings-ai-research-intro">
          <div class="settings-ai-research-intro-title">
            {{ t('Workspace-first AI defaults') }}
          </div>
          <div class="settings-ai-research-intro-copy">
            {{
              t(
                'Set the default citation style, evidence strictness, and completion threshold before tuning providers.'
              )
            }}
          </div>
        </div>

        <div class="settings-ai-research-summary">
          <div class="settings-ai-research-summary-label">{{ t('Current workspace') }}</div>
          <div class="settings-ai-research-summary-value">
            {{ currentWorkspacePath || t('No workspace open') }}
          </div>
        </div>

        <div class="settings-ai-research-grid">
          <div class="settings-row settings-ai-provider-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('Default citation style') }}</div>
            </div>
            <div class="settings-row-control">
              <UiSelect
                :model-value="researchDefaults.defaultCitationStyle"
                size="sm"
                class="settings-ai-input"
                :options="citationStyleOptions"
                @update:model-value="updateResearchDefault('defaultCitationStyle', $event)"
              />
            </div>
          </div>

          <div class="settings-row settings-ai-provider-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('Evidence strategy') }}</div>
            </div>
            <div class="settings-row-control">
              <UiSelect
                :model-value="researchDefaults.evidenceStrategy"
                size="sm"
                class="settings-ai-input"
                :options="evidenceStrategyOptions"
                @update:model-value="updateResearchDefault('evidenceStrategy', $event)"
              />
            </div>
          </div>

          <div class="settings-row settings-ai-provider-row">
            <div class="settings-row-copy">
              <div class="settings-row-title">{{ t('Task completion threshold') }}</div>
            </div>
            <div class="settings-row-control">
              <UiSelect
                :model-value="researchDefaults.taskCompletionThreshold"
                size="sm"
                class="settings-ai-input"
                :options="completionThresholdOptions"
                @update:model-value="updateResearchDefault('taskCompletionThreshold', $event)"
              />
            </div>
          </div>
        </div>
      </div>
    </section>

    <h3 class="settings-section-title">{{ t('Model providers') }}</h3>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Model providers') }}</h4>
      <div class="settings-ai-provider-listbox">
        <div
          v-for="provider in providerDefinitions"
          :key="provider.id"
          class="settings-ai-provider-item"
          :class="{ 'is-expanded': expandedProvider === provider.id }"
        >
          <!-- Header Line -->
          <div class="settings-ai-provider-header" @click="toggleProvider(provider.id)">
            <div class="settings-ai-provider-header-left">
              <div class="settings-ai-provider-icon">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path
                    d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
                  ></path>
                </svg>
              </div>
              <div class="settings-ai-provider-name">{{ provider.label }}</div>
              <div
                class="settings-ai-provider-badge"
                :class="{ 'is-configured': isProviderConfigured(provider.id) }"
              >
                {{ isProviderConfigured(provider.id) ? t('Configured') : t('Incomplete') }}
              </div>
            </div>

            <div class="settings-ai-provider-header-right">
              <svg
                class="settings-ai-provider-chevron"
                :class="{ 'is-rotated': expandedProvider === provider.id }"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>

          <!-- Collapsible Body -->
          <transition name="ai-provider-collapse">
            <div class="settings-ai-provider-body" v-show="expandedProvider === provider.id">
              <div class="settings-ai-provider-group">
                <div class="settings-row settings-ai-provider-row">
                  <div class="settings-row-copy">
                    <div class="settings-row-title">{{ t('Base URL') }}</div>
                  </div>
                  <div class="settings-row-control">
                    <UiInput
                      :model-value="getProviderForm(provider.id).baseUrl"
                      size="sm"
                      :placeholder="provider.baseUrlHint"
                      class="settings-ai-input"
                      @update:model-value="updateProviderField(provider.id, 'baseUrl', $event)"
                    />
                  </div>
                </div>

                <div class="settings-row settings-ai-provider-row">
                  <div class="settings-row-copy">
                    <div class="settings-row-title">{{ t('Model') }}</div>
                  </div>
                  <div class="settings-row-control">
                    <UiSelect
                      v-if="getProviderModelOptions(provider.id).length > 0"
                      :model-value="getProviderForm(provider.id).model"
                      size="sm"
                      class="settings-ai-input"
                      :options="getProviderModelOptions(provider.id)"
                      @update:model-value="updateProviderField(provider.id, 'model', $event)"
                    />
                    <UiInput
                      v-else
                      :model-value="getProviderForm(provider.id).model"
                      size="sm"
                      :placeholder="
                        isLoadingProviderModels(provider.id)
                          ? t('Loading models...')
                          : provider.modelPlaceholder
                      "
                      class="settings-ai-input"
                      @update:model-value="updateProviderField(provider.id, 'model', $event)"
                    />
                  </div>
                </div>
                <div v-if="getProviderModelMeta(provider.id)" class="settings-ai-provider-row-meta">
                  {{ getProviderModelMeta(provider.id) }}
                </div>

                <div class="settings-row settings-ai-provider-row">
                  <div class="settings-row-copy">
                    <div class="settings-row-title">{{ t('API key') }}</div>
                  </div>
                  <div class="settings-row-control">
                    <UiInput
                      :model-value="getProviderKey(provider.id)"
                      size="sm"
                      type="password"
                      :placeholder="provider.id === 'custom' ? 'token-...' : 'sk-...'"
                      class="settings-ai-input"
                      @update:model-value="updateProviderKey(provider.id, $event)"
                    />
                  </div>
                </div>
              </div>

              <div class="settings-ai-provider-actions">
                <UiButton variant="secondary" size="sm" :disabled="saving" @click="handleSave">
                  {{ saving ? t('Saving...') : t('Save configs') }}
                </UiButton>
                <UiButton
                  variant="secondary"
                  size="sm"
                  :disabled="
                    saving || isTestingProvider(provider.id) || !canTestProvider(provider.id)
                  "
                  @click="handleTestProvider(provider.id)"
                >
                  {{ isTestingProvider(provider.id) ? t('Testing...') : t('Test connection') }}
                </UiButton>
                <UiButton
                  variant="secondary"
                  size="sm"
                  :disabled="isLoadingProviderModels(provider.id)"
                  @click="refreshProviderModels(provider.id, { force: true })"
                >
                  {{
                    isLoadingProviderModels(provider.id)
                      ? t('Loading models...')
                      : t('Refresh models')
                  }}
                </UiButton>
                <UiButton
                  variant="danger"
                  size="sm"
                  style="background: transparent; color: var(--error)"
                  :disabled="saving"
                  @click="handleClearProvider(provider.id)"
                >
                  {{ t('Clear') }}
                </UiButton>
              </div>
              <div
                v-if="getProviderFeedback(provider.id)"
                class="settings-inline-message"
                :class="{
                  'settings-inline-message-error':
                    getProviderFeedback(provider.id)?.type === 'error',
                }"
              >
                {{ getProviderFeedback(provider.id)?.message }}
              </div>
            </div>
          </transition>
        </div>
      </div>
    </section>

  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useToastStore } from '../../stores/toast'
import { useI18n } from '../../i18n'
import { useAiStore } from '../../stores/ai'
import { useWorkspaceStore } from '../../stores/workspace'
import { useReferencesStore } from '../../stores/references'
import { getAvailableCitationStyles } from '../../services/references/citationStyleRegistry.js'
import UiButton from '../shared/ui/UiButton.vue'
import UiInput from '../shared/ui/UiInput.vue'
import UiSelect from '../shared/ui/UiSelect.vue'

const { t } = useI18n()
const aiStore = useAiStore()
const toastStore = useToastStore()
const workspaceStore = useWorkspaceStore()
const referencesStore = useReferencesStore()

async function listAiProviderDefinitions() {
  const response = await invoke('ai_provider_catalog_list')
  return Array.isArray(response?.providers) ? response.providers : []
}

async function listAiProviderModels(providerId = 'openai', providerConfig = {}, apiKey = '') {
  const response = await invoke('ai_provider_models_list', {
    providerId,
    providerConfig,
    apiKey: normalizeAiApiKey(apiKey),
  })
  return Array.isArray(response?.options) ? response.options : []
}

async function loadAiApiKey(providerId = 'openai') {
  const apiKey = await invoke('ai_provider_api_key_load', { providerId })
  return normalizeAiApiKey(apiKey)
}

async function loadAiConfig() {
  return invoke('ai_config_load')
}

async function saveAiConfig(config = null) {
  return invoke('ai_config_save', { config: config || {} })
}

async function storeAiApiKey(providerId = 'openai', apiKey = '') {
  return invoke('ai_provider_api_key_store', {
    providerId,
    apiKey: normalizeAiApiKey(apiKey),
  })
}

async function clearAiApiKey(providerId = 'openai') {
  return invoke('ai_provider_api_key_clear', { providerId })
}

async function testAiProviderConnection(providerId = 'openai', providerConfig = {}, apiKey = '') {
  return invoke('ai_provider_connection_test', {
    providerId,
    providerConfig,
    apiKey: normalizeAiApiKey(apiKey),
  })
}

function normalizeAiApiKey(apiKey = '') {
  return typeof apiKey === 'string' ? apiKey : String(apiKey ?? '')
}

const providerDefinitions = ref([])
const providerForms = ref({})
const providerKeys = ref({})
const providerFeedback = ref({})
const providerModelOptions = ref({})
const providerModelLoading = ref({})
const providerModelErrors = ref({})
const loadedConfig = ref(null)
const researchDefaults = ref({
  defaultCitationStyle: 'apa',
  evidenceStrategy: 'balanced',
  taskCompletionThreshold: 'strict',
})

const currentWorkspacePath = computed(() => String(workspaceStore.path || '').trim())
const citationStyleOptions = computed(() =>
  getAvailableCitationStyles().map((style) => ({
    value: style.id,
    label: style.label,
  }))
)
const evidenceStrategyOptions = computed(() => [
  { value: 'focused', label: t('Focused evidence') },
  { value: 'balanced', label: t('Balanced evidence') },
  { value: 'strict', label: t('Strict evidence') },
])
const completionThresholdOptions = computed(() => [
  { value: 'fast', label: t('Fast') },
  { value: 'balanced', label: t('Balanced') },
  { value: 'strict', label: t('Strict') },
])

const expandedProvider = ref(null)
function toggleProvider(id) {
  expandedProvider.value = expandedProvider.value === id ? null : id
  if (expandedProvider.value) {
    void refreshProviderModels(expandedProvider.value, { force: false })
  }
}
const saving = ref(false)
const testingProviderId = ref('')

function findProviderDefinition(providerId = '') {
  const normalizedProviderId = String(providerId || '').trim()
  return (
    providerDefinitions.value.find((provider) => provider.id === normalizedProviderId) || {
      id: normalizedProviderId,
      label: normalizedProviderId,
      defaultBaseUrl: '',
      defaultModel: '',
      modelPlaceholder: '',
      baseUrlHint: '',
      usesAutomaticModel: normalizedProviderId !== 'custom',
    }
  )
}

function resolveProviderModel(providerId = '', form = null) {
  const normalizedValue = String(form?.model || '').trim()
  if (normalizedValue) return normalizedValue
  const definition = findProviderDefinition(providerId)
  if (definition.usesAutomaticModel === false) return ''
  return String(definition.defaultModel || definition.modelPlaceholder || '').trim()
}

function buildProviderForm(providerId = '', config = null) {
  const definition = findProviderDefinition(providerId)
  return {
    baseUrl: String(config?.baseUrl ?? definition.defaultBaseUrl ?? ''),
    model: String(config?.model || resolveProviderModel(providerId, config)),
    temperatureText: String(config?.temperature ?? 0.2),
  }
}

function getProviderForm(providerId = '') {
  if (!providerForms.value[providerId]) {
    providerForms.value = {
      ...providerForms.value,
      [providerId]: buildProviderForm(providerId),
    }
  }
  return providerForms.value[providerId]
}

function getProviderKey(providerId = '') {
  return String(providerKeys.value[providerId] || '')
}

function updateProviderField(providerId = '', field = '', value = '') {
  providerForms.value = {
    ...providerForms.value,
    [providerId]: {
      ...getProviderForm(providerId),
      [field]: String(value ?? ''),
    },
  }
  delete providerFeedback.value[providerId]
  if (field === 'baseUrl') {
    providerModelOptions.value = {
      ...providerModelOptions.value,
      [providerId]: [],
    }
    delete providerModelErrors.value[providerId]
  }
}

function updateProviderKey(providerId = '', value = '') {
  providerKeys.value = {
    ...providerKeys.value,
    [providerId]: String(value ?? ''),
  }
  delete providerFeedback.value[providerId]
  providerModelOptions.value = {
    ...providerModelOptions.value,
    [providerId]: [],
  }
  delete providerModelErrors.value[providerId]
}

function normalizeErrorMessage(error, fallback = '') {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object') {
    for (const key of ['message', 'error', 'reason', 'details']) {
      const value = String(error[key] || '').trim()
      if (value) return value
    }
    try {
      const serialized = JSON.stringify(error)
      if (serialized && serialized !== '{}') return serialized
    } catch {
      // fall through
    }
  }
  return fallback
}

function buildProviderConfig(providerId = '') {
  const form = getProviderForm(providerId)
  const config = {
    baseUrl: form.baseUrl.trim(),
    model: resolveProviderModel(providerId, form),
    temperature: Number(form.temperatureText || 0.2),
  }

  if (providerId === 'anthropic') {
    const existingProviderConfig = loadedConfig.value?.providers?.[providerId] || {}
    const sdkConfig = existingProviderConfig?.sdk || {
      runtimeMode: 'sdk',
      approvalMode: 'per-tool',
      toolPolicies: {},
    }
    config.sdk = {
      runtimeMode: String(sdkConfig.runtimeMode || 'sdk').trim() || 'sdk',
      approvalMode: String(sdkConfig.approvalMode || 'per-tool').trim() || 'per-tool',
      toolPolicies: { ...(sdkConfig.toolPolicies || {}) },
    }
  }

  return config
}

function buildConfig() {
  const currentConfig = loadedConfig.value || {}
  return {
    ...currentConfig,
    currentProviderId: String(currentConfig.currentProviderId || 'openai').trim(),
    enabledTools: Array.isArray(currentConfig.enabledTools) ? [...currentConfig.enabledTools] : [],
    researchDefaults: {
      defaultCitationStyle: String(researchDefaults.value.defaultCitationStyle || 'apa').trim() || 'apa',
      evidenceStrategy: String(researchDefaults.value.evidenceStrategy || 'balanced').trim() || 'balanced',
      taskCompletionThreshold:
        String(researchDefaults.value.taskCompletionThreshold || 'strict').trim() || 'strict',
    },
    providers: Object.fromEntries(
      providerDefinitions.value.map((provider) => [provider.id, buildProviderConfig(provider.id)])
    ),
  }
}

function updateResearchDefault(field = '', value = '') {
  researchDefaults.value = {
    ...researchDefaults.value,
    [field]: String(value ?? '').trim(),
  }
}

function canTestProvider(providerId = '') {
  const form = getProviderForm(providerId)
  return (
    !!form.baseUrl.trim() &&
    !!resolveProviderModel(providerId, form) &&
    !!getProviderKey(providerId).trim()
  )
}

function isTestingProvider(providerId = '') {
  return testingProviderId.value === providerId
}

function isProviderConfigured(providerId = '') {
  const form = getProviderForm(providerId)
  return (
    !!form.baseUrl.trim() &&
    !!resolveProviderModel(providerId, form) &&
    !!getProviderKey(providerId).trim()
  )
}

function getProviderFeedback(providerId = '') {
  const feedback = providerFeedback.value[providerId]
  return feedback && typeof feedback === 'object' ? feedback : null
}

function getProviderModelOptions(providerId = '') {
  return Array.isArray(providerModelOptions.value[providerId])
    ? providerModelOptions.value[providerId]
    : []
}

function isLoadingProviderModels(providerId = '') {
  return providerModelLoading.value[providerId] === true
}

function getProviderModelMeta(providerId = '') {
  const error = String(providerModelErrors.value[providerId] || '').trim()
  if (error) return error
  const optionCount = getProviderModelOptions(providerId).length
  if (optionCount > 0) {
    return t('{count} models found', { count: optionCount })
  }
  if (isLoadingProviderModels(providerId)) {
    return t('Loading models...')
  }
  return ''
}

async function refreshProviderModels(providerId = '', { force = false } = {}) {
  const normalizedProviderId = String(providerId || '').trim()
  if (!normalizedProviderId) return []
  if (isLoadingProviderModels(normalizedProviderId))
    return getProviderModelOptions(normalizedProviderId)
  if (!force && getProviderModelOptions(normalizedProviderId).length > 0) {
    return getProviderModelOptions(normalizedProviderId)
  }

  providerModelLoading.value = {
    ...providerModelLoading.value,
    [normalizedProviderId]: true,
  }
  delete providerModelErrors.value[normalizedProviderId]

  try {
    const options = await listAiProviderModels(
      normalizedProviderId,
      buildProviderConfig(normalizedProviderId),
      getProviderKey(normalizedProviderId).trim()
    )

    providerModelOptions.value = {
      ...providerModelOptions.value,
      [normalizedProviderId]: options,
    }

    if (options.length > 0) {
      const currentModel = String(getProviderForm(normalizedProviderId).model || '').trim()
      const hasCurrentModel = options.some((option) => option.value === currentModel)
      if (!hasCurrentModel) {
        updateProviderField(normalizedProviderId, 'model', options[0].value)
      }
    }

    return options
  } catch (error) {
    providerModelErrors.value = {
      ...providerModelErrors.value,
      [normalizedProviderId]: normalizeErrorMessage(error, t('Failed to load models.')),
    }
    providerModelOptions.value = {
      ...providerModelOptions.value,
      [normalizedProviderId]: [],
    }
    return []
  } finally {
    providerModelLoading.value = {
      ...providerModelLoading.value,
      [normalizedProviderId]: false,
    }
  }
}

async function loadState() {
  saving.value = true

  try {
    providerDefinitions.value = await listAiProviderDefinitions()
    const config = await loadAiConfig()
    const keyEntries = await Promise.all(
      providerDefinitions.value.map(async (provider) => [
        provider.id,
        await loadAiApiKey(provider.id),
      ])
    )

    providerForms.value = Object.fromEntries(
      providerDefinitions.value.map((provider) => [
        provider.id,
        buildProviderForm(provider.id, config?.providers?.[provider.id]),
      ])
    )
    providerKeys.value = Object.fromEntries(
      keyEntries.map(([providerId, apiKey]) => [providerId, String(apiKey || '')])
    )
    loadedConfig.value = config
    researchDefaults.value = {
      defaultCitationStyle: String(
        config?.researchDefaults?.defaultCitationStyle || referencesStore.citationStyle || 'apa'
      ).trim() || 'apa',
      evidenceStrategy: String(config?.researchDefaults?.evidenceStrategy || 'balanced').trim() || 'balanced',
      taskCompletionThreshold:
        String(config?.researchDefaults?.taskCompletionThreshold || 'strict').trim() || 'strict',
    }
    referencesStore.setCitationStyle(researchDefaults.value.defaultCitationStyle)
    await aiStore.refreshProviderState()
  } catch (error) {
    toastStore.show(normalizeErrorMessage(error, t('Failed to load AI settings.')), {
      type: 'error',
    })
  } finally {
    saving.value = false
  }
}

async function persistAllProviders() {
  const nextConfig = buildConfig()
  await saveAiConfig(nextConfig)
  loadedConfig.value = nextConfig
  referencesStore.setCitationStyle(researchDefaults.value.defaultCitationStyle)
  for (const provider of providerDefinitions.value) {
    await storeAiApiKey(provider.id, getProviderKey(provider.id).trim())
  }
  await aiStore.refreshProviderState()
}

async function handleSave() {
  saving.value = true

  try {
    await persistAllProviders()
    if (expandedProvider.value) {
      providerFeedback.value = {
        ...providerFeedback.value,
        [expandedProvider.value]: {
          type: 'success',
          message: t('All AI provider settings saved.'),
        },
      }
    }
    toastStore.show(t('All AI provider settings saved.'))
  } catch (error) {
    toastStore.show(normalizeErrorMessage(error, t('Failed to save AI settings.')), {
      type: 'error',
    })
  } finally {
    saving.value = false
  }
}

async function handleTestProvider(providerId = '') {
  testingProviderId.value = providerId
  delete providerFeedback.value[providerId]

  try {
    await testAiProviderConnection(
      providerId,
      {
        ...buildProviderConfig(providerId),
        providerId,
      },
      getProviderKey(providerId).trim()
    )

    providerFeedback.value = {
      ...providerFeedback.value,
      [providerId]: {
        type: 'success',
        message: t('AI connection succeeded.'),
      },
    }
  } catch (error) {
    providerFeedback.value = {
      ...providerFeedback.value,
      [providerId]: {
        type: 'error',
        message: normalizeErrorMessage(error, t('AI connection failed.')),
      },
    }
  } finally {
    testingProviderId.value = ''
  }
}

async function handleClearProvider(providerId = '') {
  saving.value = true

  try {
    providerForms.value = {
      ...providerForms.value,
      [providerId]: buildProviderForm(providerId),
    }
    providerKeys.value = {
      ...providerKeys.value,
      [providerId]: '',
    }
    providerFeedback.value = {
      ...providerFeedback.value,
      [providerId]: {
        type: 'success',
        message: t('AI settings cleared.'),
      },
    }
    await clearAiApiKey(providerId)
    await persistAllProviders()
    toastStore.show(`${findProviderDefinition(providerId).label} · ${t('AI settings cleared.')}`)
  } catch (error) {
    toastStore.show(normalizeErrorMessage(error, t('Failed to clear AI settings.')), {
      type: 'error',
    })
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void loadState()
})
</script>

<style scoped>
.settings-ai-research-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--border) 52%, transparent);
  background: color-mix(in srgb, var(--surface-base) 82%, transparent);
}

.settings-ai-research-intro {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.settings-ai-research-intro-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.settings-ai-research-intro-copy {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.settings-ai-research-summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-hover) 28%, transparent);
}

.settings-ai-research-summary-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-tertiary);
}

.settings-ai-research-summary-value {
  font-size: 13px;
  color: var(--text-primary);
  word-break: break-word;
}

.settings-ai-research-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.settings-ai-static-value {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  background: color-mix(in srgb, var(--surface-hover) 24%, transparent);
  color: var(--text-primary);
  font-size: 13px;
}

.settings-ai-input {
  width: 280px;
  max-width: 100%;
}

.settings-ai-provider-row-meta {
  margin-top: -8px;
  padding-left: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.settings-ai-provider-listbox {
  display: flex;
  flex-direction: column;
  background: var(--surface-base);
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.settings-ai-provider-item {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
  transition: background-color 0.2s ease;
}
.settings-ai-provider-item:last-child {
  border-bottom: none;
}

.settings-ai-provider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
  background: transparent;
  transition: background-color 0.15s ease;
}
.settings-ai-provider-header:hover {
  background: color-mix(in srgb, var(--sidebar-item-hover) 40%, transparent);
}

.settings-ai-provider-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.settings-ai-provider-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--text-secondary) 8%, transparent);
  color: var(--text-primary);
}

.settings-ai-provider-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.settings-ai-provider-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  background: color-mix(in srgb, var(--surface-hover) 20%, transparent);
  color: var(--text-secondary);
  font-size: 11px;
}

.settings-ai-provider-badge.is-configured {
  border-color: color-mix(in srgb, var(--success) 45%, transparent);
  background: color-mix(in srgb, var(--success) 12%, transparent);
  color: var(--success);
}

.settings-ai-provider-chevron {
  color: var(--text-muted);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.settings-ai-provider-chevron.is-rotated {
  transform: rotate(180deg);
}

.settings-ai-provider-body {
  padding: 4px 16px 16px 48px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 16px 16px 48px;
  background: color-mix(in srgb, var(--sidebar-item-hover) 15%, transparent);
  border-top: 1px solid color-mix(in srgb, var(--border) 25%, transparent);
}

.settings-ai-provider-group {
  display: flex;
  flex-direction: column;
  padding: 0 16px;
  background: var(--surface-base);
  border: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.settings-ai-provider-group .settings-ai-provider-row {
  padding: 12px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 25%, transparent);
}
.settings-ai-provider-group .settings-ai-provider-row:last-child {
  border-bottom: none;
}

.settings-ai-provider-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.settings-inline-message {
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--success);
}

.settings-inline-message-error {
  color: var(--error);
}

@media (max-width: 720px) {
  .settings-ai-research-grid {
    grid-template-columns: 1fr;
  }
}

.ai-provider-collapse-enter-active,
.ai-provider-collapse-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}
.ai-provider-collapse-enter-from,
.ai-provider-collapse-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
