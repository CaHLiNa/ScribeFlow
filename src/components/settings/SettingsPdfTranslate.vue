<template>
  <div class="pdft-shell pdft-shell-compact">
    <div>
      <h3 class="settings-section-title">{{ t('PDF Translation') }}</h3>
    </div>

    <div class="pdft-stack">
      <div class="env-lang-card">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="compatibleModels.length > 0 ? 'good' : 'none'"></span>
          <span class="env-lang-name">{{ t('Translation defaults') }}</span>
          <span class="env-lang-version">{{ modelSummary }}</span>
        </div>

        <div class="pdft-form-grid pdft-section-pad">
          <label class="pdft-field pdft-field-span-2">
            <span class="pdft-label">{{ t('Model') }}</span>
            <div class="pdft-select-shell">
              <select v-model="draft.modelId" class="pdft-select" :disabled="compatibleModels.length === 0">
                <option v-if="compatibleModels.length === 0" value="">{{ t('No compatible models available') }}</option>
                <optgroup v-for="group in compatibleModelGroups" :key="group.provider" :label="group.label">
                  <option v-for="model in group.models" :key="model.id" :value="model.id">
                    {{ model.name }}
                  </option>
                </optgroup>
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
                <option v-for="option in outputModes" :key="option.value" :value="option.value">
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
            <span class="pdft-label">{{ t('Bilingual layout') }}</span>
            <div class="pdft-select-shell">
              <select v-model="draft.dualLayout" class="pdft-select" :disabled="draft.mode === 'mono'">
                <option v-for="option in dualLayouts" :key="option.value" :value="option.value">
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

          <label class="pdft-field pdft-field-span-2">
            <span class="pdft-label">{{ t('Primary font family') }}</span>
            <div class="pdft-select-shell">
              <select v-model="draft.fontFamily" class="pdft-select">
                <option v-for="option in fontFamilies" :key="option.value" :value="option.value">
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
        </div>

        <p v-if="compatibleModels.length === 0" class="pdft-inline-warning pdft-section-pad">
          {{ t('PDF translation supports any configured provider with a PDF translation engine. Configure one in Settings > Models first.') }}
        </p>
      </div>

      <div class="env-lang-card">
        <div class="env-lang-header">
          <span class="env-lang-dot" :class="draft.enhanceCompatibility ? 'warn' : 'good'"></span>
          <span class="env-lang-name">{{ t('Processing options') }}</span>
          <span class="env-lang-version">{{ processingSummary }}</span>
        </div>

        <div class="pdft-form-grid pdft-section-pad">
          <label class="pdft-field">
            <span class="pdft-label">{{ t('QPS') }}</span>
            <input v-model.number="draft.qps" type="number" min="1" max="32" class="pdft-input" />
          </label>

          <label class="pdft-field">
            <span class="pdft-label">{{ t('Worker pool') }}</span>
            <input v-model.number="draft.poolMaxWorkers" type="number" min="0" max="1000" class="pdft-input" />
            <span class="pdft-field-hint">{{ t('0 uses auto-mapping or upstream default') }}</span>
          </label>

          <label class="pdft-field pdft-field-span-2">
            <span class="pdft-label">{{ t('OCR fallback') }}</span>
            <div class="pdft-select-shell">
              <select v-model="ocrModeValue" class="pdft-select">
                <option v-for="option in ocrModes" :key="option.value" :value="option.value">
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
        </div>

        <div class="pdft-toggle-grid pdft-section-pad">
          <div v-for="field in topLevelToggleFields" :key="field.key" class="pdft-toggle-row">
            <div class="pdft-inline-copy">
              <div class="pdft-inline-label">{{ t(field.labelKey) }}</div>
              <div v-if="field.hintKey" class="pdft-field-hint">{{ t(field.hintKey) }}</div>
            </div>
            <button class="tool-toggle-switch" :class="{ on: draft[field.key] }" @click="draft[field.key] = !draft[field.key]">
              <span class="tool-toggle-knob"></span>
            </button>
          </div>
        </div>
      </div>

      <div class="env-lang-card">
        <div class="pdft-card-head">
          <div class="env-lang-header pdft-card-header-row">
            <span class="env-lang-dot" :class="advancedSettingsCustomized ? 'warn' : 'none'"></span>
            <span class="env-lang-name">{{ t('Advanced translation & layout') }}</span>
            <span class="pdft-summary-badge">{{ advancedSummaryLabel }}</span>
          </div>
          <button class="pdft-toolbar-btn" @click="showAdvancedTuning = !showAdvancedTuning">
            {{ showAdvancedTuning ? t('Hide') : t('Advanced') }}
          </button>
        </div>

        <div v-if="showAdvancedTuning" class="pdft-advanced-stack pdft-section-pad">
          <div class="pdft-advanced-group">
            <div class="pdft-inline-label">{{ t('Translation quality') }}</div>

            <div class="pdft-form-grid">
              <label v-for="field in qualityNumberFields" :key="field.key" class="pdft-field">
                <span class="pdft-label">{{ t(field.labelKey) }}</span>
                <input
                  v-model.number="draft[field.key]"
                  type="number"
                  class="pdft-input"
                  :min="field.min"
                  :max="field.max"
                  :step="field.step"
                />
                <span v-if="field.hintKey" class="pdft-field-hint">{{ t(field.hintKey) }}</span>
              </label>
            </div>

            <div class="pdft-toggle-grid">
              <div v-for="field in qualityToggleFields" :key="field.key" class="pdft-toggle-row">
                <div class="pdft-inline-copy">
                  <div class="pdft-inline-label">{{ t(field.labelKey) }}</div>
                  <div v-if="field.hintKey" class="pdft-field-hint">{{ t(field.hintKey) }}</div>
                </div>
                <button class="tool-toggle-switch" :class="{ on: draft[field.key] }" @click="draft[field.key] = !draft[field.key]">
                  <span class="tool-toggle-knob"></span>
                </button>
              </div>
            </div>

            <label v-for="field in qualityTextFields" :key="field.key" class="pdft-field pdft-field-span-2">
              <span class="pdft-label">{{ t(field.labelKey) }}</span>
              <textarea
                v-model="draft[field.key]"
                class="pdft-textarea"
                :rows="field.rows"
                :placeholder="t(field.placeholderKey)"
                spellcheck="false"
              ></textarea>
              <span v-if="field.hintKey" class="pdft-field-hint">{{ t(field.hintKey) }}</span>
            </label>
          </div>

          <div class="pdft-advanced-group">
            <div class="pdft-inline-label">{{ t('Layout & segmentation') }}</div>

            <div class="pdft-form-grid">
              <label v-for="field in layoutTextFields" :key="field.key" class="pdft-field pdft-field-span-2">
                <span class="pdft-label">{{ t(field.labelKey) }}</span>
                <input
                  v-model="draft[field.key]"
                  type="text"
                  class="pdft-input"
                  :placeholder="t(field.placeholderKey)"
                  spellcheck="false"
                />
                <span v-if="field.hintKey" class="pdft-field-hint">{{ t(field.hintKey) }}</span>
              </label>

              <label v-for="field in layoutNumberFields" :key="field.key" class="pdft-field">
                <span class="pdft-label">{{ t(field.labelKey) }}</span>
                <input
                  v-model.number="draft[field.key]"
                  type="number"
                  class="pdft-input"
                  :min="field.min"
                  :max="field.max"
                  :step="field.step"
                />
                <span v-if="field.hintKey" class="pdft-field-hint">{{ t(field.hintKey) }}</span>
              </label>
            </div>

            <div class="pdft-toggle-grid">
              <div v-for="field in layoutToggleFields" :key="field.key" class="pdft-toggle-row">
                <div class="pdft-inline-copy">
                  <div class="pdft-inline-label">{{ t(field.labelKey) }}</div>
                  <div v-if="field.hintKey" class="pdft-field-hint">{{ t(field.hintKey) }}</div>
                </div>
                <button class="tool-toggle-switch" :class="{ on: draft[field.key] }" @click="draft[field.key] = !draft[field.key]">
                  <span class="tool-toggle-knob"></span>
                </button>
              </div>
            </div>
          </div>

          <div class="pdft-advanced-group">
            <div class="pdft-inline-label">{{ t('Scanned / formula handling') }}</div>

            <div class="pdft-form-grid">
              <label v-for="field in formulaNumberFields" :key="field.key" class="pdft-field">
                <span class="pdft-label">{{ t(field.labelKey) }}</span>
                <input
                  v-model.number="draft[field.key]"
                  type="number"
                  class="pdft-input"
                  :min="field.min"
                  :max="field.max"
                  :step="field.step"
                />
                <span v-if="field.hintKey" class="pdft-field-hint">{{ t(field.hintKey) }}</span>
              </label>

              <label v-for="field in formulaTextFields" :key="field.key" class="pdft-field">
                <span class="pdft-label">{{ t(field.labelKey) }}</span>
                <input
                  v-model="draft[field.key]"
                  type="text"
                  class="pdft-input"
                  :placeholder="t(field.placeholderKey)"
                  spellcheck="false"
                />
                <span v-if="field.hintKey" class="pdft-field-hint">{{ t(field.hintKey) }}</span>
              </label>
            </div>

            <div class="pdft-toggle-grid">
              <div v-for="field in formulaToggleFields" :key="field.key" class="pdft-toggle-row">
                <div class="pdft-inline-copy">
                  <div class="pdft-inline-label">{{ t(field.labelKey) }}</div>
                  <div v-if="field.hintKey" class="pdft-field-hint">{{ t(field.hintKey) }}</div>
                </div>
                <button class="tool-toggle-switch" :class="{ on: draft[field.key] }" @click="draft[field.key] = !draft[field.key]">
                  <span class="tool-toggle-knob"></span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="env-lang-card">
        <div class="pdft-card-head">
          <div class="env-lang-header pdft-card-header-row pdft-card-header-main">
            <span class="env-lang-dot" :class="runtimeDotClass"></span>
            <span class="env-lang-name">{{ t('Runtime') }}</span>
            <span class="pdft-summary-badge" :class="[`tone-${runtimeDotClass}`]">{{ pdfTranslateStore.runtimeLabel }}</span>
          </div>
          <button
            class="pdft-toolbar-btn"
            :disabled="pdfTranslateStore.runtimeRefreshing"
            @click="refreshRuntimeStatus(true)"
          >
            {{ pdfTranslateStore.runtimeRefreshing ? t('Checking...') : t('Refresh') }}
          </button>
        </div>

        <div class="pdft-runtime-actions pdft-section-pad">
          <button
            class="key-save-btn pdft-action-btn pdft-action-btn--primary"
            :disabled="runtimeBusy"
            @click="prepareRuntime"
          >
            {{ pdfTranslateStore.setupInProgress ? t('Preparing...') : t('Prepare Runtime') }}
          </button>
          <button
            class="pdft-action-btn pdft-action-btn--secondary"
            :disabled="runtimeBusy || !runtimeReady"
            @click="warmupRuntime"
          >
            {{ pdfTranslateStore.warmupInProgress ? t('Warming up...') : t('Warm Up Runtime') }}
          </button>
        </div>

        <div v-if="runtimeBusy" class="pdft-progress-meta pdft-section-pad">
          {{ runtimeProgressLabel }}
          <span v-if="pdfTranslateStore.setupProgress > 0">· {{ pdfTranslateStore.setupProgress }}%</span>
        </div>

        <div v-if="runtimeBusy" class="pdft-progress-track">
          <div class="pdft-progress-fill" :style="{ width: `${pdfTranslateStore.setupProgress}%` }"></div>
        </div>

        <div v-if="runtimeError" class="pdft-runtime-error pdft-section-pad">
          {{ runtimeError }}
        </div>

        <div v-if="pdfTranslateStore.setupLogs.length > 0" class="pdft-log-shell pdft-section-pad">
          <div class="pdft-inline-label">{{ t('Runtime log') }}</div>
          <pre class="pdft-log">{{ pdfTranslateStore.setupLogs.join('\n') }}</pre>
        </div>
      </div>
    </div>

    <div class="keys-actions pdft-save-row">
      <span v-if="saved" class="pdft-save-hint">{{ t('Saved') }}</span>
      <button
        class="key-save-btn pdft-action-btn pdft-action-btn--save"
        :class="{ saved }"
        :disabled="pdfTranslateStore.saving || !isDirty"
        @click="saveSettings"
      >
        {{ pdfTranslateStore.saving ? t('Saving...') : saved ? t('Saved') : t('Save Settings') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { usePdfTranslateStore } from '../../stores/pdfTranslate'
import { useEnvironmentStore } from '../../stores/environment'
import { useI18n } from '../../i18n'
import { findModelById, groupModelsByProvider, providerLabel } from '../../services/modelCatalog'
import { createDefaultPdfTranslateSettings } from '../../domains/document/pdfTranslateRuntime'

const { t } = useI18n()
const pdfTranslateStore = usePdfTranslateStore()
const envStore = useEnvironmentStore()
const saved = ref(false)
const showAdvancedTuning = ref(false)

const draft = reactive(createDefaultPdfTranslateSettings())

const topLevelToggleFields = [
  {
    key: 'enhanceCompatibility',
    labelKey: 'Enhance compatibility',
  },
  {
    key: 'autoEnhanceFormulaDensePages',
    labelKey: 'Auto-enhance formula-dense pages',
    hintKey: 'If a formula-heavy page looks fragmented after the first pass, Altals retries with safer layout protection automatically.',
  },
  {
    key: 'translateTableText',
    labelKey: 'Translate table text',
    hintKey: 'Translate detected table content when supported.',
  },
  {
    key: 'autoMapPoolMaxWorkers',
    labelKey: 'Auto-map worker pool from QPS',
    hintKey: 'When enabled, the runtime uses qps * 10 (capped at 1000) unless you set a worker pool explicitly.',
  },
]

const qualityNumberFields = [
  {
    key: 'minTextLength',
    labelKey: 'Minimum text length',
    min: 0,
    max: 500,
    step: 1,
    hintKey: 'Short text blocks below this length are skipped.',
  },
  {
    key: 'termQps',
    labelKey: 'Glossary extraction QPS',
    min: 0,
    max: 1000,
    step: 1,
    hintKey: '0 keeps pdf2zh_next default glossary throughput.',
  },
  {
    key: 'termPoolMaxWorkers',
    labelKey: 'Glossary worker pool',
    min: 0,
    max: 1000,
    step: 1,
    hintKey: '0 keeps pdf2zh_next default glossary worker count.',
  },
]

const qualityTextFields = [
  {
    key: 'customSystemPrompt',
    labelKey: 'Custom system prompt',
    rows: 4,
    placeholderKey: 'Optional prompt override for PDF translation',
    hintKey: 'Applied on top of the provider model during PDF translation only.',
  },
  {
    key: 'glossaries',
    labelKey: 'Glossary text',
    rows: 4,
    placeholderKey: 'Optional glossary text passed to pdf2zh_next',
    hintKey: 'Use one term mapping per line or the upstream raw glossary format.',
  },
]

const qualityToggleFields = [
  {
    key: 'ignoreCache',
    labelKey: 'Ignore translation cache',
    hintKey: 'Force a fresh translation even if cached results exist.',
  },
  {
    key: 'saveAutoExtractedGlossary',
    labelKey: 'Save automatically extracted glossary (CSV)',
    hintKey: 'When enabled, Altals keeps a glossary CSV beside the translated PDF.',
  },
]

const layoutNumberFields = [
  {
    key: 'maxPagesPerPart',
    labelKey: 'Max pages per part',
    min: 0,
    max: 1000,
    step: 1,
    hintKey: '0 keeps pdf2zh_next automatic splitting.',
  },
  {
    key: 'shortLineSplitFactor',
    labelKey: 'Short-line split factor',
    min: 0,
    max: 1,
    step: 0.05,
    hintKey: 'Used when short-line splitting is enabled.',
  },
]

const layoutTextFields = [
  {
    key: 'pages',
    labelKey: 'Page ranges',
    placeholderKey: 'Example: 1-3,5,8-10',
    hintKey: 'Leave empty to translate the whole PDF.',
  },
]

const layoutToggleFields = [
  {
    key: 'splitShortLines',
    labelKey: 'Split short lines',
    hintKey: 'Helps bilingual layout on narrow columns and dense academic PDFs.',
  },
  {
    key: 'skipClean',
    labelKey: 'Skip PDF cleanup',
    hintKey: 'Useful when cleanup damages the original page structure.',
  },
  {
    key: 'dualTranslateFirst',
    labelKey: 'Translate bilingual output first',
    hintKey: 'Prioritize dual output generation when both mono and dual PDFs are requested.',
  },
  {
    key: 'disableRichTextTranslate',
    labelKey: 'Disable rich-text translation',
    hintKey: 'Fallback for PDFs whose styled text extraction breaks layout.',
  },
  {
    key: 'onlyIncludeTranslatedPage',
    labelKey: 'Only include translated pages',
    hintKey: 'Omit untouched pages from the generated output when page ranges are used.',
  },
  {
    key: 'noWatermarkMode',
    labelKey: 'Prefer no-watermark outputs when available',
    hintKey: 'Prefer cleaner PDF outputs when the translation runtime can produce them.',
  },
]

const formulaNumberFields = [
  {
    key: 'nonFormulaLineIouThreshold',
    labelKey: 'Non-formula line IoU threshold',
    min: 0,
    max: 1,
    step: 0.05,
    hintKey: 'Higher values protect more surrounding text from formula handling.',
  },
  {
    key: 'figureTableProtectionThreshold',
    labelKey: 'Figure/table protection threshold',
    min: 0,
    max: 1,
    step: 0.05,
    hintKey: 'Higher values protect figures and tables more aggressively.',
  },
]

const formulaTextFields = [
  {
    key: 'formularFontPattern',
    labelKey: 'Formula font pattern',
    placeholderKey: 'Optional regex-like hint for formula fonts',
    hintKey: 'Advanced override for PDFs with unusual embedded math fonts.',
  },
  {
    key: 'formularCharPattern',
    labelKey: 'Formula character pattern',
    placeholderKey: 'Optional regex-like hint for formula characters',
    hintKey: 'Advanced override for PDFs with unusual formula character sets.',
  },
]

const formulaToggleFields = [
  {
    key: 'skipScannedDetection',
    labelKey: 'Skip scanned-PDF detection',
    hintKey: 'Useful when vector PDFs are misdetected as scanned pages.',
  },
  {
    key: 'noMergeAlternatingLineNumbers',
    labelKey: 'Do not merge alternating line numbers',
    hintKey: 'Helps papers whose line numbers interfere with bilingual page merging.',
  },
  {
    key: 'noRemoveNonFormulaLines',
    labelKey: 'Do not remove non-formula lines',
    hintKey: 'Protect more non-formula lines around equations and inline math.',
  },
  {
    key: 'skipFormulaOffsetCalculation',
    labelKey: 'Skip formula offset calculation',
    hintKey: 'Fallback for PDFs whose formula offset estimation breaks placement.',
  },
]

const advancedSettingKeys = [
  ...qualityNumberFields.map(field => field.key),
  ...qualityTextFields.map(field => field.key),
  ...qualityToggleFields.map(field => field.key),
  ...layoutNumberFields.map(field => field.key),
  ...layoutTextFields.map(field => field.key),
  ...layoutToggleFields.map(field => field.key),
  ...formulaNumberFields.map(field => field.key),
  ...formulaTextFields.map(field => field.key),
  ...formulaToggleFields.map(field => field.key),
]

const defaultPdfTranslateSettings = createDefaultPdfTranslateSettings()

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
const outputModes = computed(() => ([
  { value: 'mono', label: t('Translated only') },
  { value: 'dual', label: t('Bilingual PDF') },
  { value: 'both', label: t('Create both') },
]))
const dualLayouts = computed(() => ([
  { value: 'side-by-side', label: t('Left & Right') },
  { value: 'alternating-pages', label: t('Alternating pages') },
]))
const fontFamilies = computed(() => ([
  { value: 'auto', label: t('Auto') },
  { value: 'serif', label: t('Serif') },
  { value: 'sans-serif', label: t('Sans-serif') },
  { value: 'script', label: t('Script') },
]))
const ocrModes = computed(() => ([
  { value: 'off', label: t('Off') },
  { value: 'manual', label: t('Manual') },
  { value: 'auto', label: t('Automatic') },
]))

const compatibleModels = computed(() => pdfTranslateStore.compatibleModels)
const compatibleModelGroups = computed(() => groupModelsByProvider(compatibleModels.value))
const selectedModel = computed(() => findModelById(compatibleModels.value, draft.modelId))

const runtimeDotClass = computed(() => {
  const status = pdfTranslateStore.runtimeStatus?.status
  if (status === 'Ready') return 'good'
  if (status === 'Error' || status === 'PythonMissing') return 'bad'
  return 'warn'
})

const runtimeError = computed(() => (
  pdfTranslateStore.runtimeStatus?.status === 'Error' ? pdfTranslateStore.runtimeStatus.data : ''
))
const runtimeBusy = computed(() => pdfTranslateStore.setupInProgress || pdfTranslateStore.warmupInProgress)
const runtimeReady = computed(() => pdfTranslateStore.runtimeStatus?.status === 'Ready')
const runtimeProgressLabel = computed(() => (
  pdfTranslateStore.setupMessage
  || (pdfTranslateStore.warmupInProgress ? t('Warming up translation runtime') : t('Preparing translation runtime'))
))

function optionLabel(options, value, fallback = '') {
  return options.find(option => option.value === value)?.label || fallback
}

const modelSummary = computed(() => (
  selectedModel.value
    ? `${providerLabel(selectedModel.value.provider)} · ${selectedModel.value.name}`
    : t('Not configured')
))

const throughputSummary = computed(() => (
  draft.autoMapPoolMaxWorkers
    ? `${draft.qps} QPS · ${t('Auto')}`
    : `${draft.qps} QPS`
))

const ocrModeValue = computed({
  get() {
    if (draft.autoEnableOcrWorkaround) return 'auto'
    if (draft.ocrWorkaround) return 'manual'
    return 'off'
  },
  set(mode) {
    draft.ocrWorkaround = mode === 'manual'
    draft.autoEnableOcrWorkaround = mode === 'auto'
  },
})

const ocrModeLabel = computed(() => optionLabel(ocrModes.value, ocrModeValue.value, ocrModeValue.value))
const processingSummary = computed(() => `${ocrModeLabel.value} · ${throughputSummary.value}`)

const advancedSettingsCustomized = computed(() => (
  advancedSettingKeys.some((key) => JSON.stringify(draft[key]) !== JSON.stringify(defaultPdfTranslateSettings[key]))
))
const advancedSummaryLabel = computed(() => (
  advancedSettingsCustomized.value ? t('Customized') : t('Defaults')
))

function ensureModelSelection() {
  if (compatibleModels.value.length === 0) {
    draft.modelId = ''
    return
  }

  if (!selectedModel.value) {
    draft.modelId = compatibleModels.value.find(model => model.default)?.id || compatibleModels.value[0]?.id || ''
  }
}

function draftSnapshot() {
  return JSON.parse(JSON.stringify(draft))
}

const isDirty = computed(() => JSON.stringify(draftSnapshot()) !== JSON.stringify(pdfTranslateStore.settings))

function syncDraft() {
  Object.assign(draft, createDefaultPdfTranslateSettings(), pdfTranslateStore.settings)
}

function markSaved() {
  saved.value = true
  setTimeout(() => {
    saved.value = false
  }, 2000)
}

async function saveSettings() {
  await pdfTranslateStore.saveSettings({ ...draftSnapshot() })
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
  await saveSettings()
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
watch(compatibleModels, ensureModelSelection, { immediate: true, deep: true })
watch(() => draft.modelId, ensureModelSelection)

onMounted(async () => {
  await pdfTranslateStore.loadSettings()
  syncDraft()
  ensureModelSelection()
  warmPdfTranslatePanel()
})
</script>

<style scoped>
.pdft-shell {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pdft-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pdft-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.pdft-card-header-row {
  flex-wrap: wrap;
}

.pdft-card-header-main {
  flex: 1;
  min-width: 0;
}

.pdft-section-pad {
  padding-left: 14px;
}

.pdft-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.pdft-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.pdft-field-span-2 {
  grid-column: 1 / -1;
}

.pdft-label,
.pdft-inline-label {
  font-size: var(--ui-font-caption);
  color: var(--fg-secondary);
}

.pdft-field-hint {
  font-size: var(--ui-font-micro);
  line-height: 1.45;
  color: var(--fg-muted);
}

.pdft-progress-meta,
.pdft-save-hint {
  font-size: var(--ui-font-micro);
  line-height: 1.45;
  color: var(--fg-muted);
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
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--fg-primary);
  font-size: var(--ui-font-caption);
  line-height: 1.2;
  padding: 7px 30px 7px 9px;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.pdft-input {
  padding-right: 9px;
}

.pdft-textarea {
  width: 100%;
  min-width: 0;
  resize: vertical;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--fg-primary);
  font-size: var(--ui-font-caption);
  line-height: 1.5;
  padding: 8px 9px;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.pdft-select:hover,
.pdft-input:hover,
.pdft-textarea:hover {
  border-color: rgba(255, 255, 255, 0.14);
}

.pdft-select:focus,
.pdft-input:focus,
.pdft-textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.pdft-caret {
  position: absolute;
  top: 50%;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--fg-muted);
  pointer-events: none;
  transform: translateY(-50%);
}

.pdft-summary-badge {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  padding: 0 7px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: color-mix(in srgb, var(--bg-secondary) 88%, white 12%);
  color: var(--fg-secondary);
  font-size: var(--ui-font-micro);
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

.pdft-summary-badge.tone-good {
  color: var(--success, #4ade80);
  background: rgba(158, 206, 106, 0.12);
  border-color: rgba(158, 206, 106, 0.18);
}

.pdft-summary-badge.tone-warn {
  color: var(--warning, #e0af68);
  background: rgba(224, 175, 104, 0.12);
  border-color: rgba(224, 175, 104, 0.18);
}

.pdft-summary-badge.tone-bad {
  color: var(--error);
  background: rgba(247, 118, 142, 0.12);
  border-color: rgba(247, 118, 142, 0.18);
}

.pdft-toggle-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.pdft-toggle-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: color-mix(in srgb, var(--bg-secondary) 82%, transparent);
}

.pdft-inline-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pdft-advanced-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 10px;
}

.pdft-advanced-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-secondary) 80%, transparent);
}

.pdft-inline-warning {
  margin: 8px 0 0;
  font-size: var(--ui-font-micro);
  line-height: 1.45;
  color: var(--warning, #e0af68);
}

.pdft-runtime-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: 8px;
  max-width: 320px;
}

.pdft-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 26px;
  padding: 4px 9px;
  font-size: var(--ui-font-caption);
  white-space: nowrap;
}

