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
            <UiSelect
              v-model="draft.modelId"
              shell-class="pdft-select-shell"
              :disabled="compatibleModels.length === 0"
            >
              <option v-if="compatibleModels.length === 0" value="">
                {{ t('No compatible models available') }}
              </option>
              <optgroup
                v-for="group in compatibleModelGroups"
                :key="group.provider"
                :label="group.label"
              >
                <option v-for="model in group.models" :key="model.id" :value="model.id">
                  {{ model.name }}
                </option>
              </optgroup>
            </UiSelect>
          </label>

          <label class="pdft-field">
            <span class="pdft-label">{{ t('Source language') }}</span>
            <UiSelect v-model="draft.langIn" shell-class="pdft-select-shell">
              <option v-for="option in sourceLanguages" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </UiSelect>
          </label>

          <label class="pdft-field">
            <span class="pdft-label">{{ t('Target language') }}</span>
            <UiSelect v-model="draft.langOut" shell-class="pdft-select-shell">
              <option v-for="option in targetLanguages" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </UiSelect>
          </label>

          <label class="pdft-field">
            <span class="pdft-label">{{ t('Output mode') }}</span>
            <UiSelect v-model="draft.mode" shell-class="pdft-select-shell">
              <option v-for="option in outputModes" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </UiSelect>
          </label>

          <label class="pdft-field">
            <span class="pdft-label">{{ t('Bilingual layout') }}</span>
            <UiSelect
              v-model="draft.dualLayout"
              shell-class="pdft-select-shell"
              :disabled="draft.mode === 'mono'"
            >
              <option v-for="option in dualLayouts" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </UiSelect>
          </label>

          <label class="pdft-field pdft-field-span-2">
            <span class="pdft-label">{{ t('Primary font family') }}</span>
            <UiSelect v-model="draft.fontFamily" shell-class="pdft-select-shell">
              <option v-for="option in fontFamilies" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </UiSelect>
          </label>
        </div>

        <p v-if="compatibleModels.length === 0" class="pdft-inline-warning pdft-section-pad">
          {{
            t(
              'PDF translation supports any configured provider with a PDF translation engine. Configure one in Settings > Models first.'
            )
          }}
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
            <UiInput
              v-model.number="draft.qps"
              type="number"
              min="1"
              max="32"
              shell-class="pdft-input-shell"
            />
          </label>

          <label class="pdft-field">
            <span class="pdft-label">{{ t('Worker pool') }}</span>
            <UiInput
              v-model.number="draft.poolMaxWorkers"
              type="number"
              min="0"
              max="1000"
              shell-class="pdft-input-shell"
            />
            <span class="pdft-field-hint">{{ t('0 uses auto-mapping or upstream default') }}</span>
          </label>

          <label class="pdft-field pdft-field-span-2">
            <span class="pdft-label">{{ t('OCR fallback') }}</span>
            <UiSelect v-model="ocrModeValue" shell-class="pdft-select-shell">
              <option v-for="option in ocrModes" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </UiSelect>
          </label>
        </div>

        <div class="pdft-toggle-grid pdft-section-pad">
          <div v-for="field in topLevelToggleFields" :key="field.key" class="pdft-toggle-row">
            <div class="pdft-inline-copy">
              <div class="pdft-inline-label">{{ t(field.labelKey) }}</div>
              <div v-if="field.hintKey" class="pdft-field-hint">{{ t(field.hintKey) }}</div>
            </div>
            <UiSwitch v-model="draft[field.key]" :aria-label="t(field.labelKey)" />
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
          <UiButton
            class="pdft-toolbar-btn"
            variant="secondary"
            size="sm"
            @click="showAdvancedTuning = !showAdvancedTuning"
          >
            {{ showAdvancedTuning ? t('Hide') : t('Advanced') }}
          </UiButton>
        </div>

        <div v-if="showAdvancedTuning" class="pdft-advanced-stack pdft-section-pad">
          <div class="pdft-advanced-group">
            <div class="pdft-inline-label">{{ t('Translation quality') }}</div>

            <div class="pdft-form-grid">
              <label v-for="field in qualityNumberFields" :key="field.key" class="pdft-field">
                <span class="pdft-label">{{ t(field.labelKey) }}</span>
                <UiInput
                  v-model.number="draft[field.key]"
                  type="number"
                  shell-class="pdft-input-shell"
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
                <UiSwitch v-model="draft[field.key]" :aria-label="t(field.labelKey)" />
              </div>
            </div>

            <label
              v-for="field in qualityTextFields"
              :key="field.key"
              class="pdft-field pdft-field-span-2"
            >
              <span class="pdft-label">{{ t(field.labelKey) }}</span>
              <UiTextarea
                v-model="draft[field.key]"
                shell-class="pdft-textarea-shell"
                :rows="field.rows"
                :placeholder="t(field.placeholderKey)"
                spellcheck="false"
              />
              <span v-if="field.hintKey" class="pdft-field-hint">{{ t(field.hintKey) }}</span>
            </label>
          </div>

          <div class="pdft-advanced-group">
            <div class="pdft-inline-label">{{ t('Layout & segmentation') }}</div>

            <div class="pdft-form-grid">
              <label
                v-for="field in layoutTextFields"
                :key="field.key"
                class="pdft-field pdft-field-span-2"
              >
                <span class="pdft-label">{{ t(field.labelKey) }}</span>
                <UiInput
                  v-model="draft[field.key]"
                  type="text"
                  shell-class="pdft-input-shell"
                  :placeholder="t(field.placeholderKey)"
                  spellcheck="false"
                />
                <span v-if="field.hintKey" class="pdft-field-hint">{{ t(field.hintKey) }}</span>
              </label>

              <label v-for="field in layoutNumberFields" :key="field.key" class="pdft-field">
                <span class="pdft-label">{{ t(field.labelKey) }}</span>
                <UiInput
                  v-model.number="draft[field.key]"
                  type="number"
                  shell-class="pdft-input-shell"
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
                <UiSwitch v-model="draft[field.key]" :aria-label="t(field.labelKey)" />
              </div>
            </div>
          </div>

          <div class="pdft-advanced-group">
            <div class="pdft-inline-label">{{ t('Scanned / formula handling') }}</div>

            <div class="pdft-form-grid">
              <label v-for="field in formulaNumberFields" :key="field.key" class="pdft-field">
                <span class="pdft-label">{{ t(field.labelKey) }}</span>
                <UiInput
                  v-model.number="draft[field.key]"
                  type="number"
                  shell-class="pdft-input-shell"
                  :min="field.min"
                  :max="field.max"
                  :step="field.step"
                />
                <span v-if="field.hintKey" class="pdft-field-hint">{{ t(field.hintKey) }}</span>
              </label>

              <label v-for="field in formulaTextFields" :key="field.key" class="pdft-field">
                <span class="pdft-label">{{ t(field.labelKey) }}</span>
                <UiInput
                  v-model="draft[field.key]"
                  type="text"
                  shell-class="pdft-input-shell"
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
                <UiSwitch v-model="draft[field.key]" :aria-label="t(field.labelKey)" />
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
            <span class="pdft-summary-badge" :class="[`tone-${runtimeDotClass}`]">{{
              pdfTranslateStore.runtimeLabel
            }}</span>
          </div>
          <UiButton
            class="pdft-toolbar-btn"
            variant="secondary"
            size="sm"
            :loading="pdfTranslateStore.runtimeRefreshing"
            @click="refreshRuntimeStatus(true)"
          >
            {{ pdfTranslateStore.runtimeRefreshing ? t('Checking...') : t('Refresh') }}
          </UiButton>
        </div>

        <div class="pdft-runtime-actions pdft-section-pad">
          <UiButton
            class="pdft-action-btn"
            variant="primary"
            :disabled="runtimeBusy"
            :loading="pdfTranslateStore.setupInProgress"
            @click="prepareRuntime"
          >
            {{ pdfTranslateStore.setupInProgress ? t('Preparing...') : t('Prepare Runtime') }}
          </UiButton>
          <UiButton
            class="pdft-action-btn"
            variant="secondary"
            :disabled="runtimeBusy || !runtimeReady"
            :loading="pdfTranslateStore.warmupInProgress"
            @click="warmupRuntime"
          >
            {{ pdfTranslateStore.warmupInProgress ? t('Warming up...') : t('Warm Up Runtime') }}
          </UiButton>
        </div>

        <div v-if="runtimeBusy" class="pdft-progress-meta pdft-section-pad">
          {{ runtimeProgressLabel }}
          <span v-if="pdfTranslateStore.setupProgress > 0"
            >· {{ pdfTranslateStore.setupProgress }}%</span
          >
        </div>

        <div v-if="runtimeBusy" class="pdft-progress-track">
          <div
            class="pdft-progress-fill"
            :style="{ width: `${pdfTranslateStore.setupProgress}%` }"
          ></div>
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
      <UiButton
        class="pdft-action-btn pdft-action-btn--save"
        :variant="saved ? 'secondary' : 'primary'"
        :loading="pdfTranslateStore.saving"
        :disabled="!isDirty"
        @click="saveSettings"
      >
        {{ pdfTranslateStore.saving ? t('Saving...') : saved ? t('Saved') : t('Save Settings') }}
      </UiButton>
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
import {
  createPdfTranslateDualLayouts,
  createPdfTranslateFontFamilies,
  createPdfTranslateLanguageOptions,
  createPdfTranslateOutputModes,
  createPdfTranslateTargetLanguageOptions,
  getPdfTranslateRuntimeTone,
} from '../../domains/document/pdfTranslateUi'
import UiButton from '../shared/ui/UiButton.vue'
import UiInput from '../shared/ui/UiInput.vue'
import UiSelect from '../shared/ui/UiSelect.vue'
import UiSwitch from '../shared/ui/UiSwitch.vue'
import UiTextarea from '../shared/ui/UiTextarea.vue'

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
    hintKey:
      'If a formula-heavy page looks fragmented after the first pass, Altals retries with safer layout protection automatically.',
  },
  {
    key: 'translateTableText',
    labelKey: 'Translate table text',
    hintKey: 'Translate detected table content when supported.',
  },
  {
    key: 'autoMapPoolMaxWorkers',
    labelKey: 'Auto-map worker pool from QPS',
    hintKey:
      'When enabled, the runtime uses qps * 10 (capped at 1000) unless you set a worker pool explicitly.',
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
  ...qualityNumberFields.map((field) => field.key),
  ...qualityTextFields.map((field) => field.key),
  ...qualityToggleFields.map((field) => field.key),
  ...layoutNumberFields.map((field) => field.key),
  ...layoutTextFields.map((field) => field.key),
  ...layoutToggleFields.map((field) => field.key),
  ...formulaNumberFields.map((field) => field.key),
  ...formulaTextFields.map((field) => field.key),
  ...formulaToggleFields.map((field) => field.key),
]

