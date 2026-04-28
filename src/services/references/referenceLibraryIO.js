export {
  REFERENCE_LIBRARY_FILENAME,
  resolveLegacyReferencesDataDir,
  resolveReferencesDataDir,
  resolveLegacyReferenceLibraryFile,
  resolveProjectLegacyReferencesDataDir,
  resolveProjectLegacyReferenceLibraryFile,
  resolveReferenceLibraryFile,
} from './referenceLibraryPaths.js'

export {
  buildDefaultReferenceLibrarySnapshot,
  normalizeReferenceLibrarySnapshot,
} from './referenceLibraryState.js'

export {
  normalizeReferenceLibrarySnapshotWithBackend,
  normalizeReferenceRecordWithBackend,
  readOrCreateReferenceLibrarySnapshot,
  writeReferenceLibrarySnapshot,
} from './referenceLibraryRuntime.js'
