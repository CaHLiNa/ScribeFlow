import { buildPdfTranslateProviderExtra } from '../../services/pdfTranslateProviderOptions.js'

export const PDF_TRANSLATE_DEFAULT_QPS = 8
export const PDF_TRANSLATE_DEFAULT_POOL_MAX_WORKERS = 0
export const PDF_TRANSLATE_MAX_POOL_MAX_WORKERS = 1000
export const PDF_TRANSLATE_DEFAULT_MIN_TEXT_LENGTH = 5
export const PDF_TRANSLATE_DEFAULT_SHORT_LINE_SPLIT_FACTOR = 0.8
export const PDF_TRANSLATE_DEFAULT_NON_FORMULA_LINE_IOU_THRESHOLD = 0.9
export const PDF_TRANSLATE_DEFAULT_FIGURE_TABLE_PROTECTION_THRESHOLD = 0.9

const PDF_TRANSLATE_MODES = new Set(['mono', 'dual', 'both'])
const PDF_TRANSLATE_FONT_FAMILIES = new Set(['auto', 'serif', 'sans-serif', 'script'])
const PDF_TRANSLATE_DUAL_LAYOUTS = new Set(['side-by-side', 'alternating-pages'])

function clampInteger(value, { minimum, maximum, fallback }) {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return fallback
  return Math.max(minimum, Math.min(parsed, maximum))
}

function clampFloat(value, { minimum, maximum, fallback }) {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(minimum, Math.min(parsed, maximum))
}

function normalizeStringSetting(value, fallback = '') {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim()
  return normalized || fallback
}

function normalizeOptionalStringSetting(value) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function normalizeMode(value) {
  return PDF_TRANSLATE_MODES.has(value) ? value : 'dual'
}

function normalizeFontFamily(value) {
  return PDF_TRANSLATE_FONT_FAMILIES.has(value) ? value : 'auto'
}

function normalizeDualLayout(value) {
  return PDF_TRANSLATE_DUAL_LAYOUTS.has(value) ? value : 'side-by-side'
}

function normalizeOptionalInteger(value, { minimum, maximum }) {
  if (value === '' || value == null) return 0
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < minimum) return 0
  return Math.min(parsed, maximum)
}

function addOptionalValue(target, key, value) {
  if (value === '' || value == null) return
  target[key] = value
}

function dirname(path) {
  const normalized = String(path || '').replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  if (idx < 0) return '.'
  const dir = normalized.slice(0, idx)
  if (/^[A-Za-z]:$/.test(dir)) return `${dir}/`
  return dir || '/'
}

function buildTranslationExtra(normalizedSettings) {
  const translationExtra = {}

  if (normalizedSettings.minTextLength !== PDF_TRANSLATE_DEFAULT_MIN_TEXT_LENGTH) {
    translationExtra.min_text_length = normalizedSettings.minTextLength
  }
  if (normalizedSettings.ignoreCache) translationExtra.ignore_cache = true
  addOptionalValue(translationExtra, 'custom_system_prompt', normalizedSettings.customSystemPrompt)
  addOptionalValue(translationExtra, 'glossaries', normalizedSettings.glossaries)
  if (normalizedSettings.termQps > 0) {
    translationExtra.term_qps = normalizedSettings.termQps
  }
  if (normalizedSettings.termPoolMaxWorkers > 0) {
    translationExtra.term_pool_max_workers = normalizedSettings.termPoolMaxWorkers
  }

  return translationExtra
}

function buildPdfExtra(normalizedSettings) {
  const pdfExtra = {}

  addOptionalValue(pdfExtra, 'pages', normalizedSettings.pages)
  addOptionalValue(pdfExtra, 'formular_font_pattern', normalizedSettings.formularFontPattern)
  addOptionalValue(pdfExtra, 'formular_char_pattern', normalizedSettings.formularCharPattern)

  if (normalizedSettings.splitShortLines) pdfExtra.split_short_lines = true
  if (normalizedSettings.shortLineSplitFactor !== PDF_TRANSLATE_DEFAULT_SHORT_LINE_SPLIT_FACTOR) {
    pdfExtra.short_line_split_factor = normalizedSettings.shortLineSplitFactor
  }
  if (normalizedSettings.skipClean) pdfExtra.skip_clean = true
  if (normalizedSettings.dualTranslateFirst) pdfExtra.dual_translate_first = true
  if (normalizedSettings.disableRichTextTranslate) pdfExtra.disable_rich_text_translate = true
  if (normalizedSettings.maxPagesPerPart > 0) {
    pdfExtra.max_pages_per_part = normalizedSettings.maxPagesPerPart
  }
  if (normalizedSettings.skipScannedDetection) pdfExtra.skip_scanned_detection = true
  if (normalizedSettings.noMergeAlternatingLineNumbers) {
    pdfExtra.no_merge_alternating_line_numbers = true
  }
  if (normalizedSettings.noRemoveNonFormulaLines) {
    pdfExtra.no_remove_non_formula_lines = true
  }
  if (
    normalizedSettings.nonFormulaLineIouThreshold
    !== PDF_TRANSLATE_DEFAULT_NON_FORMULA_LINE_IOU_THRESHOLD
  ) {
    pdfExtra.non_formula_line_iou_threshold = normalizedSettings.nonFormulaLineIouThreshold
  }
  if (
    normalizedSettings.figureTableProtectionThreshold
    !== PDF_TRANSLATE_DEFAULT_FIGURE_TABLE_PROTECTION_THRESHOLD
  ) {
    pdfExtra.figure_table_protection_threshold = normalizedSettings.figureTableProtectionThreshold
  }
  if (normalizedSettings.skipFormulaOffsetCalculation) {
    pdfExtra.skip_formula_offset_calculation = true
  }

  return pdfExtra
}

