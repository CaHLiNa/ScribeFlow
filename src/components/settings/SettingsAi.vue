<template>
  <div class="settings-page">
    <h3 class="settings-section-title">{{ t('AI') }}</h3>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Provider routing') }}</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Active provider') }}</div>
          </div>
          <div class="settings-row-control">
            <UiSelect
              :model-value="currentProviderId"
              size="sm"
              :options="providerOptions"
              @update:model-value="handleProviderSelect"
            />
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Status') }}</div>
            <div class="settings-row-hint" style="color: var(--text-secondary)">
              {{ activeProviderStatusCopy }}
            </div>
          </div>
          <div class="settings-row-control compact settings-ai-actions">
            <UiButton variant="secondary" size="sm" :disabled="saving" @click="handleSave">
              {{ saving ? t('Saving...') : t('Save configs') }}
            </UiButton>
          </div>
        </div>

        <div v-if="globalError" class="settings-inline-message settings-inline-message-error">
          {{ globalError }}
        </div>
        <div v-else-if="globalSuccess" class="settings-inline-message">
          {{ globalSuccess }}
        </div>
      </div>
    </section>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Provider configurations') }}</h4>
      <div class="settings-ai-provider-listbox">
        <div
          v-for="provider in providerDefinitions"
          :key="provider.id"
          class="settings-ai-provider-item"
          :class="{
            'is-expanded': expandedProvider === provider.id,
            'is-active-provider': provider.id === currentProviderId,
          }"
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
              <div v-if="provider.id === currentProviderId" class="settings-ai-provider-badge">
                {{ t('Active') }}
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
                  <UiInput
                    :model-value="getProviderForm(provider.id).model"
                    size="sm"
                    :placeholder="provider.modelPlaceholder"
                    class="settings-ai-input"
                    @update:model-value="updateProviderField(provider.id, 'model', $event)"
                  />
                </div>
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

              <template v-if="provider.id === 'anthropic'">
                <div class="settings-row settings-ai-provider-row">
                  <div class="settings-row-copy">
                    <div class="settings-row-title">{{ t('SDK runtime') }}</div>
                  </div>
                  <div class="settings-row-control">
                    <UiSelect
                      :model-value="getProviderForm('anthropic').sdkRuntimeMode"
                      size="sm"
                      :options="anthropicRuntimeOptions"
                      @update:model-value="updateAnthropicSdkField('sdkRuntimeMode', $event)"
                    />
                  </div>
                </div>

                <div class="settings-row settings-ai-provider-row">
                  <div class="settings-row-copy">
                    <div class="settings-row-title">{{ t('Approval mode') }}</div>
                  </div>
                  <div class="settings-row-control">
                    <UiSelect
                      :model-value="getProviderForm('anthropic').sdkApprovalMode"
                      size="sm"
                      :options="anthropicApprovalOptions"
                      :disabled="getProviderForm('anthropic').sdkRuntimeMode !== 'sdk'"
                      @update:model-value="updateAnthropicSdkField('sdkApprovalMode', $event)"
                    />
                  </div>
                </div>

                <div
                  class="settings-row settings-ai-provider-row settings-ai-provider-row--sdk-tools"
                >
                  <div class="settings-row-copy">
                    <div class="settings-row-title">{{ t('Built-in tool policy') }}</div>
                  </div>
                  <div class="settings-row-control">
                    <div class="settings-ai-tool-policy-list">
                      <div
                        v-for="tool in AI_ANTHROPIC_SDK_TOOL_DEFINITIONS"
                        :key="tool.id"
                        class="settings-ai-tool-policy-item"
                      >
                        <div class="settings-ai-tool-policy-copy">
                          <div class="settings-ai-tool-policy-title">{{ tool.label }}</div>
                          <div class="settings-ai-tool-policy-meta">
                            {{ t(tool.descriptionKey) }}
                          </div>
                        </div>
                        <UiSelect
                          :model-value="
                            getProviderForm('anthropic').sdkToolPolicies?.[tool.id] || 'ask'
                          "
                          size="sm"
                          class="settings-ai-tool-policy-select"
                          :options="anthropicPolicyOptions"
                          :disabled="getProviderForm('anthropic').sdkRuntimeMode !== 'sdk'"
                          @update:model-value="updateAnthropicToolPolicy(tool.id, $event)"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </template>

              <div
                class="settings-row settings-ai-provider-row"
                style="border-bottom: none; padding-bottom: 0"
              >
                <div class="settings-row-copy"></div>
                <div class="settings-row-control" style="gap: 8px; justify-content: flex-end">
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
                    variant="danger"
                    size="sm"
                    style="background: transparent; color: var(--error)"
                    :disabled="saving"
                    @click="handleClearProvider(provider.id)"
                  >
                    {{ t('Clear') }}
                  </UiButton>
                </div>
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
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'
import UiInput from '../shared/ui/UiInput.vue'
import UiSelect from '../shared/ui/UiSelect.vue'
import {
  AI_PROVIDER_DEFINITIONS,
  clearAiApiKey,
  getAiProviderConfig,
  getAiProviderDefinition,
  loadAiApiKey,
  loadAiConfig,
  saveAiConfig,
  setCurrentAiProvider,
  storeAiApiKey,
} from '../../services/ai/settings.js'
import { testAiProviderConnection } from '../../services/ai/providerDiagnostics.js'
import {
  AI_ANTHROPIC_SDK_APPROVAL_OPTIONS,
  AI_ANTHROPIC_SDK_RUNTIME_OPTIONS,
  AI_ANTHROPIC_SDK_TOOL_DEFINITIONS,
  AI_ANTHROPIC_SDK_POLICY_OPTIONS,
  normalizeAnthropicSdkConfig,
} from '../../services/ai/runtime/anthropicSdkPolicy.js'

