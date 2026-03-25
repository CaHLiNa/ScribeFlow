<template>
  <div class="models-page models-page-compact">
    <h3 class="settings-section-title">{{ t('API Keys') }}</h3>

    <div v-if="configuredProviderDefs.length > 0" class="provider-group">
      <div class="provider-group-label">{{ t('Configured') }}</div>
      <div class="provider-grid">
        <UiButton
          v-for="spec in configuredProviderDefs"
          :key="spec.id"
          class="provider-card settings-choice-card"
          variant="secondary"
          size="sm"
          block
          content-mode="raw"
          :active="spec.id === selectedProviderId"
          @click="selectProvider(spec.id)"
        >
          <span class="provider-card-name">{{ spec.label }}</span>
          <span class="provider-card-status settings-choice-card-meta is-good">{{
            t('Configured')
          }}</span>
        </UiButton>
      </div>
    </div>

    <div v-if="moreProviderDefs.length > 0" class="provider-group">
      <UiButton
        class="advanced-toggle settings-disclosure-button"
        variant="ghost"
        size="sm"
        :active="showMoreProviders"
        @click="showMoreProviders = !showMoreProviders"
      >
        <template #leading>
          <svg
            class="settings-disclosure-icon"
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="currentColor"
          >
            <path d="M3 1l4 4-4 4z" />
          </svg>
        </template>
        {{ t('More Providers') }}
      </UiButton>

      <div v-if="showMoreProviders || configuredProviderDefs.length === 0" class="provider-grid">
        <UiButton
          v-for="spec in moreProviderDefs"
          :key="spec.id"
          class="provider-card settings-choice-card"
          variant="secondary"
          size="sm"
          block
          content-mode="raw"
          :active="spec.id === selectedProviderId"
          @click="selectProvider(spec.id)"
        >
          <span class="provider-card-name">{{ spec.label }}</span>
          <span class="provider-card-status settings-choice-card-meta">{{
            t('Not configured')
          }}</span>
        </UiButton>
      </div>
    </div>

    <div v-if="activeProviderSpec" class="provider-detail-card">
      <div class="provider-detail-head">
        <div class="provider-detail-copy">
          <div class="provider-detail-title">{{ activeProviderSpec.label }}</div>
        </div>
        <span
          class="provider-card-status settings-choice-card-meta"
          :class="{ 'is-good': isProviderConfigured(activeProviderSpec) }"
        >
          {{ isProviderConfigured(activeProviderSpec) ? t('Configured') : t('Not configured') }}
        </span>
      </div>

      <div class="key-field">
        <div class="key-input-row models-key-row">
          <UiInput
            :model-value="editKeys[activeProviderSpec.apiKeyEnv]"
            :type="visibilityByEnv[activeProviderSpec.apiKeyEnv] ? 'text' : 'password'"
            monospace
            :placeholder="keyPlaceholderFor(activeProviderSpec)"
            spellcheck="false"
            autocomplete="off"
            @update:model-value="editKeys[activeProviderSpec.apiKeyEnv] = $event"
          />
          <UiButton
            class="key-toggle"
            variant="secondary"
            size="icon-md"
            icon-only
            :title="visibilityByEnv[activeProviderSpec.apiKeyEnv] ? t('Hide') : t('Show')"
            @click="
              visibilityByEnv[activeProviderSpec.apiKeyEnv] =
                !visibilityByEnv[activeProviderSpec.apiKeyEnv]
            "
          >
            <svg
              v-if="!visibilityByEnv[activeProviderSpec.apiKeyEnv]"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <svg
              v-else
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path
                d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"
              />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          </UiButton>
        </div>
      </div>

      <div class="keys-actions">
        <UiButton :variant="keySaved ? 'secondary' : 'primary'" @click="saveKeys">
          {{ keySaved ? t('Saved') : t('Save Keys') }}
        </UiButton>
        <span v-if="keySaved" class="key-saved-hint">{{ t('Restart chat to use new keys') }}</span>
        <UiButton
          class="key-secondary-btn"
          variant="secondary"
          :loading="syncingModels"
          @click="syncModels"
        >
          {{ syncingModels ? t('Syncing models...') : t('Sync Models') }}
        </UiButton>
      </div>
      <p v-if="syncMessage" class="settings-hint" :class="{ 'key-error-hint': syncError }">
        {{ syncMessage }}
      </p>

      <UiButton
        class="advanced-toggle settings-disclosure-button"
        variant="ghost"
        size="sm"
        :active="showAdvanced"
        @click="showAdvanced = !showAdvanced"
      >
        <template #leading>
          <svg
            class="settings-disclosure-icon"
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="currentColor"
          >
            <path d="M3 1l4 4-4 4z" />
          </svg>
        </template>
        {{ t('Advanced') }}
      </UiButton>

      <div v-if="showAdvanced" class="advanced-section">
        <div class="key-field">
          <div class="provider-option-label">{{ t('API URL') }}</div>
          <div class="key-input-row models-key-row">
            <UiInput
              :model-value="editUrls[activeProviderSpec.id]"
              type="text"
              :placeholder="getProviderPlaceholder(activeProviderSpec.id)"
              spellcheck="false"
              @update:model-value="editUrls[activeProviderSpec.id] = $event"
            />
          </div>
        </div>

        <div
          v-if="activeProviderPdfTranslateOptionDefs.length > 0"
          class="provider-options-section"
        >
          <div class="provider-option-label">{{ t('PDF translation tuning') }}</div>
          <p class="settings-hint provider-option-hint">
            {{ t('These options only affect PDF translation for this provider.') }}
          </p>

          <div class="provider-options-grid">
            <template v-for="option in activeProviderPdfTranslateOptionDefs" :key="option.key">
              <label v-if="option.type === 'number'" class="key-field provider-option-field">
                <span class="provider-option-field-label">{{ t(option.labelKey) }}</span>
                <UiInput
                  v-model.number="editPdfTranslateOptions[activeProviderSpec.id][option.key]"
                  type="number"
                  shell-class="models-option-input"
                  :min="option.min"
                  :max="option.max"
                  :step="option.step"
                  spellcheck="false"
                />
                <span v-if="option.hintKey" class="provider-option-field-hint">{{
                  t(option.hintKey)
                }}</span>
              </label>

              <label v-else-if="option.type === 'select'" class="key-field provider-option-field">
                <span class="provider-option-field-label">{{ t(option.labelKey) }}</span>
                <UiSelect
                  v-model="editPdfTranslateOptions[activeProviderSpec.id][option.key]"
                  shell-class="models-option-select"
                >
                  <option
                    v-for="choice in option.options || []"
                    :key="choice.value"
                    :value="choice.value"
                  >
                    {{ t(choice.labelKey) }}
                  </option>
                </UiSelect>
              </label>

              <div v-else class="provider-inline-toggle">
                <div class="provider-inline-copy">
                  <div class="provider-option-field-label">{{ t(option.labelKey) }}</div>
                  <div v-if="option.hintKey" class="provider-option-field-hint">
                    {{ t(option.hintKey) }}
                  </div>
                </div>
                <div class="provider-inline-switch">
                  <UiSwitch
                    :model-value="editPdfTranslateOptions[activeProviderSpec.id][option.key]"
                    :aria-label="t(option.labelKey)"
                    @update:model-value="
                      editPdfTranslateOptions[activeProviderSpec.id][option.key] =
                        !editPdfTranslateOptions[activeProviderSpec.id][option.key]
                    "
                  />
                </div>
              </div>
            </template>
          </div>
        </div>

        <div class="keys-actions">
          <UiButton
            :variant="advancedSaved ? 'secondary' : 'primary'"
            @click="saveAdvancedSettings"
          >
            {{ advancedSaved ? t('Saved') : t('Save Advanced Settings') }}
          </UiButton>
        </div>
      </div>
    </div>

    <!-- Monthly Budget (conditional on having direct keys) -->
    <template v-if="hasDirectKeys && (usageStore.showCostEstimates || usageStore.monthlyLimit > 0)">
      <h3 class="settings-section-title models-budget-title">{{ t('Monthly Budget') }}</h3>
      <div class="usage-limit-row">
        <span class="usage-limit-dollar">$</span>
        <UiInput
          v-model="editMonthlyLimit"
          type="number"
          shell-class="usage-limit-input"
          step="1"
          min="0"
          :placeholder="t('0 (no limit)')"
          @keydown.enter="saveMonthlyLimit"
        />
        <UiButton :variant="limitSaved ? 'secondary' : 'primary'" @click="saveMonthlyLimit">
          {{ limitSaved ? t('Saved') : t('Set Limit') }}
        </UiButton>
      </div>

      <!-- Budget progress bar -->
      <div v-if="showBudgetBar" class="budget-progress models-budget-progress">
        <div class="budget-progress-track">
          <div
            class="budget-progress-fill"
            :style="{ width: budgetPercent + '%', background: budgetBarColor }"
          ></div>
        </div>
        <div class="budget-progress-label">
          <span class="models-budget-summary" :style="{ color: budgetBarColor }"
            >~{{ formatCost(usageStore.directCost) }} / ${{
              usageStore.monthlyLimit.toFixed(0)
            }}</span
          >
          <span v-if="usageStore.isOverBudget" class="models-budget-over">
            — {{ t('budget reached') }}</span
          >
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useUsageStore } from '../../stores/usage'
import { formatCost } from '../../services/tokenUsage'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'
import UiInput from '../shared/ui/UiInput.vue'
import UiSelect from '../shared/ui/UiSelect.vue'
import UiSwitch from '../shared/ui/UiSwitch.vue'
import {
  getDefaultModelsConfig,
  getProviderDefaultUrl,
  getProviderDefinitions,
  getProviderPlaceholder,
} from '../../services/modelCatalog'
import {
  compactPdfTranslateProviderOptions,
  getPdfTranslateProviderOptionDefs,
  normalizePdfTranslateProviderOptions,
} from '../../services/pdfTranslateProviderOptions'