const defaultPdfTranslateSettings = createDefaultPdfTranslateSettings()

const sourceLanguages = computed(() => createPdfTranslateLanguageOptions(t))
const targetLanguages = computed(() => createPdfTranslateTargetLanguageOptions(t))
const outputModes = computed(() => createPdfTranslateOutputModes(t))
const dualLayouts = computed(() => createPdfTranslateDualLayouts(t))
const fontFamilies = computed(() => createPdfTranslateFontFamilies(t))
const ocrModes = computed(() => [
  { value: 'off', label: t('Off') },
  { value: 'manual', label: t('Manual') },
  { value: 'auto', label: t('Automatic') },
])

const compatibleModels = computed(() => pdfTranslateStore.compatibleModels)
const compatibleModelGroups = computed(() => groupModelsByProvider(compatibleModels.value))
const selectedModel = computed(() => findModelById(compatibleModels.value, draft.modelId))

const runtimeDotClass = computed(() => getPdfTranslateRuntimeTone(pdfTranslateStore.runtimeStatus))

const runtimeError = computed(() =>
  pdfTranslateStore.runtimeStatus?.status === 'Error' ? pdfTranslateStore.runtimeStatus.data : ''
)
const runtimeBusy = computed(
  () => pdfTranslateStore.setupInProgress || pdfTranslateStore.warmupInProgress
)
const runtimeReady = computed(() => pdfTranslateStore.runtimeStatus?.status === 'Ready')
const runtimeProgressLabel = computed(
  () =>
    pdfTranslateStore.setupMessage ||
    (pdfTranslateStore.warmupInProgress
      ? t('Warming up translation runtime')
      : t('Preparing translation runtime'))
)

