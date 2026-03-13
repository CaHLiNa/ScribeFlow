<template>
  <div>
    <h3 class="settings-section-title">{{ t('PDF Translation') }}</h3>
    <p class="settings-hint">{{ t('Run PDF translation directly from the PDF toolbar using global defaults and your existing model credentials.') }}</p>

    <div class="pdft-card">
      <div class="pdft-grid">
        <label class="pdft-field">
          <span class="pdft-label">{{ t('Provider') }}</span>
          <div class="pdft-select-shell">
            <select v-model="selectedProviderId" class="pdft-select" :disabled="compatibleModelGroups.length === 0">
              <option v-if="compatibleModelGroups.length === 0" value="">{{ t('No compatible models available') }}</option>
              <option v-for="group in compatibleModelGroups" :key="group.provider" :value="group.provider">
                {{ group.label }}
              </option>
            </select>
            <span class="pdft-caret" aria-hidden="true">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M1 3l4 4 4-4z" />
              </svg>
            </span>
          </div>
        </label>

        <label class="pdft-field">
          <span class="pdft-label">{{ t('Model') }}</span>
          <div class="pdft-select-shell">
            <select v-model="draft.modelId" class="pdft-select" :disabled="selectedProviderModels.length === 0">
              <option v-if="selectedProviderModels.length === 0" value="">{{ t('No compatible models available') }}</option>
              <option v-for="model in selectedProviderModels" :key="model.id" :value="model.id">
                {{ model.name }}
              </option>
            </select>
            <span class="pdft-caret" aria-hidden="true">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M1 3l4 4 4-4z" />
              </svg>
            </span>
          </div>
        </label>

        <label class="pdft-field">
          <span class="pdft-label">{{ t('Source language') }}</span>
          <div class="pdft-select-shell">
            <select v-model="draft.langIn" class="pdft-select">
              <option v-for="option in sourceLanguages" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
            <span class="pdft-caret" aria-hidden="true">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M1 3l4 4 4-4z" />
              </svg>
            </span>
          </div>
        </label>

        <label class="pdft-field">
          <span class="pdft-label">{{ t('Target language') }}</span>
          <div class="pdft-select-shell">
            <select v-model="draft.langOut" class="pdft-select">
              <option v-for="option in targetLanguages" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
            <span class="pdft-caret" aria-hidden="true">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M1 3l4 4 4-4z" />
              </svg>
            </span>
          </div>
        </label>

        <label class="pdft-field">
          <span class="pdft-label">{{ t('Output mode') }}</span>
          <div class="pdft-select-shell">
            <select v-model="draft.mode" class="pdft-select">
              <option value="mono">{{ t('Translated only') }}</option>
              <option value="dual">{{ t('Bilingual PDF') }}</option>
              <option value="both">{{ t('Create both') }}</option>
            </select>
            <span class="pdft-caret" aria-hidden="true">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M1 3l4 4 4-4z" />
              </svg>
            </span>
          </div>
        </label>

        <label class="pdft-field">
          <span class="pdft-label">{{ t('QPS') }}</span>
          <input v-model.number="draft.qps" type="number" min="1" max="32" class="pdft-input" />
        </label>

        <label class="pdft-field">
          <span class="pdft-label">{{ t('Worker pool') }}</span>
          <input v-model.number="draft.poolMaxWorkers" type="number" min="0" max="1000" class="pdft-input" />
          <span class="pdft-field-hint">{{ t('0 uses auto-mapping or upstream default') }}</span>
        </label>
      </div>

      <div class="advanced-toggle" @click="showAdvanced = !showAdvanced">
        <svg :class="{ rotated: showAdvanced }" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <path d="M3 1l4 4-4 4z"/>
        </svg>
        {{ t('Advanced') }}
      </div>

      <div v-if="showAdvanced" class="pdft-advanced">
        <label class="pdft-toggle">
          <input v-model="draft.autoMapPoolMaxWorkers" type="checkbox" />
          <span>{{ t('Auto-map worker pool from QPS') }}</span>
        </label>
        <p class="pdft-inline-hint">
          {{ t('When enabled, the runtime uses qps * 10 (capped at 1000) unless you set a worker pool explicitly.') }}
        </p>
        <label class="pdft-toggle">
          <input v-model="draft.translateTableText" type="checkbox" />
          <span>{{ t('Translate table text') }}</span>
        </label>
        <label class="pdft-toggle">
          <input :checked="draft.ocrWorkaround" type="checkbox" @change="toggleOcr($event.target.checked)" />
          <span>{{ t('Enable OCR workaround') }}</span>
        </label>
        <label class="pdft-toggle">
          <input :checked="draft.autoEnableOcrWorkaround" type="checkbox" @change="toggleAutoOcr($event.target.checked)" />
          <span>{{ t('Auto-enable OCR workaround') }}</span>
        </label>
        <label class="pdft-toggle">
          <input v-model="draft.noWatermarkMode" type="checkbox" />
          <span>{{ t('Prefer no-watermark outputs when available') }}</span>
        </label>
      </div>

      <div class="keys-actions">
        <button class="key-save-btn" :class="{ saved }" @click="saveSettings">
          {{ saved ? t('Saved') : t('Save Settings') }}
        </button>
      </div>

      <p v-if="compatibleModels.length === 0" class="pdft-warning">
        {{ t('PDF translation currently supports Google and OpenAI-compatible models. Configure one in Settings > Models first.') }}
      </p>
    </div>

    <h3 class="settings-section-title pdft-runtime-title">{{ t('Runtime') }}</h3>
    <p class="settings-hint">{{ t('The translator reuses the Python interpreter selected in System settings, but keeps its dependencies in a separate global venv.') }}</p>

    <div class="pdft-card">
      <div class="pdft-runtime-row">
        <div>
          <div class="pdft-runtime-label">{{ t('Status') }}</div>
          <div class="pdft-runtime-value" :class="runtimeClass">{{ pdfTranslateStore.runtimeLabel }}</div>
        </div>
        <button class="key-save-btn" :disabled="pdfTranslateStore.runtimeRefreshing" @click="refreshRuntimeStatus(true)">
          {{ pdfTranslateStore.runtimeRefreshing ? t('Checking...') : t('Refresh') }}
        </button>
      </div>

      <div class="pdft-runtime-block">
        <div class="pdft-runtime-label">{{ t('Python interpreter') }}</div>
        <div class="pdft-runtime-path">{{ selectedPythonPath }}</div>
      </div>

      <div class="pdft-runtime-actions">
        <button
          class="key-save-btn"
          :disabled="runtimeBusy"
          @click="prepareRuntime"
        >
          {{ pdfTranslateStore.setupInProgress ? t('Preparing...') : t('Prepare Runtime') }}
        </button>
        <button
          class="key-save-btn"
          :disabled="runtimeBusy || pdfTranslateStore.runtimeStatus?.status !== 'Ready'"
          @click="warmupRuntime"
        >
          {{ pdfTranslateStore.warmupInProgress ? t('Warming up...') : t('Warm Up Runtime') }}
        </button>
        <span v-if="runtimeBusy" class="pdft-progress-text">
          {{ runtimeProgressLabel }}
          <span v-if="pdfTranslateStore.setupProgress > 0"> · {{ pdfTranslateStore.setupProgress }}%</span>
        </span>
      </div>

      <p class="pdft-inline-hint">
        {{ t('Warmup downloads translator assets so the first translation starts faster.') }}
      </p>

      <div v-if="runtimeBusy" class="pdft-progress-track">
        <div class="pdft-progress-fill" :style="{ width: `${pdfTranslateStore.setupProgress}%` }"></div>
      </div>

      <div v-if="runtimeError" class="pdft-warning">
        {{ runtimeError }}
      </div>

      <div v-if="pdfTranslateStore.setupLogs.length > 0" class="pdft-log-shell">
        <div class="pdft-log-title">{{ t('Runtime log') }}</div>
        <pre class="pdft-log">{{ pdfTranslateStore.setupLogs.join('\n') }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { usePdfTranslateStore } from '../../stores/pdfTranslate'
import { useEnvironmentStore } from '../../stores/environment'
import { useI18n } from '../../i18n'
import { findModelById, getFirstModelForProvider, groupModelsByProvider } from '../../services/modelCatalog'

const { t } = useI18n()
const pdfTranslateStore = usePdfTranslateStore()
const envStore = useEnvironmentStore()
const showAdvanced = ref(false)
const saved = ref(false)
const selectedProviderId = ref('')

const draft = reactive({
  modelId: '',
  langIn: 'en',
  langOut: 'zh',
  mode: 'dual',
  qps: 8,
  poolMaxWorkers: 0,
  autoMapPoolMaxWorkers: true,
  ocrWorkaround: false,
  autoEnableOcrWorkaround: false,
  noWatermarkMode: false,
  translateTableText: true,
})

const sourceLanguages = computed(() => ([
  { value: 'auto', label: t('Auto detect (auto)') },
  { value: 'zh', label: t('Chinese (zh)') },
  { value: 'zh-TW', label: t('Traditional Chinese (zh-TW)') },
  { value: 'en', label: t('English (en)') },
  { value: 'ja', label: t('Japanese (ja)') },
  { value: 'ko', label: t('Korean (ko)') },
  { value: 'fr', label: t('French (fr)') },
  { value: 'de', label: t('German (de)') },
  { value: 'es', label: t('Spanish (es)') },
  { value: 'it', label: t('Italian (it)') },
  { value: 'ru', label: t('Russian (ru)') },
  { value: 'pt', label: t('Portuguese (pt)') },
]))

const targetLanguages = computed(() => sourceLanguages.value.filter(item => item.value !== 'auto'))
const compatibleModels = computed(() => pdfTranslateStore.compatibleModels)
const compatibleModelGroups = computed(() => groupModelsByProvider(compatibleModels.value))
const selectedProviderGroup = computed(() => (
  compatibleModelGroups.value.find(group => group.provider === selectedProviderId.value)
  || compatibleModelGroups.value[0]
  || null
))
const selectedProviderModels = computed(() => selectedProviderGroup.value?.models || [])

const selectedPythonPath = computed(() => (
  envStore.selectedInterpreterPath('python') || t('No Python selected in System settings')
))

const runtimeClass = computed(() => {
  const status = pdfTranslateStore.runtimeStatus?.status
  if (status === 'Ready') return 'good'
  if (status === 'Error' || status === 'PythonMissing') return 'bad'
  return 'warn'
})

const runtimeError = computed(() => (
  pdfTranslateStore.runtimeStatus?.status === 'Error' ? pdfTranslateStore.runtimeStatus.data : ''
))
const runtimeBusy = computed(() => pdfTranslateStore.setupInProgress || pdfTranslateStore.warmupInProgress)
const runtimeProgressLabel = computed(() => (
  pdfTranslateStore.setupMessage
  || (pdfTranslateStore.warmupInProgress ? t('Warming up translation runtime') : t('Preparing translation runtime'))
))

function syncDraft() {
  Object.assign(draft, pdfTranslateStore.settings)
}

function preferredProviderId() {
  return findModelById(compatibleModels.value, draft.modelId)?.provider
    || compatibleModelGroups.value[0]?.provider
    || ''
}

function ensureProviderSelection(preferCurrent = false) {
  if (compatibleModelGroups.value.length === 0) {
    selectedProviderId.value = ''
    if (draft.modelId) draft.modelId = ''
    return
  }

  const hasSelected = compatibleModelGroups.value.some(group => group.provider === selectedProviderId.value)
  if (preferCurrent || !hasSelected) {
    selectedProviderId.value = preferredProviderId()
  }

  const currentModel = findModelById(compatibleModels.value, draft.modelId)
  if (!currentModel || currentModel.provider !== selectedProviderId.value) {
    draft.modelId = getFirstModelForProvider(compatibleModels.value, selectedProviderId.value)?.id || ''
  }
}

function markSaved() {
  saved.value = true
  setTimeout(() => {
    saved.value = false
  }, 2000)
}

function toggleOcr(checked) {
  draft.ocrWorkaround = checked
  if (checked) draft.autoEnableOcrWorkaround = false
}

function toggleAutoOcr(checked) {
  draft.autoEnableOcrWorkaround = checked
  if (checked) draft.ocrWorkaround = false
}

async function saveSettings() {
  await pdfTranslateStore.saveSettings({ ...draft })
  syncDraft()
  markSaved()
}

async function refreshRuntimeStatus(force = false) {
  await pdfTranslateStore.refreshRuntimeStatus({ force })
}

async function prepareRuntime() {
  await saveSettings()
  await pdfTranslateStore.setupRuntime()
}

async function warmupRuntime() {
  await pdfTranslateStore.warmupRuntime()
}

function scheduleAfterFirstPaint(task) {
  const run = () => {
    Promise.resolve(task()).catch(() => {})
  }

  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(() => {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 600 })
      } else {
        window.setTimeout(run, 80)
      }
    })
    return
  }

  run()
}