const workspace = useWorkspaceStore()
const usageStore = useUsageStore()
const { t } = useI18n()
const keySaved = ref(false)
const showAdvanced = ref(false)
const advancedSaved = ref(false)
const editMonthlyLimit = ref('')
const limitSaved = ref(false)
const selectedProviderId = ref('')
const showMoreProviders = ref(false)
const syncingModels = ref(false)
const syncMessage = ref('')
const syncError = ref(false)
const providerDefs = getProviderDefinitions()

function isProviderConfigured(spec) {
  return !!String(editKeys[spec.apiKeyEnv] || '').trim()
}

const configuredProviderDefs = computed(() =>
  providerDefs.filter((spec) => isProviderConfigured(spec))
)
const moreProviderDefs = computed(() => providerDefs.filter((spec) => !isProviderConfigured(spec)))
const orderedProviderDefs = computed(() => [
  ...configuredProviderDefs.value,
  ...moreProviderDefs.value,
])
const activeProviderSpec = computed(
  () =>
    orderedProviderDefs.value.find((spec) => spec.id === selectedProviderId.value) ||
    orderedProviderDefs.value[0] ||
    null
)

const hasDirectKeys = computed(() => {
  return providerDefs.some((spec) => !!workspace.apiKeys?.[spec.apiKeyEnv])
})