const { t } = useI18n()

const providerDefinitions = AI_PROVIDER_DEFINITIONS
const providerForms = ref({})
const providerKeys = ref({})
const providerFeedback = ref({})
const currentProviderId = ref('openai')
const loadedEnabledTools = ref([])

const expandedProvider = ref(null)
function toggleProvider(id) {
  expandedProvider.value = expandedProvider.value === id ? null : id
}
const saving = ref(false)
const testingProviderId = ref('')
const globalError = ref('')
const globalSuccess = ref('')

const providerOptions = computed(() =>
  providerDefinitions.map((provider) => ({
    value: provider.id,
    label: provider.label,
  }))
)

const activeProviderStatusCopy = computed(() => {
  const provider = getAiProviderDefinition(currentProviderId.value)
  const form = getProviderForm(currentProviderId.value)
  const key = getProviderKey(currentProviderId.value)
  const feedback = providerFeedback.value[currentProviderId.value]

  if (feedback?.type === 'success') return feedback.message
  if (!form.baseUrl.trim() || !form.model.trim() || !key.trim()) {
    return t(
      'The active provider still needs a base URL, model, and API key before it can run skills.'
    )
  }

  return `${provider.label} · ${form.model.trim()} · ${form.baseUrl.trim()}`
})

function buildProviderForm(providerId = '', config = null) {
  const definition = getAiProviderDefinition(providerId)
  const form = {
    baseUrl: String(config?.baseUrl ?? definition.defaultBaseUrl ?? ''),
    model: String(config?.model || ''),
    temperatureText: String(config?.temperature ?? 0.2),
  }

  if (providerId === 'anthropic') {
    const sdkConfig = normalizeAnthropicSdkConfig(config?.sdk)
    form.sdkRuntimeMode = sdkConfig.runtimeMode
    form.sdkApprovalMode = sdkConfig.approvalMode
    form.sdkToolPolicies = { ...sdkConfig.toolPolicies }
  }

  return form
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
  globalError.value = ''
  globalSuccess.value = ''
}

function updateProviderKey(providerId = '', value = '') {
  providerKeys.value = {
    ...providerKeys.value,
    [providerId]: String(value ?? ''),
  }
  delete providerFeedback.value[providerId]
  globalError.value = ''
  globalSuccess.value = ''
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
    model: form.model.trim(),
    temperature: Number(form.temperatureText || 0.2),
  }

  if (providerId === 'anthropic') {
    config.sdk = {
      runtimeMode: String(form.sdkRuntimeMode || 'sdk').trim(),
      approvalMode: String(form.sdkApprovalMode || 'per-tool').trim(),
      toolPolicies: { ...(form.sdkToolPolicies || {}) },
    }
  }

  return config
}

function buildConfig() {
  return {
    currentProviderId: currentProviderId.value,
    enabledTools: [...loadedEnabledTools.value],
    providers: Object.fromEntries(
      providerDefinitions.map((provider) => [provider.id, buildProviderConfig(provider.id)])
    ),
  }
}

function canTestProvider(providerId = '') {
  const form = getProviderForm(providerId)
  return !!form.baseUrl.trim() && !!form.model.trim() && !!getProviderKey(providerId).trim()
}

function isTestingProvider(providerId = '') {
  return testingProviderId.value === providerId
}

const anthropicRuntimeOptions = AI_ANTHROPIC_SDK_RUNTIME_OPTIONS.map((option) => ({
  value: option.value,
  label: t(option.labelKey),
}))

const anthropicApprovalOptions = AI_ANTHROPIC_SDK_APPROVAL_OPTIONS.map((option) => ({
  value: option.value,
  label: t(option.labelKey),
}))

const anthropicPolicyOptions = AI_ANTHROPIC_SDK_POLICY_OPTIONS.map((option) => ({
  value: option.value,
  label: t(option.labelKey),
}))

