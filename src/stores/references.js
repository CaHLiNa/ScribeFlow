import { defineStore, getActivePinia } from 'pinia'
import { t } from '../i18n/index.js'
import { useWorkspaceStore } from './workspace.js'
import { formatReferenceCitationById } from '../services/references/citationFormatter.js'
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
  buildReferenceLibrarySnapshotPayloadWithBackend,
  buildReferenceStoreStateWithBackend,
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
  resolveReferenceCitationStyleId,
  resolveReferenceWorkspaceCitationStyles,
  buildReferenceDockPdfCloseState,
  buildReferenceDockPdfOpenState,
  buildReferenceDockPdfResetState,
  buildReferenceDockPdfSnapshotState,
  isReferenceDockPdfSelected,
  isReferenceSelectedForDocument,
  buildReferenceStoreInitialState,
  resolveAvailableDocumentReferences,
  resolveDocumentReferenceByKey,
  resolveDocumentReferenceIds,
  resolveDocumentReferences,
  resolveReferenceByKey,
  resolveReferenceById,
  resolveReferenceCitationUsageKeys,
  resolveReferenceResolvedQueryState,
  resolveSelectedReference,
  buildReferenceQuerySelectionState,
  searchReferences,
} from '../domains/references/referenceStoreState.js'
import { classifyZoteroSyncError } from '../domains/references/zoteroSyncPresentation.js'

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
  const snapshot = mutation?.snapshot || fallbackSnapshot || await store.buildLibrarySnapshotPayload()
  return store.commitLibrarySnapshot(projectRoot, snapshot, commitOptions)
}

async function commitImportedReferences(store, projectRoot = '', importedReferences = []) {
  const mutation = await applyReferenceMutation({
    snapshot: await store.buildLibrarySnapshotPayload(),
    selectedReferenceId: store.selectedReferenceId,
    action: {
      type: 'mergeImportedReferences',
      imported: importedReferences,
      markForZoteroPush: true,
    },
  })
  if (mutation?.result?.emptyImport === true) return mutation.result

  await commitReferenceMutationSnapshot(store, projectRoot, mutation, {
    preferredSelectedReferenceId: mutation?.result?.preferredSelectedReferenceId || '',
  })
  return mutation?.result || null
}