const showBudgetBar = computed(() => {
  return usageStore.monthlyLimit > 0 && usageStore.directCost > 0
})

const budgetPercent = computed(() => {
  if (usageStore.monthlyLimit <= 0) return 0
  return Math.min(100, (usageStore.directCost / usageStore.monthlyLimit) * 100)
})

const budgetBarColor = computed(() => {
  const pct = budgetPercent.value
  if (pct >= 100) return 'var(--error)'
  if (pct >= 80) return 'var(--warning, #e0af68)'
  return 'var(--accent)'
})

async function saveMonthlyLimit() {
  const val = parseFloat(editMonthlyLimit.value) || 0
  await usageStore.setMonthlyLimit(val)
  limitSaved.value = true
  setTimeout(() => (limitSaved.value = false), 2000)
}

onMounted(() => {
  editMonthlyLimit.value = usageStore.monthlyLimit > 0 ? String(usageStore.monthlyLimit) : ''
})

const editKeys = reactive({
  ...Object.fromEntries(
    providerDefs.map((spec) => [spec.apiKeyEnv, workspace.apiKeys?.[spec.apiKeyEnv] || ''])
  ),
})

const visibilityByEnv = reactive(
  Object.fromEntries(providerDefs.map((spec) => [spec.apiKeyEnv, false]))
)

