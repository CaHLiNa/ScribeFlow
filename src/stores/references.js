import { defineStore, getActivePinia } from 'pinia'
import { t } from '../i18n/index.js'
import { useWorkspaceStore } from './workspace.js'
import { formatCitation } from '../services/references/citationFormatter.js'
import {
  getAvailableCitationStyles,
  getCitationStyleInfo,
  setUserCitationStyles,
} from '../services/references/citationStyleRegistry.js'
import {
  exportReferencesToBibTeX,
  writeReferenceBibTeXExport,
  writeReferenceJsonExport,
} from '../services/references/bibtexExport.js'
import {
  renameReferencePdfAsset as renameReferencePdfAssetWithBackend,
  storeReferencePdf,
} from '../services/references/referenceAssets.js'
import {
  REFERENCE_COLLECTIONS,
  REFERENCE_FIXTURES,
  REFERENCE_LIBRARY_SECTIONS,
  REFERENCE_SOURCE_SECTIONS,
  REFERENCE_TAGS,
} from '../services/references/referenceLibraryFixtures.js'
import {
  buildDefaultReferenceLibrarySnapshot,
  normalizeReferenceLibrarySnapshotWithBackend,
  readOrCreateReferenceLibrarySnapshot,
  writeReferenceLibrarySnapshot,
} from '../services/references/referenceLibraryIO.js'
import {
  importReferenceFromPdf,
  importReferencesFromText,
  parseReferenceImportFile,
  parseReferenceImportText,
} from '../services/references/bibtexImport.js'
import { refreshReferenceMetadata as refreshReferenceMetadataWithBackend } from '../services/references/crossref.js'
import {
  applyReferenceMutation,
  resolveReferenceQuery,
  scanWorkspaceCitationStyles,
  writeReferenceBibFile,
} from '../services/references/referenceRuntime.js'
import {
  connectZoteroAccount,
  deleteFromZotero,
  disconnectZotero as disconnectZoteroWithBackend,
  loadZoteroAccountState,
  loadRemoteLibraries,
  saveZoteroConfig,
  syncNow as syncZoteroNowWithBackend,
} from '../services/references/zoteroSync.js'
import {
  REFERENCE_DOCK_DETAILS_PAGE,
} from '../domains/references/referenceDockPages.js'
import {
  buildAddDocumentReferenceMutationState,
  buildDefaultResolvedQueryState,
  buildDocumentReferenceIdsMutationState,
  buildReferenceEmptyImportResult,
  buildReferenceImportInputState,
  buildReferenceImportMutationCommitState,
  buildReferenceImportMutationResultState,
  buildReferenceAddMutationResultState,
  buildReferenceCollectionMutationResultState,
  buildReferenceCitationFormatTargetState,
  buildReferenceDocumentIdsMutationResultState,
  buildReferenceJsonExportTargetState,
  buildReferenceMetadataRefreshTargetState,
  buildReferencePdfAssetResultState,
  buildReferencePdfAssetTargetState,
  buildReferencePdfImportResultState,
  buildReferencePdfImportTargetState,
  buildReferenceRemoveCollectionMutationResultState,
  buildReferenceRemoveMutationResultState,
  buildReferenceRemoveTargetState,
  buildReferenceToggleCollectionMutationResultState,
  buildReferenceUpdateMutationResultState,
  buildReferenceZoteroSyncResultState,
  resolveReferenceCitationStyleId,
  resolveReferenceWorkspaceCitationStyles,
  buildRemoveDocumentReferenceMutationState,
  buildReferenceLibrarySnapshotPayload,
  buildReferenceDockPdfCloseState,
  buildReferenceDockPdfOpenState,
  buildReferenceDockPdfResetState,
  buildReferenceCollectionSelectionState,
  isReferenceDockPdfSelected,
  isReferenceSelectedForDocument,
  buildReferenceStoreCleanupState,
  buildReferenceStoreInitialState,
  resolveAvailableDocumentReferences,
  resolveCollection,
  resolveDocumentReferenceByKey,
  resolveDocumentReferenceIds,
  resolveDocumentReferences,
  resolveReferenceByKey,
  resolveReferenceById,
  resolveReferenceResolvedQueryState,
  resolveReferenceSelectionId,
  buildReferenceSectionSelectionState,
  buildReferenceSnapshotApplyState,
  buildReferenceSortSelectionState,
  buildReferenceSourceSelectionState,
  buildReferenceRemoveMutationCommitState,
  buildReferenceTagSelectionState,
  buildReferenceUpdateMutationCommitState,
  resolveReferencesForExport,
  resolveTag,
  buildReferenceQuerySelectionState,
  searchReferences,
} from '../domains/references/referenceStoreState.js'
import { classifyZoteroSyncError } from '../domains/references/zoteroSyncPresentation.js'

