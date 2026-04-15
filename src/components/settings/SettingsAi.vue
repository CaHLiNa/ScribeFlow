<template>
  <div class="settings-page">
    <h3 class="settings-section-title">{{ t('AI') }}</h3>

    <section class="settings-group">
      <h4 class="settings-group-title">{{ t('Provider routing') }}</h4>
      <div class="settings-group-body">
        <div class="settings-row">
          <div class="settings-row-copy">
            <div class="settings-row-title">{{ t('Active provider') }}</div>
            <div class="settings-row-hint">
              {{ t('Choose which saved provider should power grounded chat and AI skills.') }}
            </div>
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
            <div class="settings-row-title">{{ t('Connection status') }}</div>
            <div class="settings-row-hint">
              {{ activeProviderStatusCopy }}
            </div>
          </div>
          <div class="settings-row-control compact settings-ai-actions">
            <UiButton variant="secondary" size="sm" :disabled="saving" @click="handleSave">
              {{ saving ? t('Saving...') : t('Save all providers') }}
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
      <div class="settings-ai-provider-list">
        <article
          v-for="provider in providerDefinitions"
          :key="provider.id"
          class="settings-ai-provider-card"
          :class="{ 'is-active': provider.id === currentProviderId }"
        >
          <header class="settings-ai-provider-card__header">
            <div class="settings-ai-provider-card__copy">
              <div class="settings-ai-provider-card__titleline">
                <h5 class="settings-ai-provider-card__title">{{ provider.label }}</h5>
                <span class="settings-ai-provider-card__badge">
                  {{
                    provider.id === currentProviderId
                      ? t('Active provider')
                      : t('Available')
                  }}
                </span>
              </div>
              <p class="settings-ai-provider-card__hint">
                {{
                  provider.id === 'custom'
                    ? t('Use this slot for OpenAI-compatible relays, local gateways, or enterprise endpoints.')
                    : `${t('Default endpoint')}: ${provider.baseUrlHint}`
                }}
              </p>
            </div>

            <div class="settings-ai-provider-card__actions">
              <UiButton
                variant="secondary"
                size="sm"
                :disabled="saving"
                @click="handleUseProvider(provider.id)"
              >
                {{
                  provider.id === currentProviderId
                    ? t('Using this provider')
                    : t('Use this provider')
                }}
              </UiButton>
              <UiButton
                variant="secondary"
                size="sm"
                :disabled="saving || isTestingProvider(provider.id) || !canTestProvider(provider.id)"
                @click="handleTestProvider(provider.id)"
              >
                {{
                  isTestingProvider(provider.id)
                    ? t('Testing...')
                    : t('Test connection')
                }}
              </UiButton>
              <UiButton
                variant="danger"
                size="sm"
                :disabled="saving"
                @click="handleClearProvider(provider.id)"
              >
                {{ t('Clear') }}
              </UiButton>
            </div>
          </header>

          <div class="settings-group-body settings-ai-provider-card__body">
            <div class="settings-row">
              <div class="settings-row-copy">
                <div class="settings-row-title">{{ t('Base URL') }}</div>
                <div class="settings-row-hint">
                  {{
                    provider.id === 'custom'
                      ? t('Provide a chat-completions compatible endpoint such as a local relay or hosted gateway.')
                      : t('The official preset is prefilled, but you can override it for mirrors or relays.')
                  }}
                </div>
              </div>
              <div class="settings-row-control">
                <UiInput
                  :model-value="getProviderForm(provider.id).baseUrl"
                  size="sm"
                  :placeholder="provider.baseUrlHint"
                  @update:model-value="updateProviderField(provider.id, 'baseUrl', $event)"
                />
              </div>
            </div>

            <div class="settings-row">
              <div class="settings-row-copy">
                <div class="settings-row-title">{{ t('Model') }}</div>
                <div class="settings-row-hint">{{ t('Set the exact model identifier exposed by your provider.') }}</div>
              </div>
              <div class="settings-row-control">
                <UiInput
                  :model-value="getProviderForm(provider.id).model"
                  size="sm"
                  :placeholder="provider.modelPlaceholder"
                  @update:model-value="updateProviderField(provider.id, 'model', $event)"
                />
              </div>
            </div>

            <div class="settings-row">
              <div class="settings-row-copy">
                <div class="settings-row-title">{{ t('API key') }}</div>
                <div class="settings-row-hint">{{ t('Store credentials locally in the app keychain.') }}</div>
              </div>
              <div class="settings-row-control">
                <UiInput
                  :model-value="getProviderKey(provider.id)"
                  size="sm"
                  type="password"
                  :placeholder="provider.id === 'custom' ? 'token-...' : 'sk-...'"
                  @update:model-value="updateProviderKey(provider.id, $event)"
                />
              </div>
            </div>

            <div class="settings-row">
              <div class="settings-row-copy">
                <div class="settings-row-title">{{ t('Temperature') }}</div>
                <div class="settings-row-hint">{{ t('Lower values keep revision and citation behavior more stable.') }}</div>
              </div>
              <div class="settings-row-control">
                <UiInput
                  :model-value="getProviderForm(provider.id).temperatureText"
                  size="sm"
                  placeholder="0.2"
                  @update:model-value="updateProviderField(provider.id, 'temperatureText', $event)"
                />
              </div>
            </div>
          </div>

          <div
            v-if="providerFeedback[provider.id]?.message"
            class="settings-inline-message"
            :class="{ 'settings-inline-message-error': providerFeedback[provider.id]?.type === 'error' }"
          >
            {{ providerFeedback[provider.id]?.message }}
          </div>
        </article>
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
import { requestOpenAiCompatibleCompletion } from '../../services/ai/openAiCompatible.js'

