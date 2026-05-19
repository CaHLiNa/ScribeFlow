import { REFERENCE_DOCK_PDF_PAGE } from './referenceDockPages.ts'

export function resolveReferenceCitationUsageKeys(citationUsageIndex = {}) {
  if (!citationUsageIndex || typeof citationUsageIndex !== 'object' || Array.isArray(citationUsageIndex)) {
    return new Set()
  }
  return new Set(Object.keys(citationUsageIndex))
}

export function resolveReferenceCitationStyleId(style = '', hasStyle = false) {
  const normalizedStyle = String(style || '').trim()
  return normalizedStyle && hasStyle ? normalizedStyle : 'apa'
}

export function resolveReferenceWorkspaceCitationStyles(styles = []) {
  return Array.isArray(styles) ? styles : []
}

export function buildReferenceDockPdfOpenState(referenceId = '') {
  const normalizedReferenceId = String(referenceId || '').trim()
  return {
    canOpen: Boolean(normalizedReferenceId),
    referenceDockPdfOpen: Boolean(normalizedReferenceId),
    referenceDockPdfReferenceId: normalizedReferenceId,
  }
}

export function buildReferenceDockPdfCloseState(state = {}, referenceId = '') {
  const normalizedReferenceId = String(referenceId || '').trim()
  const currentReferenceId = String(state.referenceDockPdfReferenceId || '')
  if (normalizedReferenceId && normalizedReferenceId !== currentReferenceId) {
    return {
      changed: false,
      referenceDockPdfOpen: state.referenceDockPdfOpen === true,
      referenceDockPdfReferenceId: currentReferenceId,
    }
  }

  return {
    changed: currentReferenceId !== '' || state.referenceDockPdfOpen === true,
    referenceDockPdfOpen: false,
    referenceDockPdfReferenceId: '',
  }
}

export function buildReferenceDockPdfResetState() {
  return {
    referenceDockPdfOpen: false,
    referenceDockPdfReferenceId: '',
  }
}

export function isReferenceDockPdfSelected(state = {}) {
  return (
    state.referenceDockPdfOpen === true &&
    String(state.referenceDockPdfReferenceId || '') === String(state.selectedReferenceId || '')
  )
}

export function buildReferenceDockPdfSnapshotState(state = {}) {
  const hasDockReference = state.hasDockReference === true ||
    (Array.isArray(state.references) &&
      state.references.some((reference) => String(reference?.id || '') === String(state.referenceDockPdfReferenceId || '')))
  if (
    state.referenceDockPdfReferenceId &&
    !hasDockReference
  ) {
    return {
      ...buildReferenceDockPdfResetState(),
      shouldFallbackToDetails: false,
    }
  }

  return {
    referenceDockPdfOpen: state.referenceDockPdfOpen === true,
    referenceDockPdfReferenceId: String(state.referenceDockPdfReferenceId || ''),
    shouldFallbackToDetails: state.referenceDockActivePage === REFERENCE_DOCK_PDF_PAGE &&
      !isReferenceDockPdfSelected(state),
  }
}

export function buildReferenceStoreInitialState() {
  return {
    librarySections: [],
    sourceSections: [],
    collections: [],
    tags: [],
    references: [],
    documentReferenceSelections: {},
    citationStyle: '',
    selectedSectionKey: '',
    selectedSourceKey: '',
    selectedCollectionKey: '',
    selectedTagKey: '',
    selectedReferenceId: '',
    referenceDockPdfOpen: false,
    referenceDockPdfReferenceId: '',
    sortKey: '',
    resolvedQueryState: null,
    isLoading: false,
    loadError: '',
    zoteroSyncStatus: 'disconnected',
    zoteroSyncLastSyncTime: '',
    zoteroSyncError: '',
    zoteroSyncErrorType: '',
    zoteroMutationError: '',
    importInFlight: false,
    availableCitationStylesList: [],
  }
}