.pdft-action-btn--primary {
  min-height: 28px;
  font-weight: 600;
}

.pdft-action-btn--secondary {
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.01)),
    var(--bg-primary);
  color: var(--fg-secondary);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s, box-shadow 0.15s;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.pdft-action-btn--secondary:hover {
  border-color: rgba(255, 255, 255, 0.2);
  color: var(--fg-primary);
  background: var(--bg-hover);
}

.pdft-action-btn--secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pdft-toolbar-btn {
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
  color: var(--fg-secondary);
  font-size: var(--ui-font-micro);
  cursor: pointer;
}

.pdft-toolbar-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.pdft-save-row {
  margin-top: 4px;
  justify-content: flex-end;
}

.pdft-action-btn--save {
  width: auto;
  min-width: 124px;
}

.pdft-progress-track {
  margin-top: 8px;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.pdft-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(122, 162, 247, 0.9), rgba(122, 162, 247, 0.55));
}

.pdft-runtime-error {
  margin-top: 8px;
  color: var(--error);
  font-size: var(--ui-font-micro);
  line-height: 1.45;
}

.pdft-log-shell {
  margin-top: 8px;
}

.pdft-log {
  margin: 6px 0 0;
  padding: 8px 10px;
  max-height: 180px;
  overflow: auto;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.18);
  color: var(--fg-secondary);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 700px) {
  .pdft-form-grid,
  .pdft-toggle-grid,
  .pdft-runtime-actions {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