const { t } = useI18n()

const providerDefinitions = AI_PROVIDER_DEFINITIONS
const providerForms = ref({})
const providerKeys = ref({})
const providerFeedback = ref({})
const currentProviderId = ref('openai')
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
    return t('The active provider still needs a base URL, model, and API key before it can run skills.')
  }

  return `${provider.label} · ${form.model.trim()} · ${form.baseUrl.trim()}`
})

function buildProviderForm(providerId = '', config = null) {
  const definition = getAiProviderDefinition(providerId)
  return {
    baseUrl: String(config?.baseUrl ?? definition.defaultBaseUrl ?? ''),
    model: String(config?.model || ''),
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
  return {
    baseUrl: form.baseUrl.trim(),
    model: form.model.trim(),
    temperature: Number(form.temperatureText || 0.2),
  }
}

function buildConfig() {
  return {
    currentProviderId: currentProviderId.value,
    providers: Object.fromEntries(
      providerDefinitions.map((provider) => [
        provider.id,
        buildProviderConfig(provider.id),
      ])
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

async function loadState() {
  saving.value = true
  globalError.value = ''
  globalSuccess.value = ''

  try {
    const config = await loadAiConfig()
    const keyEntries = await Promise.all(
      providerDefinitions.map(async (provider) => [
        provider.id,
        await loadAiApiKey(provider.id),
      ])
    )

    providerForms.value = Object.fromEntries(
      providerDefinitions.map((provider) => [
        provider.id,
        buildProviderForm(
          provider.id,
          getAiProviderConfig(config, provider.id)
        ),
      ])
    )
    providerKeys.value = Object.fromEntries(
      keyEntries.map(([providerId, apiKey]) => [providerId, String(apiKey || '')])
    )
    currentProviderId.value = String(config?.currentProviderId || 'openai').trim()
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
    await requestOpenAiCompatibleCompletion(
      {
        ...buildProviderConfig(providerId),
        providerId,
      },
      getProviderKey(providerId).trim(),
      [
        { role: 'system', content: 'Return valid JSON only.' },
        { role: 'user', content: 'Return {"answer":"ok"}' },
      ],
      { maxTokens: 40 }
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

.settings-ai-provider-list {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.settings-ai-provider-card {
  border: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
  border-radius: 18px;
  padding: 18px 18px 12px;
  background: color-mix(in srgb, var(--surface-raised) 72%, transparent);
}

.settings-ai-provider-card.is-active {
  border-color: color-mix(in srgb, var(--accent) 38%, var(--border));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 14%, transparent);
}

.settings-ai-provider-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
}

.settings-ai-provider-card__copy {
  min-width: 0;
  flex: 1 1 auto;
}

.settings-ai-provider-card__titleline {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.settings-ai-provider-card__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.settings-ai-provider-card__badge {
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: color-mix(in srgb, var(--surface-base) 84%, transparent);
  color: var(--text-secondary);
}

.settings-ai-provider-card.is-active .settings-ai-provider-card__badge {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: color-mix(in srgb, var(--accent) 60%, var(--text-primary));
}

.settings-ai-provider-card__hint {
  margin: 8px 0 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-muted);
}

.settings-ai-provider-card__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.settings-ai-provider-card__body {
  margin-top: 8px;
}

@media (max-width: 860px) {
  .settings-ai-provider-card {
    padding: 16px 14px 10px;
  }

  .settings-ai-provider-card__header {
    flex-direction: column;
  }

  .settings-ai-provider-card__actions {
    justify-content: flex-start;
  }
}
</style>