export const useReferencesStore = defineStore('references', {
  state: () => buildReferenceStoreInitialState(),

  getters: {
    sectionCounts: (state) => state.resolvedQueryState?.sectionCounts || {},

    sourceCounts: (state) => state.resolvedQueryState?.sourceCounts || {},

    collectionCounts: (state) => state.resolvedQueryState?.collectionCounts || {},

    selectedCollection: (state) => state.resolvedQueryState?.selectedCollection || null,

    tagCounts: (state) => state.resolvedQueryState?.tagCounts || {},

    selectedTag: (state) => state.resolvedQueryState?.selectedTag || null,

    filteredReferences: (state) => state.resolvedQueryState?.filteredReferences || [],

    selectedReference(state) {
      return resolveSelectedReference(state.resolvedQueryState)
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
      return resolveReferenceCitationUsageKeys(this.citedIn)
    },
  },

  actions: {
    async buildLibrarySnapshotPayload() {
      return buildReferenceLibrarySnapshotPayloadWithBackend(this.$state)
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
      await this.applyLibrarySnapshot(nextSnapshot, {
        preferredSelectedReferenceId,
        normalized: true,
      })
      return nextSnapshot
    },

    async buildStoreStateWithBackend(snapshot = {}, options = {}) {
      const pinia = getActivePinia()
      const fileContents = pinia?.state?.value?.files?.fileContents || {}
      return buildReferenceStoreStateWithBackend({
        snapshot,
        state: this.$state,
        preferredSelectedReferenceId: options.preferredSelectedReferenceId || '',
        fileContents,
      })
    },

    applyBuiltStoreState(builtState = {}) {
      this.librarySections = builtState?.librarySections || []
      this.sourceSections = builtState?.sourceSections || []
      this.collections = builtState?.collections || []
      this.tags = builtState?.tags || []
      this.references = builtState?.references || []
      this.documentReferenceSelections = builtState?.documentReferenceSelections || {}
      this.citationStyle = builtState?.citationStyle || ''
      this.selectedSectionKey = builtState?.selectedSectionKey || ''
      this.selectedSourceKey = builtState?.selectedSourceKey || ''
      this.selectedCollectionKey = builtState?.selectedCollectionKey || ''
      this.selectedTagKey = builtState?.selectedTagKey || ''
      this.sortKey = builtState?.sortKey || ''
      this.selectedReferenceId = builtState?.selectedReferenceId || ''
      this.resolvedQueryState = resolveReferenceResolvedQueryState(
        builtState?.resolvedQueryState,
        this.$state,
      )
    },

    async hydrateStoreState() {
      const builtState = await this.buildStoreStateWithBackend({})
      this.applyBuiltStoreState(builtState)
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
        documentReferenceSelections: this.documentReferenceSelections,
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
      await this.refreshResolvedQueryState()
    },

    async persistLibrarySnapshot(projectRoot = '') {
      return this.commitLibrarySnapshot(projectRoot, await this.buildLibrarySnapshotPayload())
    },

    async applyLibrarySnapshot(snapshot = {}, options = {}) {
      const {
        preferredSelectedReferenceId = null,
      } = options
      const builtState = await this.buildStoreStateWithBackend(snapshot, {
        preferredSelectedReferenceId,
      })
      this.applyBuiltStoreState(builtState)
      const dockPdfState = buildReferenceDockPdfSnapshotState({
        ...this.$state,
        referenceDockActivePage: useWorkspaceStore().referenceDockActivePage,
      })
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
        await this.applyLibrarySnapshot(snapshot, { normalized: true })
        await this.loadWorkspaceCitationStyles()
        this.availableCitationStylesList = await getAvailableCitationStyles().catch(() => [])
      } catch (error) {
        this.loadError = error?.message || t('Failed to load reference library')
        await this.applyLibrarySnapshot({})
        setUserCitationStyles([])
      } finally {
        this.isLoading = false
      }
    },

    async applyWorkspaceLibraryBootstrap(snapshot = {}, referenceStyles = []) {
      await this.applyLibrarySnapshot(snapshot)
      setUserCitationStyles(resolveReferenceWorkspaceCitationStyles(referenceStyles))
      return await this.buildLibrarySnapshotPayload()
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
        return commitImportedReferences(this, projectRoot, importedReferences)
      } finally {
        this.importInFlight = false
      }
    },

    async createCollection(projectRoot = '', label = '') {
      const mutation = await applyReferenceMutation({
        snapshot: await this.buildLibrarySnapshotPayload(),
        selectedReferenceId: this.selectedReferenceId,
        action: {
          type: 'createCollection',
          label,
        },
      })
      if (mutation?.result?.changed === true) {
        await commitReferenceMutationSnapshot(this, projectRoot, mutation)
      }
      return mutation?.result?.collection || null
    },

    async renameCollection(projectRoot = '', collectionKey = '', nextLabel = '') {
      const mutation = await applyReferenceMutation({
        snapshot: await this.buildLibrarySnapshotPayload(),
        selectedReferenceId: this.selectedReferenceId,
        action: {
          type: 'renameCollection',
          collectionKey,
          nextLabel,
        },
      })
      if (mutation?.result?.changed === true) {
        await commitReferenceMutationSnapshot(this, projectRoot, mutation)
      }
      return mutation?.result?.collection || null
    },

    async removeCollection(projectRoot = '', collectionKey = '') {
      const mutation = await applyReferenceMutation({
        snapshot: await this.buildLibrarySnapshotPayload(),
        selectedReferenceId: this.selectedReferenceId,
        action: {
          type: 'removeCollection',
          collectionKey,
        },
      })
      if (mutation?.result?.removed !== true) return false

      await commitReferenceMutationSnapshot(this, projectRoot, mutation, {
        preferredSelectedReferenceId: this.selectedReferenceId,
      })
      return true
    },

    async setSelectedSection(sectionKey) {
      this.selectedSectionKey = String(sectionKey ?? '')
      this.selectedSourceKey = ''
      this.selectedCollectionKey = ''
      this.selectedTagKey = ''
      await this.refreshResolvedQueryState()
    },

    async setSelectedSource(sourceKey = '') {
      this.selectedSectionKey = 'all'
      this.selectedSourceKey = String(sourceKey ?? '')
      this.selectedCollectionKey = ''
      this.selectedTagKey = ''
      await this.refreshResolvedQueryState()
    },

    async setSelectedCollection(collectionKey = '') {
      this.selectedSectionKey = 'all'
      this.selectedSourceKey = ''
      this.selectedCollectionKey = String(collectionKey ?? '')
      this.selectedTagKey = ''
      await this.refreshResolvedQueryState()
    },

    async setSelectedTag(tagKey = '') {
      this.selectedSectionKey = 'all'
      this.selectedSourceKey = ''
      this.selectedCollectionKey = ''
      this.selectedTagKey = String(tagKey ?? '')
      await this.refreshResolvedQueryState()
    },

    async setSortKey(value = '') {
      this.sortKey = String(value ?? '')
      await this.refreshResolvedQueryState()
    },

    async setCitationStyle(style = 'apa') {
      const normalized = String(style || '').trim()
      const info = normalized ? await getCitationStyleInfo(normalized) : null
      this.citationStyle = resolveReferenceCitationStyleId(normalized, Boolean(info))
    },

    selectReference(referenceId) {
      this.selectedReferenceId = String(referenceId ?? '')
      const selectedReference = resolveReferenceById(
        this.resolvedQueryState,
        this.selectedReferenceId
      )
      if (selectedReference) {
        this.resolvedQueryState = {
          ...this.resolvedQueryState,
          query: {
            ...(this.resolvedQueryState?.query || {}),
            selectedReferenceId: this.selectedReferenceId,
          },
          selectedReferenceId: this.selectedReferenceId,
          selectedReference,
        }
      }
      void this.refreshResolvedQueryState()
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
      return resolveReferenceByKey(this.resolvedQueryState, referenceKey)
    },

    getDocumentReferenceIds(texPath = '') {
      return resolveDocumentReferenceIds(this.resolvedQueryState, texPath)
    },

    documentReferencesForTex(texPath = '') {
      return resolveDocumentReferences(this.resolvedQueryState, texPath)
    },

    getDocumentReferenceByKey(texPath = '', referenceKey = '') {
      return resolveDocumentReferenceByKey(
        this.resolvedQueryState,
        texPath,
        referenceKey
      )
    },

    isReferenceSelectedForTex(texPath = '', referenceIdOrKey = '') {
      return isReferenceSelectedForDocument(
        this.resolvedQueryState,
        texPath,
        referenceIdOrKey
      )
    },

    searchAvailableReferencesForDocument(texPath = '', query = '') {
      return resolveAvailableDocumentReferences(
        this.resolvedQueryState,
        texPath,
        query
      )
    },

    async setDocumentReferenceIds(projectRoot = '', texPath = '', referenceIds = []) {
      const mutation = await applyReferenceMutation({
        snapshot: await this.buildLibrarySnapshotPayload(),
        selectedReferenceId: this.selectedReferenceId,
        action: {
          type: 'setDocumentReferenceIds',
          texPath,
          referenceIds,
        },
      })
      if (mutation?.result?.changed !== true) return false

      await commitReferenceMutationSnapshot(this, projectRoot, mutation, {
        preferredSelectedReferenceId: this.selectedReferenceId,
      })
      return true
    },

    async addDocumentReference(projectRoot = '', texPath = '', referenceId = '') {
      const mutation = await applyReferenceMutation({
        snapshot: await this.buildLibrarySnapshotPayload(),
        selectedReferenceId: this.selectedReferenceId,
        action: {
          type: 'addDocumentReference',
          texPath,
          referenceId,
        },
      })
      if (mutation?.result?.changed !== true) return false

      await commitReferenceMutationSnapshot(this, projectRoot, mutation, {
        preferredSelectedReferenceId: this.selectedReferenceId,
      })
      return true
    },

    async removeDocumentReference(projectRoot = '', texPath = '', referenceId = '') {
      const mutation = await applyReferenceMutation({
        snapshot: await this.buildLibrarySnapshotPayload(),
        selectedReferenceId: this.selectedReferenceId,
        action: {
          type: 'removeDocumentReference',
          texPath,
          referenceId,
        },
      })
      if (mutation?.result?.changed !== true) return false

      await commitReferenceMutationSnapshot(this, projectRoot, mutation, {
        preferredSelectedReferenceId: this.selectedReferenceId,
      })
      return true
    },

    searchRefs(query = '') {
      return searchReferences(this.resolvedQueryState, query)
    },

    async addReference(projectRoot = '', reference = {}, options = {}) {
      const {
        markForZoteroPush = true,
        persist = true,
      } = options
      const mutation = await applyReferenceMutation({
        snapshot: await this.buildLibrarySnapshotPayload(),
        selectedReferenceId: this.selectedReferenceId,
        action: {
          type: 'addReference',
          reference,
          markForZoteroPush,
        },
      })

      await commitReferenceMutationSnapshot(this, projectRoot, mutation, {
        persist,
        preferredSelectedReferenceId: mutation?.result?.preferredSelectedReferenceId || '',
      })
      return mutation?.result?.selectedReference || null
    },

    async updateReference(projectRoot = '', referenceId = '', updates = {}, options = {}) {
      const { persist = true, preferredSelectedReferenceId = undefined } = options
      const mutation = await applyReferenceMutation({
        snapshot: await this.buildLibrarySnapshotPayload(),
        selectedReferenceId: this.selectedReferenceId,
        action: {
          type: 'updateReference',
          referenceId,
          updates,
        },
      })
      if (mutation?.result?.changed !== true) return false

      await commitReferenceMutationSnapshot(this, projectRoot, mutation, {
        persist,
        preferredSelectedReferenceId: preferredSelectedReferenceId !== undefined
          ? String(preferredSelectedReferenceId || '')
          : mutation?.result?.preferredSelectedReferenceId || '',
      })
      return true
    },

    async refreshReferenceMetadata(projectRoot = '', referenceId = '') {
      const refreshed = await refreshReferenceMetadataWithBackend({
        references: this.references,
        referenceId,
      })
      if (!refreshed || typeof refreshed !== 'object') return null
      const refreshedReferenceId = refreshed.id || ''
      if (!refreshedReferenceId) return null

      await this.updateReference(projectRoot, refreshedReferenceId, refreshed, {
        preferredSelectedReferenceId: refreshedReferenceId,
      })
      return refreshed
    },

    async removeReference(projectRoot = '', referenceId = '') {
      const mutation = await applyReferenceMutation({
        snapshot: await this.buildLibrarySnapshotPayload(),
        selectedReferenceId: this.selectedReferenceId,
        action: {
          type: 'removeReference',
          referenceId,
        },
      })
      if (mutation?.result?.removed !== true) return false

      await commitReferenceMutationSnapshot(this, projectRoot, mutation, {
        preferredSelectedReferenceId: mutation?.result?.preferredSelectedReferenceId || '',
      })

      const zoteroDeleteReference = mutation?.result?.zoteroDeleteReference
      if (zoteroDeleteReference && typeof zoteroDeleteReference === 'object') {
        deleteFromZotero(zoteroDeleteReference)
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
        snapshot: await this.buildLibrarySnapshotPayload(),
        selectedReferenceId: this.selectedReferenceId,
        action: {
          type: 'toggleReferenceCollection',
          referenceId,
          collectionKey,
        },
      })
      if (mutation?.result?.changed !== true) return false

      await commitReferenceMutationSnapshot(this, projectRoot, mutation, {
        preferredSelectedReferenceId: this.selectedReferenceId,
      })
      return mutation?.result?.toggledOn === true
    },

    async attachReferencePdf(projectRoot = '', referenceId = '', sourcePath = '') {
      let updatedReference = null
      try {
        updatedReference = await storeReferencePdf(projectRoot, {}, sourcePath, {
          references: this.references,
          referenceId,
        })
      } catch (error) {
        if (String(error?.message || error) === 'Reference not found') return null
        throw error
      }

      const targetReferenceId = updatedReference?.id || referenceId
      const changed = await this.updateReference(projectRoot, targetReferenceId, updatedReference, {
        preferredSelectedReferenceId: targetReferenceId,
      })
      return changed ? updatedReference : null
    },

    async renameReferencePdfAsset(projectRoot = '', referenceId = '', nextBaseName = '') {
      let updatedReference = null
      try {
        updatedReference = await renameReferencePdfAssetWithBackend(projectRoot, {}, nextBaseName, {
          references: this.references,
          referenceId,
        })
      } catch (error) {
        if (String(error?.message || error) === 'Reference not found') return null
        throw error
      }

      const targetReferenceId = updatedReference?.id || referenceId
      const changed = await this.updateReference(projectRoot, targetReferenceId, updatedReference, {
        preferredSelectedReferenceId: targetReferenceId,
      })
      return changed ? updatedReference : null
    },

    async importReferencePdf(projectRoot = '', sourcePath = '') {
      this.importInFlight = true
      try {
        const importedReference = await importReferenceFromPdf(sourcePath)
        if (!importedReference) return null

        const importMutation = await applyReferenceMutation({
          globalConfigDir: projectRoot,
          snapshot: await this.buildLibrarySnapshotPayload(),
          selectedReferenceId: this.selectedReferenceId,
          action: {
            type: 'importPdfReference',
            reference: importedReference,
            markForZoteroPush: true,
          },
        })

        const importResult = importMutation?.result || {}
        const importedSnapshot = importMutation?.snapshot || await this.buildLibrarySnapshotPayload()
        const selectedReferenceId = importResult.selectedReferenceId || ''
        if (!selectedReferenceId) return null

        let hydratedReference = null
        try {
          hydratedReference = await storeReferencePdf(projectRoot, {}, sourcePath, {
            references: importedSnapshot?.references,
            referenceId: selectedReferenceId,
          })
        } catch (error) {
          if (String(error?.message || error) === 'Reference not found') return null
          throw error
        }
        const assetMutation = await applyReferenceMutation({
          globalConfigDir: projectRoot,
          snapshot: importedSnapshot,
          selectedReferenceId: this.selectedReferenceId,
          action: {
            type: 'updateReference',
            referenceId: selectedReferenceId,
            updates: hydratedReference,
          },
        })

        await commitReferenceMutationSnapshot(this, projectRoot, assetMutation, {
          fallbackSnapshot: importedSnapshot,
          preferredSelectedReferenceId: assetMutation?.result?.preferredSelectedReferenceId ||
            importResult.preferredSelectedReferenceId ||
            selectedReferenceId,
        })
        return assetMutation?.result?.selectedReference || hydratedReference
      } finally {
        this.importInFlight = false
      }
    },

    async exportBibTeXAsync(referenceIds = []) {
      return exportReferencesToBibTeX(this.references, referenceIds)
    },

    async writeBibTeXExportFile(filePath = '', referenceIds = []) {
      return writeReferenceBibTeXExport(filePath, this.references, referenceIds)
    },

    async writeReferenceJsonExportFile(filePath = '', referenceId = '') {
      try {
        await writeReferenceJsonExport(filePath, this.references, referenceId)
      } catch (error) {
        if (String(error?.message || error) === 'Reference not found') {
          throw new Error(t('Reference not found'))
        }
        throw error
      }
      return true
    },

    async syncZoteroNow(projectRoot = '') {
      this.zoteroSyncStatus = 'syncing'
      this.zoteroSyncError = ''
      this.zoteroSyncErrorType = ''

      try {
        const result = await syncZoteroNowWithBackend(projectRoot, {
          snapshot: await this.buildLibrarySnapshotPayload(),
          selectedReferenceId: this.selectedReferenceId,
        })

        const syncState = result || {}
        if (syncState.skipped) {
          this.zoteroSyncStatus = syncState.zoteroSyncStatus
          this.zoteroSyncLastSyncTime = syncState.zoteroSyncLastSyncTime
          return syncState.counts
        }

        await this.applyLibrarySnapshot(syncState.snapshot, {
          normalized: true,
          preferredSelectedReferenceId: syncState.selectedReferenceId || null,
        })

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
      return formatReferenceCitationById(
        this.citationStyle,
        mode,
        this.references,
        referenceId,
        number,
        resolveReferenceWorkspacePath(),
      )
    },

    async cleanup() {
      this.selectedSectionKey = ''
      this.selectedSourceKey = ''
      this.selectedCollectionKey = ''
      this.selectedTagKey = ''
      this.selectedReferenceId = ''
      this.referenceDockPdfOpen = false
      this.referenceDockPdfReferenceId = ''
      this.sortKey = ''
      this.isLoading = false
      this.loadError = ''
      this.zoteroMutationError = ''
      this.importInFlight = false

      await this.applyLibrarySnapshot({}, {
        preferredSelectedReferenceId: '',
      })
    },
  },
})