export function createDefaultPdfTranslateSettings() {
  return {
    modelId: '',
    langIn: 'en',
    langOut: 'zh',
    mode: 'dual',
    qps: PDF_TRANSLATE_DEFAULT_QPS,
    poolMaxWorkers: PDF_TRANSLATE_DEFAULT_POOL_MAX_WORKERS,
    autoMapPoolMaxWorkers: true,
    fontFamily: 'auto',
    dualLayout: 'side-by-side',
    ocrWorkaround: false,
    autoEnableOcrWorkaround: false,
    noWatermarkMode: false,
    enhanceCompatibility: false,
    autoEnhanceFormulaDensePages: true,
    translateTableText: true,
    saveAutoExtractedGlossary: false,
    minTextLength: PDF_TRANSLATE_DEFAULT_MIN_TEXT_LENGTH,
    ignoreCache: false,
    customSystemPrompt: '',
    glossaries: '',
    termQps: 0,
    termPoolMaxWorkers: 0,
    pages: '',
    formularFontPattern: '',
    formularCharPattern: '',
    splitShortLines: false,
    shortLineSplitFactor: PDF_TRANSLATE_DEFAULT_SHORT_LINE_SPLIT_FACTOR,
    skipClean: false,
    dualTranslateFirst: false,
    disableRichTextTranslate: false,
    maxPagesPerPart: 0,
    skipScannedDetection: false,
    onlyIncludeTranslatedPage: false,
    noMergeAlternatingLineNumbers: false,
    noRemoveNonFormulaLines: false,
    nonFormulaLineIouThreshold: PDF_TRANSLATE_DEFAULT_NON_FORMULA_LINE_IOU_THRESHOLD,
    figureTableProtectionThreshold: PDF_TRANSLATE_DEFAULT_FIGURE_TABLE_PROTECTION_THRESHOLD,
    skipFormulaOffsetCalculation: false,
  }
}

export function normalizePdfTranslateSettings(
  raw = {},
  {
    compatibleModels = [],
    defaultModelId = '',
  } = {},
) {
  const next = {
    ...createDefaultPdfTranslateSettings(),
    ...(raw || {}),
  }

  next.modelId = typeof next.modelId === 'string' ? next.modelId : ''
  next.langIn = normalizeStringSetting(next.langIn, 'en')
  next.langOut = normalizeStringSetting(next.langOut, 'zh')
  next.mode = normalizeMode(next.mode)
  next.qps = clampInteger(next.qps, {
    minimum: 1,
    maximum: 32,
    fallback: PDF_TRANSLATE_DEFAULT_QPS,
  })
  next.poolMaxWorkers = clampInteger(next.poolMaxWorkers, {
    minimum: 0,
    maximum: PDF_TRANSLATE_MAX_POOL_MAX_WORKERS,
    fallback: PDF_TRANSLATE_DEFAULT_POOL_MAX_WORKERS,
  })
  next.autoMapPoolMaxWorkers = next.autoMapPoolMaxWorkers !== false
  next.fontFamily = normalizeFontFamily(next.fontFamily)
  next.dualLayout = normalizeDualLayout(next.dualLayout)
  next.ocrWorkaround = next.ocrWorkaround === true
  next.autoEnableOcrWorkaround = next.autoEnableOcrWorkaround === true
  next.noWatermarkMode = next.noWatermarkMode === true
  next.enhanceCompatibility = next.enhanceCompatibility === true
  next.autoEnhanceFormulaDensePages = next.autoEnhanceFormulaDensePages !== false
  next.translateTableText = next.translateTableText !== false
  next.saveAutoExtractedGlossary = next.saveAutoExtractedGlossary === true
  next.minTextLength = clampInteger(next.minTextLength, {
    minimum: 0,
    maximum: 500,
    fallback: PDF_TRANSLATE_DEFAULT_MIN_TEXT_LENGTH,
  })
  next.ignoreCache = next.ignoreCache === true
  next.customSystemPrompt = normalizeOptionalStringSetting(next.customSystemPrompt)
  next.glossaries = normalizeOptionalStringSetting(next.glossaries)
  next.termQps = normalizeOptionalInteger(next.termQps, {
    minimum: 1,
    maximum: 1000,
  })
  next.termPoolMaxWorkers = normalizeOptionalInteger(next.termPoolMaxWorkers, {
    minimum: 1,
    maximum: PDF_TRANSLATE_MAX_POOL_MAX_WORKERS,
  })
  next.pages = normalizeOptionalStringSetting(next.pages)
  next.formularFontPattern = normalizeOptionalStringSetting(next.formularFontPattern)
  next.formularCharPattern = normalizeOptionalStringSetting(next.formularCharPattern)
  next.splitShortLines = next.splitShortLines === true
  next.shortLineSplitFactor = clampFloat(next.shortLineSplitFactor, {
    minimum: 0,
    maximum: 1,
    fallback: PDF_TRANSLATE_DEFAULT_SHORT_LINE_SPLIT_FACTOR,
  })
  next.skipClean = next.skipClean === true
  next.dualTranslateFirst = next.dualTranslateFirst === true
  next.disableRichTextTranslate = next.disableRichTextTranslate === true
  next.maxPagesPerPart = normalizeOptionalInteger(next.maxPagesPerPart, {
    minimum: 1,
    maximum: 1000,
  })
  next.skipScannedDetection = next.skipScannedDetection === true
  next.onlyIncludeTranslatedPage = next.onlyIncludeTranslatedPage === true
  next.noMergeAlternatingLineNumbers = next.noMergeAlternatingLineNumbers === true
  next.noRemoveNonFormulaLines = next.noRemoveNonFormulaLines === true
  next.nonFormulaLineIouThreshold = clampFloat(next.nonFormulaLineIouThreshold, {
    minimum: 0,
    maximum: 1,
    fallback: PDF_TRANSLATE_DEFAULT_NON_FORMULA_LINE_IOU_THRESHOLD,
  })
  next.figureTableProtectionThreshold = clampFloat(next.figureTableProtectionThreshold, {
    minimum: 0,
    maximum: 1,
    fallback: PDF_TRANSLATE_DEFAULT_FIGURE_TABLE_PROTECTION_THRESHOLD,
  })
  next.skipFormulaOffsetCalculation = next.skipFormulaOffsetCalculation === true

  if (next.ocrWorkaround) next.autoEnableOcrWorkaround = false
  if (next.autoEnableOcrWorkaround) next.ocrWorkaround = false

  const hasModel = compatibleModels.some(model => model?.id === next.modelId)
  if (!hasModel) {
    next.modelId = defaultModelId || compatibleModels[0]?.id || ''
  }

  return next
}