const REFERENCE_STORE_DEFAULTS = {
  librarySections: REFERENCE_LIBRARY_SECTIONS,
  sourceSections: REFERENCE_SOURCE_SECTIONS,
  collections: REFERENCE_COLLECTIONS,
  tags: REFERENCE_TAGS,
  references: REFERENCE_FIXTURES,
  selectedReferenceId: REFERENCE_FIXTURES[0]?.id || '',
}

async function resolveReferenceStorageRoot(projectRoot = '') {
  const normalizedRoot = String(projectRoot || '').trim()
  if (normalizedRoot) return normalizedRoot

  const workspace = useWorkspaceStore()
  return String(await workspace.ensureGlobalConfigDir() || '').trim()
}

function resolveReferenceWorkspacePath() {
  const workspace = useWorkspaceStore()
  return String(workspace.projectDir || workspace.path || '').trim()
}

async function commitReferenceMutationSnapshot(store, projectRoot = '', mutation = {}, options = {}) {
  const { fallbackSnapshot = null, ...commitOptions } = options
  const snapshot = mutation?.snapshot || fallbackSnapshot || store.buildLibrarySnapshotPayload()
  return store.commitLibrarySnapshot(projectRoot, snapshot, commitOptions)
}

async function commitImportedReferences(store, projectRoot = '', importedReferences = []) {
  const importState = buildReferenceImportInputState(importedReferences)
  if (!importState.canImport) return importState.emptyResult

  const mutation = await applyReferenceMutation({
    snapshot: store.buildLibrarySnapshotPayload(),
    action: {
      type: 'mergeImportedReferences',
      imported: importState.importedReferences,
      markForZoteroPush: true,
    },
  })
  await commitReferenceMutationSnapshot(store, projectRoot, mutation, {
    ...buildReferenceImportMutationCommitState(mutation),
  })
  return buildReferenceImportMutationResultState(store.references, mutation)
}

