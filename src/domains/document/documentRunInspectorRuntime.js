function basename(path = '') {
  return String(path || '').split('/').pop() || path
}

export function shortenDocumentPath(path = '', { segments = 2 } = {}) {
  const normalized = String(path || '').trim()
  if (!normalized) return ''

  const parts = normalized.split('/').filter(Boolean)
  if (parts.length <= segments) return parts.join('/')
  return `.../${parts.slice(-segments).join('/')}`
}

function normalizeCount(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

function formatDuration(durationMs, t) {
  const numeric = Number(durationMs)
  if (!Number.isFinite(numeric) || numeric <= 0) return ''
  if (numeric < 1000) return t('{count} ms', { count: Math.round(numeric) })
  const seconds = numeric / 1000
  if (seconds < 10) return t('{count} s', { count: seconds.toFixed(1) })
  if (seconds < 60) return t('{count} s', { count: Math.round(seconds) })
  const minutes = seconds / 60
  return t('{count} min', { count: minutes.toFixed(minutes >= 10 ? 0 : 1) })
}

function buildCompileDiagnosisCard(artifact, options) {
  const { t, maxProblems = 3 } = options
  const problems = Array.isArray(artifact?.problems) ? artifact.problems : []
  const visibleProblems = problems.slice(0, maxProblems).map((problem, index) => ({
    id: `${artifact.id || 'diagnosis'}-problem-${index}`,
    tone: problem?.severity === 'error' ? 'danger' : 'warning',
    title: problem?.line
      ? t('{severity} · line {line}', {
          severity: problem?.severity === 'error' ? t('Error') : t('Warning'),
          line: problem.line,
        })
      : (problem?.severity === 'error' ? t('Error') : t('Warning')),
    body: problem?.message || '',
  }))

  const meta = []
  if (artifact?.compileTargetPath) {
    meta.push({
      label: t('Target'),
      value: shortenDocumentPath(artifact.compileTargetPath),
      title: artifact.compileTargetPath,
    })
  }
  if (artifact?.durationMs) {
    meta.push({
      label: t('Duration'),
      value: formatDuration(artifact.durationMs, t),
      title: '',
    })
  }
  if (artifact?.commandPreview) {
    meta.push({
      label: t('Command'),
      value: artifact.commandPreview,
      title: artifact.commandPreview,
      long: true,
    })
  }

  return {
    id: artifact.cardId || artifact.id || 'compile-diagnosis',
    badge: t('Compile diagnosis'),
    tone: artifact?.errorCount > 0 ? 'danger' : artifact?.warningCount > 0 ? 'warning' : 'success',
    title: artifact?.summary || artifact?.title || t('Compile diagnosis'),
    summary: artifact?.title && artifact.title !== artifact.summary ? artifact.title : '',
    meta,
    items: visibleProblems,
    moreCount: Math.max(0, problems.length - visibleProblems.length),
    moreLabel: t('{count} more issues', { count: Math.max(0, problems.length - visibleProblems.length) }),
    detailsLabel: artifact?.body ? t('Raw compile log') : '',
    detailsAvailable: !!artifact?.body,
    detailsSourceIndex: artifact.sourceIndex,
  }
}

function buildPatchCard(artifact, options) {
  const { t, maxChanges = 3 } = options
  const changes = Array.isArray(artifact?.changes) ? artifact.changes : []
  const visibleChanges = changes.slice(0, maxChanges).map((change, index) => ({
    id: `${artifact.id || 'patch'}-change-${index}`,
    tone: 'accent',
    title: basename(change?.filePath || artifact?.sourceFile || ''),
    body: change?.summary || '',
  }))

  return {
    id: artifact.cardId || artifact.id || 'patch',
    badge: t('Patch'),
    tone: 'accent',
    title: artifact?.title || t('Patch ready'),
    summary: artifact?.summary || '',
    meta: artifact?.sourceFile
      ? [{
          label: t('Source'),
          value: shortenDocumentPath(artifact.sourceFile),
          title: artifact.sourceFile,
        }]
      : [],
    items: visibleChanges,
    moreCount: Math.max(0, changes.length - visibleChanges.length),
    moreLabel: t('{count} more changes', { count: Math.max(0, changes.length - visibleChanges.length) }),
    detailsLabel: artifact?.body ? t('Patch details') : '',
    detailsAvailable: !!artifact?.body,
    detailsSourceIndex: artifact.sourceIndex,
  }
}

function buildGenericCard(artifact, options) {
  const { t } = options
  return {
    id: artifact.cardId || artifact.id || artifact.type || 'artifact',
    badge: t('Result'),
    tone: 'neutral',
    title: artifact?.title || artifact?.summary || t('Result'),
    summary: artifact?.title && artifact?.summary && artifact.title !== artifact.summary ? artifact.summary : '',
    meta: artifact?.sourceFile
      ? [{
          label: t('Source'),
          value: shortenDocumentPath(artifact.sourceFile),
          title: artifact.sourceFile,
        }]
      : [],
    items: [],
    moreCount: 0,
    moreLabel: '',
    detailsLabel: artifact?.body ? t('Details') : '',
    detailsAvailable: !!artifact?.body,
    detailsSourceIndex: artifact.sourceIndex,
  }
}

export function buildDocumentRunArtifactCards(artifacts = [], options = {}) {
  const {
    t = (value, params = {}) => String(value || '').replace(/\{(\w+)\}/g, (_, key) => params[key] ?? `{${key}}`),
  } = options

  return (Array.isArray(artifacts) ? artifacts : [])
    .filter(Boolean)
    .map((artifact, index) => {
      const normalized = {
        ...artifact,
        cardId: artifact?.id || `${artifact?.type || 'artifact'}-${index}`,
        errorCount: normalizeCount(artifact?.errorCount),
        sourceIndex: index,
        warningCount: normalizeCount(artifact?.warningCount),
        durationMs: normalizeCount(artifact?.durationMs),
      }

      if (normalized.type === 'compile_diagnosis') {
        return buildCompileDiagnosisCard(normalized, { ...options, t })
      }

      if (normalized.type === 'patch') {
        return buildPatchCard(normalized, { ...options, t })
      }

      return buildGenericCard(normalized, { ...options, t })
    })
}