function optionLabel(options, value, fallback = '') {
  return options.find((option) => option.value === value)?.label || fallback
}

const modelSummary = computed(() =>
  selectedModel.value
    ? `${providerLabel(selectedModel.value.provider)} · ${selectedModel.value.name}`
    : t('Not configured')
)

const throughputSummary = computed(() =>
  draft.autoMapPoolMaxWorkers ? `${draft.qps} QPS · ${t('Auto')}` : `${draft.qps} QPS`
)

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

const ocrModeLabel = computed(() =>
  optionLabel(ocrModes.value, ocrModeValue.value, ocrModeValue.value)
)
const processingSummary = computed(() => `${ocrModeLabel.value} · ${throughputSummary.value}`)

const advancedSettingsCustomized = computed(() =>
  advancedSettingKeys.some(
    (key) => JSON.stringify(draft[key]) !== JSON.stringify(defaultPdfTranslateSettings[key])
  )
)
const advancedSummaryLabel = computed(() =>
  advancedSettingsCustomized.value ? t('Customized') : t('Defaults')
)

function ensureModelSelection() {
  if (compatibleModels.value.length === 0) {
    draft.modelId = ''
    return
  }

  if (!selectedModel.value) {
    draft.modelId =
      compatibleModels.value.find((model) => model.default)?.id ||
      compatibleModels.value[0]?.id ||
      ''
  }
}