export const useReferencesStore = defineStore('references', {
  state: () => buildReferenceStoreInitialState(REFERENCE_STORE_DEFAULTS),

  getters: {
    sectionCounts: (state) => state.resolvedQueryState?.sectionCounts || {},

    sourceCounts: (state) => state.resolvedQueryState?.sourceCounts || {},

    collectionCounts: (state) => state.resolvedQueryState?.collectionCounts || {},

    selectedCollection: (state) => resolveCollection(state.collections, state.selectedCollectionKey),

    tagCounts: (state) => state.resolvedQueryState?.tagCounts || {},

    selectedTag: (state) => resolveTag(state.tags, state.selectedTagKey),

    filteredReferences: (state) => state.resolvedQueryState?.filteredReferences || [],

    selectedReference(state) {
      return (
        resolveReferenceById(state.references, state.selectedReferenceId) ||
        this.filteredReferences[0] ||
        null
      )
    },

    selectedReferencePdfTabOpen(state) {
      return isReferenceDockPdfSelected(state)
    },

    sortedLibrary() {
      return this.resolvedQueryState?.sortedReferences || []
    },

    availableCitationStyles() {
      return this.availableCitationStylesList
    },

    citedIn() {
      return this.resolvedQueryState?.citationUsageIndex || {}
    },

    citedDetails() {
      return this.resolvedQueryState?.citationUsageDetails || {}
    },

    citedKeys() {
      return new Set(Object.keys(this.citedIn))
    },
  },

  actions: {
    buildLibrarySnapshotPayload() {
      return buildReferenceLibrarySnapshotPayload(this.$state)
    },

    async commitLibrarySnapshot(projectRoot = '', snapshot = {}, options = {}) {
      const { persist = true, preferredSelectedReferenceId = null } = options
      let nextSnapshot = null
      if (persist) {
        const storageRoot = await resolveReferenceStorageRoot(projectRoot)
        if (!storageRoot) {
          throw new Error(t('Reference library storage is not ready'))
        }
        nextSnapshot = await writeReferenceLibrarySnapshot(storageRoot, snapshot)
      } else {
        nextSnapshot = await normalizeReferenceLibrarySnapshotWithBackend(snapshot)
      }
      await this.applyLibrarySnapshot(nextSnapshot, { preferredSelectedReferenceId })
      return nextSnapshot
    },

    async refreshResolvedQueryState() {
      const pinia = getActivePinia()
      const fileContents = pinia?.state?.value?.files?.fileContents || {}
      const resolved = await resolveReferenceQuery({
        librarySections: this.librarySections,
        sourceSections: this.sourceSections,
        collections: this.collections,
        tags: this.tags,
        references: this.references,
        selectedSectionKey: this.selectedSectionKey,
        selectedSourceKey: this.selectedSourceKey,
        selectedCollectionKey: this.selectedCollectionKey,
        selectedTagKey: this.selectedTagKey,
        sortKey: this.sortKey,
        preferredSelectedReferenceId: this.selectedReferenceId,
        fileContents,
      })

      this.resolvedQueryState = resolveReferenceResolvedQueryState(resolved, this.$state)
      const selection = buildReferenceQuerySelectionState(this.resolvedQueryState, this.$state)
      this.selectedSectionKey = selection.selectedSectionKey
      this.selectedSourceKey = selection.selectedSourceKey
      this.selectedCollectionKey = selection.selectedCollectionKey
      this.selectedTagKey = selection.selectedTagKey
      this.sortKey = selection.sortKey
      this.selectedReferenceId = selection.selectedReferenceId
    },

    async syncResolvedQueryState() {
      this.resolvedQueryState = buildDefaultResolvedQueryState({
        librarySections: this.librarySections,
        sourceSections: this.sourceSections,
        collections: this.collections,
        tags: this.tags,
        references: this.references,
        selectedSectionKey: this.selectedSectionKey,
        selectedSourceKey: this.selectedSourceKey,
        selectedCollectionKey: this.selectedCollectionKey,
        selectedTagKey: this.selectedTagKey,
        sortKey: this.sortKey,
        selectedReferenceId: this.selectedReferenceId,
      })
      await this.refreshResolvedQueryState()
    },

    async persistLibrarySnapshot(projectRoot = '') {
      return this.commitLibrarySnapshot(projectRoot, this.buildLibrarySnapshotPayload())
    },

    async applyLibrarySnapshot(snapshot = {}, options = {}) {
      const { preferredSelectedReferenceId = null } = options
      const snapshotState = buildReferenceSnapshotApplyState({
        ...this.$state,
        referenceDockActivePage: useWorkspaceStore().referenceDockActivePage,
      }, snapshot, {
        defaultSnapshot: buildDefaultReferenceLibrarySnapshot(),
        preferredSelectedReferenceId,
      })
      this.collections = snapshotState.collections
      this.tags = snapshotState.tags
      this.references = snapshotState.references
      this.documentReferenceSelections = snapshotState.documentReferenceSelections
      this.citationStyle = snapshotState.citationStyle
      this.selectedCollectionKey = snapshotState.selectedCollectionKey
      this.selectedTagKey = snapshotState.selectedTagKey
      this.selectedSourceKey = snapshotState.selectedSourceKey
      this.selectedReferenceId = snapshotState.selectedReferenceId
      await this.syncResolvedQueryState()
      const dockPdfState = snapshotState.dockPdfState
      this.referenceDockPdfOpen = dockPdfState.referenceDockPdfOpen
      this.referenceDockPdfReferenceId = dockPdfState.referenceDockPdfReferenceId
      if (dockPdfState.shouldFallbackToDetails) {
        const workspace = useWorkspaceStore()
        void workspace.setReferenceDockActivePage(REFERENCE_DOCK_DETAILS_PAGE)
      }
    },

    async loadWorkspaceLibrary(projectRoot = '', options = {}) {
      this.isLoading = true
      this.loadError = ''

      try {
        const storageRoot = await resolveReferenceStorageRoot(projectRoot)
        const snapshot = await readOrCreateReferenceLibrarySnapshot(storageRoot, options)
        await this.applyLibrarySnapshot(snapshot)
        await this.loadWorkspaceCitationStyles()
        this.availableCitationStylesList = await getAvailableCitationStyles().catch(() => [])
      } catch (error) {
        this.loadError = error?.message || t('Failed to load reference library')
        await this.applyLibrarySnapshot(buildDefaultReferenceLibrarySnapshot())
        setUserCitationStyles([])
      } finally {
        this.isLoading = false
      }
    },

    async applyWorkspaceLibraryBootstrap(snapshot = {}, referenceStyles = []) {
      await this.applyLibrarySnapshot(snapshot)
      setUserCitationStyles(resolveReferenceWorkspaceCitationStyles(referenceStyles))
      return this.buildLibrarySnapshotPayload()
    },

    async loadWorkspaceCitationStyles() {
      const workspace = useWorkspaceStore()
      const workspacePath = String(workspace.path || '').trim()
      if (!workspacePath) {
        setUserCitationStyles([])
        return []
      }

      const styles = await scanWorkspaceCitationStyles(workspacePath).catch(() => [])
      const normalized = resolveReferenceWorkspaceCitationStyles(styles)
      setUserCitationStyles(normalized)
      return normalized
    },

    async syncBibFileForTex(texPath = '') {
      const normalizedTexPath = String(texPath || '').trim()
      if (!normalizedTexPath) return ''
      return writeReferenceBibFile(
        normalizedTexPath,
        this.documentReferencesForTex(normalizedTexPath),
        this.citationStyle
      )
    },

    async importBibTeXContent(projectRoot = '', content = '') {
      return this.importReferenceText(projectRoot, content, 'bibtex')
    },

    async importReferenceFile(projectRoot = '', filePath = '', format = 'auto') {
      const importedReferences = await parseReferenceImportFile(filePath, format)
      return this.importParsedReferences(projectRoot, importedReferences)
    },

    async importReferenceText(projectRoot = '', content = '', format = 'auto') {
      const importedReferences = await parseReferenceImportText(content, format)
      return this.importParsedReferences(projectRoot, importedReferences)
    },

    async importParsedReferences(projectRoot = '', importedReferences = []) {
      if (!buildReferenceImportInputState(importedReferences).canImport) {
        return buildReferenceEmptyImportResult()
      }
      this.importInFlight = true
      try {
        return commitImportedReferences(this, projectRoot, importedReferences)
      } finally {
        this.importInFlight = false
      }
    },

    async importResolvedReferenceText(projectRoot = '', content = '') {
      this.importInFlight = true
      try {
        const importedReferences = await importReferencesFromText(content)
        if (!buildReferenceImportInputState(importedReferences).canImport) {
          return buildReferenceEmptyImportResult()
        }

        return commitImportedReferences(this, projectRoot, importedReferences)
      } finally {
        this.importInFlight = false
      }
    },

    async createCollection(projectRoot = '', label = '') {
      const mutation = await applyReferenceMutation({
        snapshot: this.buildLibrarySnapshotPayload(),
        action: {
          type: 'createCollection',
          label,
        },
      })
      const resultState = buildReferenceCollectionMutationResultState(mutation)
      if (resultState.changed) {
        await commitReferenceMutationSnapshot(this, projectRoot, mutation)
      }
      return resultState.collection
    },

    async renameCollection(projectRoot = '', collectionKey = '', nextLabel = '') {
      const mutation = await applyReferenceMutation({
        snapshot: this.buildLibrarySnapshotPayload(),
        action: {
          type: 'renameCollection',
          collectionKey,
          nextLabel,
        },
      })
      const resultState = buildReferenceCollectionMutationResultState(mutation)
      if (resultState.changed) {
        await commitReferenceMutationSnapshot(this, projectRoot, mutation)
      }
      return resultState.collection
    },

    async removeCollection(projectRoot = '', collectionKey = '') {
      const mutation = await applyReferenceMutation({
        snapshot: this.buildLibrarySnapshotPayload(),
        action: {
          type: 'removeCollection',
          collectionKey,
        },
      })
      const resultState = buildReferenceRemoveCollectionMutationResultState(mutation)
      if (!resultState.removed) return false

      await commitReferenceMutationSnapshot(this, projectRoot, mutation, {
        preferredSelectedReferenceId: this.selectedReferenceId,
      })
      return true
    },

    async setSelectedSection(sectionKey) {
      const selection = buildReferenceSectionSelectionState(this.$state, sectionKey)
      this.selectedSectionKey = selection.selectedSectionKey
      this.selectedSourceKey = selection.selectedSourceKey
      this.selectedCollectionKey = selection.selectedCollectionKey
      this.selectedTagKey = selection.selectedTagKey
      await this.syncResolvedQueryState()
    },

    async setSelectedSource(sourceKey = '') {
      const selection = buildReferenceSourceSelectionState(this.$state, sourceKey)
      this.selectedSectionKey = selection.selectedSectionKey
      this.selectedSourceKey = selection.selectedSourceKey
      this.selectedCollectionKey = selection.selectedCollectionKey
      this.selectedTagKey = selection.selectedTagKey
      await this.syncResolvedQueryState()
    },

    async setSelectedCollection(collectionKey = '') {
      const selection = buildReferenceCollectionSelectionState(this.$state, collectionKey)
      this.selectedSectionKey = selection.selectedSectionKey
      this.selectedSourceKey = selection.selectedSourceKey
      this.selectedCollectionKey = selection.selectedCollectionKey
      this.selectedTagKey = selection.selectedTagKey
      await this.syncResolvedQueryState()
    },

    async setSelectedTag(tagKey = '') {
      const selection = buildReferenceTagSelectionState(this.$state, tagKey)
      this.selectedSectionKey = selection.selectedSectionKey
      this.selectedSourceKey = selection.selectedSourceKey
      this.selectedCollectionKey = selection.selectedCollectionKey
      this.selectedTagKey = selection.selectedTagKey
      await this.syncResolvedQueryState()
    },

    async setSortKey(value = '') {
      const selection = buildReferenceSortSelectionState(value)
      this.sortKey = selection.sortKey
      await this.syncResolvedQueryState()
    },

    async setCitationStyle(style = 'apa') {
      const normalized = String(style || '').trim()
      const info = normalized ? await getCitationStyleInfo(normalized) : null
      this.citationStyle = resolveReferenceCitationStyleId(normalized, Boolean(info))
    },

    selectReference(referenceId) {
      this.selectedReferenceId = resolveReferenceSelectionId(
        this.references,
        referenceId,
        this.selectedReferenceId
      )
    },

    openReferenceDockPdf(referenceId = this.selectedReferenceId) {
      const dockPdfState = buildReferenceDockPdfOpenState(referenceId)
      if (!dockPdfState.canOpen) return false
      this.referenceDockPdfOpen = dockPdfState.referenceDockPdfOpen
      this.referenceDockPdfReferenceId = dockPdfState.referenceDockPdfReferenceId
      return true
    },

    closeReferenceDockPdf(referenceId = this.referenceDockPdfReferenceId) {
      const dockPdfState = buildReferenceDockPdfCloseState(this.$state, referenceId)
      this.referenceDockPdfOpen = dockPdfState.referenceDockPdfOpen
      this.referenceDockPdfReferenceId = dockPdfState.referenceDockPdfReferenceId
    },

    resetReferenceDockTabs() {
      const dockPdfState = buildReferenceDockPdfResetState()
      this.referenceDockPdfOpen = dockPdfState.referenceDockPdfOpen
      this.referenceDockPdfReferenceId = dockPdfState.referenceDockPdfReferenceId
    },

    getByKey(referenceKey = '') {
      return resolveReferenceByKey(this.references, referenceKey)
    },

    getDocumentReferenceIds(texPath = '') {
      return resolveDocumentReferenceIds(this.documentReferenceSelections, texPath)
    },

    documentReferencesForTex(texPath = '') {
      return resolveDocumentReferences(this.documentReferenceSelections, this.references, texPath)
    },

    getDocumentReferenceByKey(texPath = '', referenceKey = '') {
      return resolveDocumentReferenceByKey(
        this.documentReferenceSelections,
        this.references,
        texPath,
        referenceKey
      )
    },

    isReferenceSelectedForTex(texPath = '', referenceIdOrKey = '') {
      return isReferenceSelectedForDocument(
        this.documentReferenceSelections,
        this.references,
        texPath,
        referenceIdOrKey
      )
    },

    searchAvailableReferencesForDocument(texPath = '', query = '') {
      return resolveAvailableDocumentReferences(
        this.documentReferenceSelections,
        this.sortedLibrary,
        texPath,
        query
      )
    },

    async setDocumentReferenceIds(projectRoot = '', texPath = '', referenceIds = []) {
      const nextState = buildDocumentReferenceIdsMutationState(texPath, referenceIds)
      if (!nextState.canMutate) return false
      const mutation = await applyReferenceMutation({
        snapshot: this.buildLibrarySnapshotPayload(),
        action: {
          type: 'setDocumentReferenceIds',
          texPath: nextState.texPath,
          referenceIds: nextState.referenceIds,
        },
      })
      await commitReferenceMutationSnapshot(this, projectRoot, mutation, {
        preferredSelectedReferenceId: this.selectedReferenceId,
      })
      return buildReferenceDocumentIdsMutationResultState(mutation).changed
    },

    async addDocumentReference(projectRoot = '', texPath = '', referenceId = '') {
      const nextState = buildAddDocumentReferenceMutationState(
        this.documentReferenceSelections,
        this.references,
        texPath,
        referenceId
      )
      if (!nextState.canMutate) return false
      return this.setDocumentReferenceIds(projectRoot, nextState.texPath, nextState.referenceIds)
    },

    async removeDocumentReference(projectRoot = '', texPath = '', referenceId = '') {
      const nextState = buildRemoveDocumentReferenceMutationState(
        this.documentReferenceSelections,
        texPath,
        referenceId
      )
      if (!nextState.canMutate) return false
      return this.setDocumentReferenceIds(projectRoot, nextState.texPath, nextState.referenceIds)
    },

    searchRefs(query = '') {
      return searchReferences(this.sortedLibrary, query)
    },

    async addReference(projectRoot = '', reference = {}, options = {}) {
      const {
        markForZoteroPush = true,
        persist = true,
      } = options
      const mutation = await applyReferenceMutation({
        snapshot: this.buildLibrarySnapshotPayload(),
        action: {
          type: 'addReference',
          reference,
          markForZoteroPush,
        },
      })
      const resultState = buildReferenceAddMutationResultState(this.references, mutation)

      await commitReferenceMutationSnapshot(this, projectRoot, mutation, {
        persist,
        preferredSelectedReferenceId: resultState.selectedReferenceId,
      })
      return buildReferenceAddMutationResultState(this.references, mutation).selectedReference
    },

    async updateReference(projectRoot = '', referenceId = '', updates = {}, options = {}) {
      const { persist = true, preferredSelectedReferenceId = undefined } = options
      const mutation = await applyReferenceMutation({
        snapshot: this.buildLibrarySnapshotPayload(),
        action: {
          type: 'updateReference',
          referenceId,
          updates,
        },
      })
      const resultState = buildReferenceUpdateMutationResultState(mutation)
      if (!resultState.changed) return false
      const commitState = buildReferenceUpdateMutationCommitState(this.$state, mutation, {
        preferredSelectedReferenceId,
      })

      await commitReferenceMutationSnapshot(this, projectRoot, mutation, {
        persist,
        preferredSelectedReferenceId: commitState.preferredSelectedReferenceId,
      })
      return true
    },

    async refreshReferenceMetadata(projectRoot = '', referenceId = '') {
      const targetState = buildReferenceMetadataRefreshTargetState(this.references, referenceId)
      if (!targetState.canRefresh) return null

      const refreshed = await refreshReferenceMetadataWithBackend(targetState.reference)
      if (!refreshed || typeof refreshed !== 'object') return null

      await this.updateReference(projectRoot, targetState.referenceId, refreshed, {
        preferredSelectedReferenceId: targetState.referenceId,
      })
      return refreshed
    },

    async removeReference(projectRoot = '', referenceId = '') {
      const targetState = buildReferenceRemoveTargetState(this.references, referenceId)
      if (!targetState.canRemove) return false

      const mutation = await applyReferenceMutation({
        snapshot: this.buildLibrarySnapshotPayload(),
        action: {
          type: 'removeReference',
          referenceId: targetState.referenceId,
        },
      })
      const resultState = buildReferenceRemoveMutationResultState(mutation)
      if (!resultState.removed) return false
      const commitState = buildReferenceRemoveMutationCommitState(this.$state, targetState.referenceId)

      await commitReferenceMutationSnapshot(this, projectRoot, mutation, {
        preferredSelectedReferenceId: commitState.preferredSelectedReferenceId,
      })

      if (targetState.targetReference._pushedByApp && targetState.targetReference._zoteroKey) {
        deleteFromZotero(targetState.targetReference)
          .then(() => {
            this.zoteroMutationError = ''
          })
          .catch((error) => {
            this.zoteroMutationError =
              error?.message || String(error || t('Failed to delete reference from Zotero'))
          })
      }
      return true
    },

    async toggleReferenceCollection(projectRoot = '', referenceId = '', collectionKey = '') {
      const mutation = await applyReferenceMutation({
        snapshot: this.buildLibrarySnapshotPayload(),
        action: {
          type: 'toggleReferenceCollection',
          referenceId,
          collectionKey,
        },
      })
      const resultState = buildReferenceToggleCollectionMutationResultState(mutation)
      if (!resultState.changed) return false

      await commitReferenceMutationSnapshot(this, projectRoot, mutation, {
        preferredSelectedReferenceId: this.selectedReferenceId,
      })
      return resultState.toggledOn
    },

    async attachReferencePdf(projectRoot = '', referenceId = '', sourcePath = '') {
      const targetState = buildReferencePdfAssetTargetState(this.references, referenceId)
      if (!targetState.canUpdate) return null

      const updatedReference = await storeReferencePdf(
        projectRoot,
        targetState.targetReference,
        sourcePath
      )

      await this.updateReference(projectRoot, targetState.referenceId, updatedReference, {
        preferredSelectedReferenceId: targetState.referenceId,
      })
      return buildReferencePdfAssetResultState(
        this.references,
        targetState.referenceId,
        updatedReference,
      ).reference
    },

    async renameReferencePdfAsset(projectRoot = '', referenceId = '', nextBaseName = '') {
      const targetState = buildReferencePdfAssetTargetState(this.references, referenceId)
      if (!targetState.canUpdate) return null

      const updatedReference = await renameReferencePdfAssetWithBackend(
        projectRoot,
        targetState.targetReference,
        nextBaseName
      )

      await this.updateReference(projectRoot, targetState.referenceId, updatedReference, {
        preferredSelectedReferenceId: targetState.referenceId,
      })
      return buildReferencePdfAssetResultState(
        this.references,
        targetState.referenceId,
        updatedReference,
      ).reference
    },

    async importReferencePdf(projectRoot = '', sourcePath = '') {
      this.importInFlight = true
      try {
        const importedReference = await importReferenceFromPdf(sourcePath)
        if (!importedReference) return null

        const importMutation = await applyReferenceMutation({
          globalConfigDir: projectRoot,
          snapshot: this.buildLibrarySnapshotPayload(),
          action: {
            type: 'importPdfReference',
            reference: importedReference,
            markForZoteroPush: true,
          },
        })

        const importTarget = buildReferencePdfImportTargetState(
          importMutation,
          this.buildLibrarySnapshotPayload()
        )
        if (!importTarget.canImport) return null

        const hydratedReference = await storeReferencePdf(
          projectRoot,
          importTarget.targetReference,
          sourcePath
        )
        const assetMutation = await applyReferenceMutation({
          globalConfigDir: projectRoot,
          snapshot: importTarget.importedSnapshot,
          action: {
            type: 'updateReference',
            referenceId: importTarget.selectedReferenceId,
            updates: hydratedReference,
          },
        })

        await commitReferenceMutationSnapshot(this, projectRoot, assetMutation, {
          fallbackSnapshot: importTarget.importedSnapshot,
          preferredSelectedReferenceId: importTarget.selectedReferenceId,
        })
        return buildReferencePdfImportResultState(this.references, importTarget).selectedReference
      } finally {
        this.importInFlight = false
      }
    },

    async exportBibTeXAsync(referenceIds = []) {
      const references = resolveReferencesForExport(this.references, referenceIds)
      return exportReferencesToBibTeX(references)
    },

    async writeBibTeXExportFile(filePath = '', referenceIds = []) {
      const references = resolveReferencesForExport(this.references, referenceIds)
      await writeReferenceBibTeXExport(filePath, references)
      return references.length
    },

    async writeReferenceJsonExportFile(filePath = '', referenceId = '') {
      const targetState = buildReferenceJsonExportTargetState(this.references, referenceId)
      if (!targetState.canExport) {
        throw new Error(t('Reference not found'))
      }

      await writeReferenceJsonExport(filePath, targetState.reference)
      return true
    },

    async syncZoteroNow(projectRoot = '') {
      this.zoteroSyncStatus = 'syncing'
      this.zoteroSyncError = ''
      this.zoteroSyncErrorType = ''

      try {
        const result = await syncZoteroNowWithBackend(projectRoot, {
          snapshot: this.buildLibrarySnapshotPayload(),
          selectedReferenceId: this.selectedReferenceId,
        })

        const syncState = buildReferenceZoteroSyncResultState(result, {
          fallbackLastSyncTime: new Date().toISOString(),
        })
        if (syncState.skipped) {
          this.zoteroSyncStatus = syncState.zoteroSyncStatus
          this.zoteroSyncLastSyncTime = syncState.zoteroSyncLastSyncTime
          return syncState.counts
        }

        await this.applyLibrarySnapshot(syncState.snapshot)
        if (syncState.selectedReferenceId) {
          this.selectedReferenceId = syncState.selectedReferenceId
        }

        this.zoteroSyncStatus = syncState.zoteroSyncStatus
        this.zoteroSyncLastSyncTime = syncState.zoteroSyncLastSyncTime
        this.zoteroSyncError = ''
        this.zoteroSyncErrorType = ''
        return syncState.counts
      } catch (error) {
        this.zoteroSyncStatus = 'error'
        this.zoteroSyncError = error?.message || String(error)
        this.zoteroSyncErrorType = classifyZoteroSyncError(error)
        throw error
      }
    },

    async connectZotero(apiKey = '') {
      return connectZoteroAccount(apiKey)
    },

    async disconnectZotero() {
      await disconnectZoteroWithBackend()
      this.zoteroSyncStatus = 'disconnected'
      this.zoteroSyncLastSyncTime = ''
      this.zoteroSyncError = ''
      this.zoteroSyncErrorType = ''
    },

    async loadZoteroSettingsState() {
      const state = await loadZoteroAccountState()
      return {
        config: state?.config || {},
        hasApiKey: Boolean(state?.hasApiKey),
      }
    },

    async saveZoteroSettingsConfig(config = {}) {
      return saveZoteroConfig(config)
    },

    async loadZoteroRemoteLibraries(config = {}) {
      return loadRemoteLibraries(config)
    },

    async formatReferenceCitationAsync(referenceId = '', mode = 'reference', number) {
      const targetState = buildReferenceCitationFormatTargetState(this.references, referenceId)
      if (!targetState.canFormat) return ''
      return formatCitation(this.citationStyle, mode, targetState.reference, number, resolveReferenceWorkspacePath())
    },

    cleanup() {
      Object.assign(this, buildReferenceStoreCleanupState(this.$state, REFERENCE_STORE_DEFAULTS))
    },
  },
})
