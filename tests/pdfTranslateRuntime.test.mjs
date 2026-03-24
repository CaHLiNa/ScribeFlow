import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPdfTranslateRequest,
  createDefaultPdfTranslateSettings,
  getPreferredPdfTranslateOutput,
  normalizePdfTranslateSettings,
} from '../src/domains/document/pdfTranslateRuntime.js'

test('pdf translate runtime normalizes persisted settings and falls back to a compatible default model', () => {
  const settings = normalizePdfTranslateSettings({
    modelId: 'missing-model',
    langIn: '',
    langOut: ' fr ',
    mode: 'invalid',
    qps: 99,
    poolMaxWorkers: -10,
    autoMapPoolMaxWorkers: false,
    fontFamily: 'fantasy',
    dualLayout: 'newspaper',
    ocrWorkaround: true,
    autoEnableOcrWorkaround: true,
    enhanceCompatibility: 'yes',
    autoEnhanceFormulaDensePages: false,
    translateTableText: false,
    saveAutoExtractedGlossary: true,
  }, {
    compatibleModels: [{ id: 'deepseek-chat' }, { id: 'gemini-flash' }],
    defaultModelId: 'gemini-flash',
  })

  assert.deepEqual(settings, {
    ...createDefaultPdfTranslateSettings(),
    modelId: 'gemini-flash',
    langIn: 'en',
    langOut: 'fr',
    mode: 'dual',
    qps: 32,
    poolMaxWorkers: 0,
    autoMapPoolMaxWorkers: false,
    fontFamily: 'auto',
    dualLayout: 'side-by-side',
    ocrWorkaround: true,
    autoEnableOcrWorkaround: false,
    enhanceCompatibility: false,
    autoEnhanceFormulaDensePages: false,
    translateTableText: false,
    saveAutoExtractedGlossary: true,
  })
})

test('pdf translate runtime prefers the output that matches the task requested mode', () => {
  const task = {
    monoOutput: '/workspace/paper.zh.mono.pdf',
    dualOutput: '/workspace/paper.zh.dual.pdf',
    requestedMode: 'mono',
  }

  assert.equal(
    getPreferredPdfTranslateOutput(task, 'dual'),
    '/workspace/paper.zh.mono.pdf',
  )

  assert.equal(
    getPreferredPdfTranslateOutput({
      monoOutput: '/workspace/paper.zh.mono.pdf',
      dualOutput: '/workspace/paper.zh.dual.pdf',
      requestedMode: 'both',
    }, 'mono'),
    '/workspace/paper.zh.dual.pdf',
  )
})

test('pdf translate runtime builds requests with glossary and layout flags aligned to Altals settings', () => {
  const request = buildPdfTranslateRequest({
    filePath: '/workspace/paper.pdf',
    settings: {
      ...createDefaultPdfTranslateSettings(),
      modelId: 'deepseek-chat',
      mode: 'both',
      dualLayout: 'alternating-pages',
      fontFamily: 'serif',
      enhanceCompatibility: true,
      minTextLength: 8,
      ignoreCache: true,
      customSystemPrompt: 'Focus on scientific precision.',
      glossaries: 'LLM => large language model',
      pages: '1-3,5',
      splitShortLines: true,
      maxPagesPerPart: 12,
      skipScannedDetection: true,
      noRemoveNonFormulaLines: true,
      saveAutoExtractedGlossary: false,
    },
    engine: 'deepseek',
    provider: 'deepseek',
    providerConfig: {
      pdfTranslateOptions: {
        jsonMode: true,
      },
    },
    apiKey: 'secret',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
  })

  assert.deepEqual(request, {
    inputPath: '/workspace/paper.pdf',
    outputDir: '/workspace',
    langIn: 'en',
    langOut: 'zh',
    engine: 'deepseek',
    provider: 'deepseek',
    apiKey: 'secret',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
    qps: 8,
    poolMaxWorkers: 0,
    autoMapPoolMaxWorkers: true,
    mode: 'both',
    useAlternatingPagesDual: true,
    ocrWorkaround: false,
    autoEnableOcrWorkaround: false,
    noWatermarkMode: false,
    enhanceCompatibility: true,
    autoEnhanceFormulaDensePages: true,
    translateTableText: true,
    saveAutoExtractedGlossary: false,
    noAutoExtractGlossary: true,
    primaryFontFamily: 'serif',
    onlyIncludeTranslatedPage: false,
    translationExtra: {
      min_text_length: 8,
      ignore_cache: true,
      custom_system_prompt: 'Focus on scientific precision.',
      glossaries: 'LLM => large language model',
    },
    pdfExtra: {
      pages: '1-3,5',
      split_short_lines: true,
      max_pages_per_part: 12,
      skip_scanned_detection: true,
      no_remove_non_formula_lines: true,
    },
    providerExtra: {
      deepseek_enable_json_mode: true,
    },
  })
})