function draftSnapshot() {
  return JSON.parse(JSON.stringify(draft))
}

const isDirty = computed(
  () => JSON.stringify(draftSnapshot()) !== JSON.stringify(pdfTranslateStore.settings)
)

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
  font-size: var(--ui-font-caption);
}

.pdft-select-shell,
.pdft-input-shell {
  min-height: 30px;
  font-size: var(--ui-font-caption);
  background: var(--surface-base);
}

.pdft-textarea-shell {
  font-size: var(--ui-font-caption);
}

.pdft-select-shell:hover,
.pdft-input-shell:hover,
.pdft-textarea-shell:hover {
  border-color: var(--border-strong);
}

.pdft-summary-badge {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  padding: 0 7px;
  border-radius: 999px;
  border: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--surface-muted) 88%, transparent);
  color: var(--text-secondary);
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
  min-width: 0;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--surface-muted) 82%, transparent);
}

.pdft-inline-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pdft-toggle-row :deep(.ui-switch) {
  flex-shrink: 0;
  margin-top: 1px;
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
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--surface-muted) 80%, transparent);
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
  width: 100%;
}

.pdft-toolbar-btn {
  border-radius: 999px;
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
  background: color-mix(in srgb, var(--surface-muted) 88%, transparent);
  overflow: hidden;
}

.pdft-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--accent) 92%, white 8%),
    color-mix(in srgb, var(--accent) 58%, transparent)
  );
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
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--surface-muted) 86%, black 14%);
  color: var(--text-secondary);
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
