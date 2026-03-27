import { getPreferredPdfTranslateOutput } from './pdfTranslateRuntime.js'

export function createPdfTranslateLanguageOptions(t) {
  return [
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
  ]
}

export function createPdfTranslateTargetLanguageOptions(t) {
  return createPdfTranslateLanguageOptions(t).filter((item) => item.value !== 'auto')
}

export function createPdfTranslateOutputModes(t) {
  return [
    { value: 'mono', label: t('Translated only') },
    { value: 'dual', label: t('Bilingual PDF') },
    { value: 'both', label: t('Create both') },
  ]
}

export function createPdfTranslateDualLayouts(t) {
  return [
    { value: 'side-by-side', label: t('Left & Right') },
    { value: 'alternating-pages', label: t('Alternating pages') },
  ]
}

export function createPdfTranslateFontFamilies(t) {
  return [
    { value: 'auto', label: t('Auto') },
    { value: 'serif', label: t('Serif') },
    { value: 'sans-serif', label: t('Sans-serif') },
    { value: 'script', label: t('Script') },
  ]
}

export function getPdfTranslateRuntimeTone(runtimeStatus = null) {
  const status = runtimeStatus?.status
  if (status === 'Ready') return 'good'
  if (status === 'Error' || status === 'PythonMissing') return 'bad'
  return 'warn'
}

export function getPdfTranslateOcrModeSummary(settings = {}, t) {
  if (settings?.autoEnableOcrWorkaround) return t('Automatic')
  if (settings?.ocrWorkaround) return t('Manual')
  return t('Off')
}

export function getPdfTranslateTaskStatusLabel(status = '', t) {
  switch (status) {
    case 'running':
      return t('Running')
    case 'completed':
      return t('Completed')
    case 'failed':
      return t('Failed')
    case 'canceled':
      return t('Canceled')
    default:
      return t('Queued')
  }
}

export function getPdfTranslateTaskStatusTone(status = '') {
  switch (status) {
    case 'running':
      return 'running'
    case 'completed':
      return 'success'
    case 'failed':
      return 'error'
    case 'canceled':
      return 'muted'
    default:
      return 'warning'
  }
}

export function relativeWorkspacePath(filePath = '', workspacePath = '') {
  if (!workspacePath) return filePath
  const prefix = `${workspacePath}/`
  return filePath.startsWith(prefix) ? filePath.slice(prefix.length) : filePath
}

export function formatPdfTranslateTaskTimestamp(value = '') {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function createPdfTranslateTaskView(task, { workspacePath = '', fallbackMode = 'dual', t }) {
  if (!task?.id) return null

  const outputPath = getPreferredPdfTranslateOutput(task, fallbackMode)
  const outputModes = createPdfTranslateOutputModes(t)

  return {
    ...task,
    title: relativeWorkspacePath(task.inputPath || task.id, workspacePath),
    statusLabel: getPdfTranslateTaskStatusLabel(task.status, t),
    statusTone: getPdfTranslateTaskStatusTone(task.status),
    progress: Number.isFinite(task.progress) ? Math.round(task.progress) : 0,
    message: String(task.message || '').trim() || getPdfTranslateTaskStatusLabel(task.status, t),
    inputLabel: relativeWorkspacePath(task.inputPath || '', workspacePath),
    outputLabel: outputPath ? relativeWorkspacePath(outputPath, workspacePath) : t('Not available yet'),
    outputSummary: outputPath ? relativeWorkspacePath(outputPath, workspacePath) : t('Output pending'),
    outputPath,
    updatedLabel: formatPdfTranslateTaskTimestamp(task.updatedAt || task.createdAt || ''),
    modeLabel:
      outputModes.find((option) => option.value === task.mode)?.label ||
      outputModes.find((option) => option.value === task.requestedMode)?.label ||
      t('Bilingual PDF'),
    canCancel: task.status === 'running',
  }
}