export function getRequestedPdfTranslateMode(task, fallbackMode = 'dual') {
  return normalizeMode(task?.requestedMode || task?.mode || fallbackMode)
}

export function getPreferredPdfTranslateOutput(task, fallbackMode = 'dual') {
  if (!task) return ''

  const requestedMode = getRequestedPdfTranslateMode(task, fallbackMode)
  if (requestedMode === 'mono') return task.monoOutput || task.dualOutput || ''
  if (requestedMode === 'dual') return task.dualOutput || task.monoOutput || ''
  return task.dualOutput || task.monoOutput || ''
}

export function buildPdfTranslateRequest({
  filePath,
  settings,
  engine,
  provider,
  providerConfig = null,
  apiKey,
  model,
  baseUrl,
}) {
  const normalizedSettings = normalizePdfTranslateSettings(settings)
  const request = {
    inputPath: filePath,
    outputDir: dirname(filePath),
    langIn: normalizedSettings.langIn,
    langOut: normalizedSettings.langOut,
    engine: engine || 'openai',
    provider,
    apiKey,
    model,
    baseUrl,
    qps: normalizedSettings.qps,
    poolMaxWorkers: normalizedSettings.poolMaxWorkers,
    autoMapPoolMaxWorkers: normalizedSettings.autoMapPoolMaxWorkers,
    mode: normalizedSettings.mode,
    useAlternatingPagesDual: normalizedSettings.dualLayout === 'alternating-pages',
    ocrWorkaround: normalizedSettings.ocrWorkaround,
    autoEnableOcrWorkaround: normalizedSettings.autoEnableOcrWorkaround,
    noWatermarkMode: normalizedSettings.noWatermarkMode,
    enhanceCompatibility: normalizedSettings.enhanceCompatibility,
    autoEnhanceFormulaDensePages: normalizedSettings.autoEnhanceFormulaDensePages,
    translateTableText: normalizedSettings.translateTableText,
    saveAutoExtractedGlossary: normalizedSettings.saveAutoExtractedGlossary,
    noAutoExtractGlossary: normalizedSettings.saveAutoExtractedGlossary !== true,
    onlyIncludeTranslatedPage: normalizedSettings.onlyIncludeTranslatedPage,
  }

  if (normalizedSettings.fontFamily !== 'auto') {
    request.primaryFontFamily = normalizedSettings.fontFamily
  }

  const translationExtra = buildTranslationExtra(normalizedSettings)
  if (Object.keys(translationExtra).length > 0) {
    request.translationExtra = translationExtra
  }

  const pdfExtra = buildPdfExtra(normalizedSettings)
  if (Object.keys(pdfExtra).length > 0) {
    request.pdfExtra = pdfExtra
  }

  const providerExtra = buildPdfTranslateProviderExtra(provider, providerConfig)
  if (Object.keys(providerExtra).length > 0) {
    request.providerExtra = providerExtra
  }

  return request
}
