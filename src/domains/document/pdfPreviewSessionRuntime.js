function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeBuildId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const normalized = normalizeString(value)
  return normalized || ''
}

export function createPdfPreviewSessionState() {
  return {
    sessionKey: '',
    sourcePath: '',
    artifactPath: '',
    buildId: '',
    revisionKey: '',
    synctexPath: '',
    sourceFingerprint: '',
    viewState: null,
  }
}

export function resolvePdfPreviewRevision(options = {}) {
  const sourcePath = normalizeString(options.sourcePath)
  const artifactPath = normalizeString(options.artifactPath)
  const paneId = normalizeString(options.paneId)
  const kind = normalizeString(options.kind || 'document')
  const compileState = options.compileState || null
  const buildId = normalizeBuildId(compileState?.lastCompiled)
  const synctexPath = normalizeString(compileState?.synctexPath)
  const sourceFingerprint = normalizeString(compileState?.sourceFingerprint)
  const compileTargetPath = normalizeString(compileState?.compileTargetPath)
  const sessionKey = [paneId || 'pane-root', sourcePath || artifactPath, kind].filter(Boolean).join('::')
  const documentPath = artifactPath || normalizeString(compileState?.pdfPath)
  const revisionKey = [
    sessionKey,
    documentPath,
    buildId,
    synctexPath,
    sourceFingerprint,
    compileTargetPath,
  ].join('::')

  return {
    sessionKey,
    kind,
    paneId,
    sourcePath,
    artifactPath: documentPath,
    buildId,
    revisionKey,
    synctexPath,
    sourceFingerprint,
    compileTargetPath,
  }
}

export function snapshotPdfPreviewViewState(state = {}) {
  if (!state || typeof state !== 'object') return null
  return {
    pageNumber: Number(state.pageNumber || 1),
    scaleValue: normalizeString(state.scaleValue),
    pageScrollRatio:
      typeof state.pageScrollRatio === 'number' && Number.isFinite(state.pageScrollRatio)
        ? state.pageScrollRatio
        : null,
    scrollLeft:
      typeof state.scrollLeft === 'number' && Number.isFinite(state.scrollLeft)
        ? state.scrollLeft
        : 0,
  }
}

export function resolvePdfPreviewSessionTransition(sessionState, nextRevision, options = {}) {
  const current = sessionState || createPdfPreviewSessionState()
  const revision = nextRevision || resolvePdfPreviewRevision()
  const nextViewState = snapshotPdfPreviewViewState(options.viewState)
  const sameSession = current.sessionKey && current.sessionKey === revision.sessionKey
  const sameDocument = current.artifactPath && current.artifactPath === revision.artifactPath
  const buildChanged = current.buildId !== revision.buildId
  const revisionChanged = current.revisionKey !== revision.revisionKey
  const sourceFingerprintUnchanged =
    Boolean(current.sourceFingerprint)
    && Boolean(revision.sourceFingerprint)
    && current.sourceFingerprint === revision.sourceFingerprint

  let action = 'noop'
  if (!sameSession || !sameDocument) {
    action = 'reload-viewer'
  } else if (buildChanged && sourceFingerprintUnchanged) {
    action = 'noop'
  } else if (revisionChanged || buildChanged) {
    action = 'refresh-document'
  }

  return {
    action,
    nextSession: {
      sessionKey: revision.sessionKey,
      sourcePath: revision.sourcePath,
      artifactPath: revision.artifactPath,
      buildId: revision.buildId,
      revisionKey: revision.revisionKey,
      synctexPath: revision.synctexPath,
      sourceFingerprint: revision.sourceFingerprint,
      viewState: nextViewState,
    },
    revision,
  }
}
