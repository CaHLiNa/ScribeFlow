function defaultTranslator(value, params = {}) {
  return String(value || '').replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`))
}

function normalizeExportPhase(phase = '') {
  switch (String(phase || '').trim()) {
    case 'exporting':
    case 'running':
      return 'exporting'
    case 'error':
    case 'failed':
      return 'error'
    case 'ready':
    case 'success':
      return 'ready'
    default:
      return 'idle'
  }
}

export function resolveDocumentExportState({
  filePath = '',
  uiState = null,
  previewState = null,
  artifactPath = '',
  artifactReady = false,
} = {}) {
  const hasArtifact = Boolean(artifactReady || artifactPath)
  const kind = uiState?.kind || null

  if (!filePath || !kind || kind === 'text') {
    return {
      kind: null,
      exportPhase: 'idle',
      canExport: false,
      canOpenArtifact: false,
      artifactPath: '',
      artifactLabel: '',
      targetLabel: '',
      targetHint: '',
    }
  }

  if (kind === 'markdown') {
    return {
      kind,
      exportPhase: previewState?.previewVisible ? 'ready' : 'idle',
      canExport: false,
      canOpenArtifact: false,
      artifactPath: '',
      artifactLabel: 'HTML preview',
      targetLabel: 'Workspace preview',
      targetHint: 'Markdown stays export-light and relies on preview rendering inside the workspace.',
    }
  }

  return {
    kind,
    exportPhase: normalizeExportPhase(uiState?.phase === 'compiling' ? 'exporting' : hasArtifact ? 'ready' : 'idle'),
    canExport: true,
    canOpenArtifact: hasArtifact,
    artifactPath: artifactPath || '',
    artifactLabel: 'PDF output',
    targetLabel: 'External document output',
    targetHint: hasArtifact
      ? 'The latest compiled output can be opened outside the editor surface.'
      : 'Compile the document to generate a new exportable output.',
  }
}

export function buildDocumentExportSummary(exportState = null, t = defaultTranslator) {
  if (!exportState?.kind || exportState.kind === 'text') {
    return {
      title: t('No export workflow'),
      description: t('This file does not currently expose an export workflow.'),
      actionLabel: '',
      actionHint: '',
    }
  }

  if (exportState.kind === 'markdown') {
    return {
      title: t('Preview-first workflow'),
      description: t('Markdown stays in the workspace preview loop instead of generating a compiled artifact.'),
      actionLabel: t('Open preview'),
      actionHint: t('Use the workspace preview to inspect the rendered draft.'),
    }
  }

  if (exportState.canOpenArtifact) {
    return {
      title: t('Export ready'),
      description: t('A compiled document output is available for external review.'),
      actionLabel: t('Open output'),
      actionHint: exportState.artifactPath || t('Latest output path unavailable'),
    }
  }

  return {
    title: t('Build required'),
    description: t('Run the document workflow to generate a fresh exportable output.'),
    actionLabel: t('Compile'),
    actionHint: t('No output has been generated yet.'),
  }
}