function updateAnthropicSdkField(field = '', value = '') {
  const currentForm = getProviderForm('anthropic')
  providerForms.value = {
    ...providerForms.value,
    anthropic: {
      ...currentForm,
      [field]: String(value ?? ''),
    },
  }
  delete providerFeedback.value.anthropic
  globalError.value = ''
  globalSuccess.value = ''
}

function updateAnthropicToolPolicy(toolId = '', value = '') {
  const currentForm = getProviderForm('anthropic')
  providerForms.value = {
    ...providerForms.value,
    anthropic: {
      ...currentForm,
      sdkToolPolicies: {
        ...(currentForm.sdkToolPolicies || {}),
        [toolId]: String(value || 'ask'),
      },
    },
  }
  delete providerFeedback.value.anthropic
  globalError.value = ''
  globalSuccess.value = ''
}

async function loadState() {
  saving.value = true
  globalError.value = ''
  globalSuccess.value = ''

  try {
    const config = await loadAiConfig()
    const keyEntries = await Promise.all(
      providerDefinitions.map(async (provider) => [provider.id, await loadAiApiKey(provider.id)])
    )

    providerForms.value = Object.fromEntries(
      providerDefinitions.map((provider) => [
        provider.id,
        buildProviderForm(provider.id, getAiProviderConfig(config, provider.id)),
      ])
    )
    providerKeys.value = Object.fromEntries(
      keyEntries.map(([providerId, apiKey]) => [providerId, String(apiKey || '')])
    )
    currentProviderId.value = String(config?.currentProviderId || 'openai').trim()
    loadedEnabledTools.value = Array.isArray(config?.enabledTools) ? [...config.enabledTools] : []
  } catch (error) {
    globalError.value = normalizeErrorMessage(error, t('Failed to load AI settings.'))
  } finally {
    saving.value = false
  }
}

async function persistAllProviders() {
  await saveAiConfig(buildConfig())
  for (const provider of providerDefinitions) {
    await storeAiApiKey(provider.id, getProviderKey(provider.id).trim())
  }
}

async function handleSave() {
  saving.value = true
  globalError.value = ''
  globalSuccess.value = ''

  try {
    await persistAllProviders()
    globalSuccess.value = t('All AI provider settings saved.')
  } catch (error) {
    globalError.value = normalizeErrorMessage(error, t('Failed to save AI settings.'))
  } finally {
    saving.value = false
  }
}

async function handleProviderSelect(providerId = '') {
  currentProviderId.value = String(providerId || 'openai').trim()
  globalError.value = ''
  globalSuccess.value = ''
}

async function handleUseProvider(providerId = '') {
  saving.value = true
  globalError.value = ''
  globalSuccess.value = ''
  currentProviderId.value = String(providerId || 'openai').trim()

  try {
    await persistAllProviders()
    await setCurrentAiProvider(currentProviderId.value)
    globalSuccess.value = t('Active AI provider updated.')
  } catch (error) {
    globalError.value = normalizeErrorMessage(error, t('Failed to save AI settings.'))
  } finally {
    saving.value = false
  }
}

async function handleTestProvider(providerId = '') {
  testingProviderId.value = providerId
  globalError.value = ''
  globalSuccess.value = ''
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
  globalError.value = ''
  globalSuccess.value = ''

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
    globalSuccess.value = `${getAiProviderDefinition(providerId).label} · ${t('AI settings cleared.')}`
  } catch (error) {
    globalError.value = normalizeErrorMessage(error, t('Failed to clear AI settings.'))
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void loadState()
})
</script>

<style scoped>
.settings-ai-actions {
  display: flex;
  justify-content: flex-end;
}

.settings-ai-input {
  width: 280px;
  max-width: 100%;
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
.settings-ai-provider-item.is-active-provider .settings-ai-provider-icon {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
}

.settings-ai-provider-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.settings-ai-provider-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--success) 12%, transparent);
  color: var(--success);
  text-transform: uppercase;
  letter-spacing: 0.04em;
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
  background: color-mix(in srgb, var(--sidebar-item-hover) 20%, transparent);
  border-top: 1px solid color-mix(in srgb, var(--border) 20%, transparent);
}

.settings-ai-provider-body .settings-ai-provider-row {
  padding: 12px 0;
  border-bottom: 1px dashed color-mix(in srgb, var(--border) 30%, transparent);
}
.settings-ai-provider-body .settings-row-title {
  font-size: 13px;
  color: var(--text-secondary);
}

.settings-ai-provider-row--sdk-tools {
  align-items: flex-start;
}

.settings-ai-tool-policy-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.settings-ai-tool-policy-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--border) 28%, transparent);
  background: color-mix(in srgb, var(--surface-base) 82%, transparent);
}

.settings-ai-tool-policy-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.settings-ai-tool-policy-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.settings-ai-tool-policy-meta {
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.settings-ai-tool-policy-select {
  min-width: 110px;
  max-width: 110px;
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