function warmPdfTranslatePanel() {
  scheduleAfterFirstPaint(async () => {
    if (!envStore.detected && !envStore.detecting) {
      await envStore.detect()
    }
    await pdfTranslateStore.refreshRuntimeStatus({ force: true })
  })
}

watch(() => pdfTranslateStore.settings, syncDraft, { deep: true })
watch(() => draft.modelId, () => {
  ensureProviderSelection(true)
})
watch(selectedProviderId, (providerId, previousProviderId) => {
  if (!providerId || providerId === previousProviderId) return
  const currentModel = findModelById(compatibleModels.value, draft.modelId)
  if (currentModel?.provider === providerId) return
  draft.modelId = getFirstModelForProvider(compatibleModels.value, providerId)?.id || ''
})
watch(compatibleModelGroups, () => {
  ensureProviderSelection()
}, { immediate: true, deep: true })

onMounted(async () => {
  await pdfTranslateStore.loadSettings()
  syncDraft()
  warmPdfTranslatePanel()
})
</script>

<style scoped>
.pdft-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-primary);
  padding: 14px;
}

.pdft-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.pdft-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pdft-field-hint,
.pdft-inline-hint {
  font-size: 11px;
  color: var(--fg-muted);
}

.pdft-label {
  font-size: 11px;
  color: var(--fg-secondary);
}