const editUrls = reactive({
  ...Object.fromEntries(
    providerDefs.map((spec) => [
      spec.id,
      workspace.modelsConfig?.providers?.[spec.id]?.customUrl || '',
    ])
  ),
})

const editPdfTranslateOptions = reactive(
  Object.fromEntries(
    providerDefs.map((spec) => [
      spec.id,
      normalizePdfTranslateProviderOptions(
        spec.id,
        workspace.modelsConfig?.providers?.[spec.id]?.pdfTranslateOptions
      ),
    ])
  )
)

const urlFields = providerDefs.map((spec) => ({
  provider: spec.id,
  label: spec.label,
  placeholder: getProviderPlaceholder(spec.id),
}))

const activeProviderPdfTranslateOptionDefs = computed(() =>
  getPdfTranslateProviderOptionDefs(activeProviderSpec.value?.id || '')
)

function keyPlaceholderFor(spec) {
  if (spec.id === 'anthropic') return 'sk-ant-...'
  if (spec.id === 'google') return 'AIza...'
  return 'sk-...'
}

function selectProvider(providerId) {
  selectedProviderId.value = providerId
  if (moreProviderDefs.value.some((spec) => spec.id === providerId)) {
    showMoreProviders.value = true
  }
}

watch(
  () => orderedProviderDefs.value.map((spec) => spec.id).join('|'),
  () => {
    const available = orderedProviderDefs.value
    if (!available.length) {
      selectedProviderId.value = ''
      return
    }
    const hasSelected = available.some((spec) => spec.id === selectedProviderId.value)
    if (!hasSelected) {
      selectedProviderId.value = configuredProviderDefs.value[0]?.id || available[0].id
    }
    if (configuredProviderDefs.value.length === 0) {
      showMoreProviders.value = true
    }
  },
  { immediate: true }
)

async function saveKeys() {
  try {
    // Merge with existing global keys (preserve keys not shown in this UI, e.g. EXA_API_KEY)
    const existing = await workspace.loadGlobalKeys()
    const merged = { ...existing }
    for (const [k, v] of Object.entries(editKeys)) {
      if (v) merged[k] = v
      else delete merged[k]
    }
    await workspace.saveGlobalKeys(merged)
    await workspace.loadSettings()
    keySaved.value = true
    setTimeout(() => (keySaved.value = false), 3000)
    await syncModels({ auto: true })
  } catch (e) {
    console.error('Failed to save keys:', e)
  }
}

async function saveAdvancedSettings() {
  try {
    const config = JSON.parse(JSON.stringify(workspace.modelsConfig || getDefaultModelsConfig()))

    for (const p of urlFields) {
      if (config.providers?.[p.provider]) {
        const url = editUrls[p.provider]?.trim()
        if (url) {
          config.providers[p.provider].customUrl = url
          config.providers[p.provider].url = url
        } else {
          delete config.providers[p.provider].customUrl
          config.providers[p.provider].url = getProviderDefaultUrl(p.provider)
        }

        const compactedOptions = compactPdfTranslateProviderOptions(
          p.provider,
          editPdfTranslateOptions[p.provider]
        )
        if (Object.keys(compactedOptions).length > 0) {
          config.providers[p.provider].pdfTranslateOptions = compactedOptions
        } else {
          delete config.providers[p.provider].pdfTranslateOptions
        }
      }
    }

    await workspace.saveModelsConfig(config)
    advancedSaved.value = true
    setTimeout(() => (advancedSaved.value = false), 3000)
  } catch (e) {
    console.error('Failed to save advanced provider settings:', e)
  }
}

watch(
  () => workspace.modelsConfig,
  (modelsConfig) => {
    for (const spec of providerDefs) {
      editUrls[spec.id] = modelsConfig?.providers?.[spec.id]?.customUrl || ''
      Object.assign(
        editPdfTranslateOptions[spec.id],
        normalizePdfTranslateProviderOptions(
          spec.id,
          modelsConfig?.providers?.[spec.id]?.pdfTranslateOptions
        )
      )
    }
  },
  { deep: true }
)

async function syncModels({ auto = false } = {}) {
  syncError.value = false
  syncMessage.value = auto ? t('Syncing models...') : ''
  syncingModels.value = true

  try {
    const result = await workspace.syncProviderModels()
    if (result.failedProviders.length > 0 && result.syncedProviders.length === 0) {
      throw new Error(result.failedProviders[0].error || t('Unknown error'))
    }

    if (result.addedCount > 0) {
      syncMessage.value = t('Synced {count} new models', { count: result.addedCount })
    } else if (result.syncedProviders.length > 0) {
      syncMessage.value = t('Models are already up to date')
    } else {
      syncMessage.value = t('No syncable providers are configured yet')
    }

    if (result.failedProviders.length > 0 && result.syncedProviders.length > 0) {
      syncMessage.value = `${syncMessage.value} · ${t('Some providers failed to sync')}`
    }
  } catch (e) {
    syncError.value = true
    syncMessage.value = t('Failed to sync models: {error}', {
      error: e?.message || String(e),
    })
  } finally {
    syncingModels.value = false
  }
}
</script>

<style scoped>
/* Monthly limit */
.usage-limit-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.usage-limit-dollar {
  font-size: var(--ui-font-title);
  font-weight: 500;
  color: var(--fg-muted);
}

.usage-limit-input {
  width: 120px;
  flex: none;
}

/* Budget progress bar */
.budget-progress-track {
  height: 4px;
  border-radius: 2px;
  background: var(--border);
  overflow: hidden;
}

.budget-progress-fill {
  height: 100%;
  border-radius: 2px;
  transition:
    width 0.3s ease,
    background 0.3s ease;
}

.budget-progress-label {
  margin-top: 4px;
  font-size: var(--ui-font-caption);
  font-variant-numeric: tabular-nums;
}

.advanced-toggle {
  margin-top: 12px;
  font-size: var(--ui-font-label);
}

.advanced-section {
  margin-top: 8px;
}

.models-option-input,
.models-option-select {
  font-size: var(--ui-font-caption);
}

.models-option-input,
.models-option-select {
  min-height: 30px;
}

.provider-group {
  margin-top: 10px;
}

.provider-group-label {
  margin-bottom: 6px;
  font-size: var(--ui-font-micro);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 6px;
}

.provider-card {
  justify-content: space-between;
  min-height: 0;
}

.provider-card-name {
  font-size: var(--ui-font-label);
  font-weight: var(--font-weight-semibold);
}

.provider-card-status {
  margin-top: 0;
}

.provider-detail-card {
  margin-top: 10px;
  padding: 10px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--surface-raised) 82%, transparent);
}

.provider-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.provider-detail-title {
  font-size: var(--ui-font-body);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.key-secondary-btn {
  margin-left: 8px;
}

.key-error-hint {
  color: var(--error);
}

.models-key-row {
  margin-top: 0;
}

.provider-detail-card .keys-actions {
  margin-top: 10px;
}

.provider-options-section {
  margin-top: 12px;
}

.provider-options-grid {
  display: grid;
  gap: 10px;
}

.provider-option-label {
  font-size: var(--ui-font-caption);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.provider-option-hint {
  margin: 4px 0 0;
}

.provider-option-field {
  gap: 4px;
}

.provider-option-field-label {
  font-size: var(--ui-font-caption);
  color: var(--text-primary);
}

.provider-option-field-hint {
  font-size: var(--ui-font-micro);
  line-height: 1.45;
  color: var(--text-muted);
}

.provider-inline-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--surface-raised) 85%, transparent);
}

.provider-inline-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.provider-inline-switch {
  flex-shrink: 0;
}

.models-budget-title {
  margin-top: 24px;
}

.models-budget-progress {
  margin-top: 10px;
}

.models-budget-over {
  color: var(--error);
}

.models-page-compact .settings-section-title {
  margin-bottom: 12px;
}

.models-page-compact .settings-hint {
  margin: 6px 0 0;
}

.models-page-compact .key-field {
  gap: 0;
}

.models-page-compact .models-option-input,
.models-page-compact .models-option-select {
  min-height: 28px;
}
</style>