.pdft-select-shell {
  position: relative;
}

.pdft-select,
.pdft-input {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  min-width: 0;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--fg-primary);
  font-size: 12px;
  padding: 8px 32px 8px 10px;
}

.pdft-input {
  padding-right: 10px;
}

.pdft-select:focus,
.pdft-input:focus {
  outline: none;
  border-color: var(--accent);
}

.pdft-caret {
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  color: var(--fg-muted);
  pointer-events: none;
}

.pdft-advanced {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.pdft-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--fg-secondary);
}

.pdft-runtime-title {
  margin-top: 24px;
}

.pdft-runtime-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pdft-runtime-block {
  margin-top: 12px;
}

.pdft-runtime-label {
  font-size: 11px;
  color: var(--fg-secondary);
  margin-bottom: 4px;
}

.pdft-runtime-value {
  font-size: 12px;
  font-weight: 600;
}

.pdft-runtime-value.good {
  color: var(--success, #4ade80);
}

.pdft-runtime-value.warn {
  color: var(--warning, #e0af68);
}

.pdft-runtime-value.bad {
  color: var(--error);
}

.pdft-runtime-path {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg-muted);
  word-break: break-all;
}

.pdft-runtime-actions {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.pdft-progress-text {
  font-size: 11px;
  color: var(--fg-muted);
}

.pdft-progress-track {
  margin-top: 12px;
  height: 5px;
  border-radius: 999px;
  background: var(--bg-tertiary);
  overflow: hidden;
}

.pdft-progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s ease;
}

.pdft-warning {
  margin-top: 12px;
  font-size: 11px;
  color: var(--warning, #e0af68);
}

.pdft-log-shell {
  margin-top: 12px;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.pdft-log-title {
  font-size: 11px;
  color: var(--fg-secondary);
  margin-bottom: 6px;
}

.pdft-log {
  margin: 0;
  max-height: 180px;
  overflow: auto;
  border-radius: 8px;
  background: var(--bg-secondary);
  padding: 10px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--fg-muted);
  font-family: var(--font-mono);
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 720px) {
  .pdft-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
