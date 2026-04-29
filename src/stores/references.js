import { defineStore, getActivePinia } from 'pinia'
import { t } from '../i18n/index.js'
import { useWorkspaceStore } from './workspace.js'
import { formatCitation } from '../services/references/citationFormatter.js'
import {
  getAvailableCitationStyles,
  getCitationStyleInfo,
  setUserCitationStyles,
} from '../services/references/citationStyleRegistry.js'
import { exportReferencesToBibTeX } from '../services/references/bibtexExport.js'
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
  findDuplicateReference,
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
import { deleteFromZotero, loadZoteroConfig } from '../services/references/zoteroSync.js'
import {
  REFERENCE_DOCK_DETAILS_PAGE,
  REFERENCE_DOCK_PDF_PAGE,
} from '../domains/references/referenceDockPages.js'

function normalizeCollectionMembershipValue(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeTagKey(value = '') {
  return String(value || '').trim().toLowerCase()
}

function resolveCollection(collections = [], collectionKey = '') {
  const normalizedKey = normalizeCollectionMembershipValue(collectionKey)
  if (!normalizedKey) return null

  return (
    collections.find((collection) => normalizeCollectionMembershipValue(collection.key) === normalizedKey) ||
    collections.find((collection) => normalizeCollectionMembershipValue(collection.label) === normalizedKey) ||
    null
  )
}

function normalizeDocumentReferenceSelectionsForReferences(value = {}, references = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const validReferenceIds = new Set(
    (Array.isArray(references) ? references : [])
      .map((reference) => String(reference?.id || '').trim())
      .filter(Boolean)
  )

  return Object.fromEntries(
    Object.entries(value)
      .map(([texPath, referenceIds]) => {
        const normalizedTexPath = String(texPath || '').trim()
        if (!normalizedTexPath || !Array.isArray(referenceIds)) return null
        const ids = Array.from(
          new Set(
            referenceIds
              .map((referenceId) => String(referenceId || '').trim())
              .filter((referenceId) => validReferenceIds.has(referenceId))
          )
        )
        return ids.length > 0 ? [normalizedTexPath, ids] : null
      })
      .filter(Boolean)
  )
}

async function shouldMarkReferenceForZoteroPush() {
  try {
    const config = await loadZoteroConfig()
    return Boolean(config?.pushTarget)
  } catch {
    return false
  }
}

async function resolveReferenceStorageRoot(projectRoot = '') {
  const normalizedRoot = String(projectRoot || '').trim()
  if (normalizedRoot) return normalizedRoot

  const workspace = useWorkspaceStore()
  return String(await workspace.ensureGlobalConfigDir() || '').trim()
}

function buildDefaultResolvedQueryState(state = {}) {
  return {
    query: {
      selectedSectionKey: state.selectedSectionKey || 'all',
      selectedSourceKey: state.selectedSourceKey || '',
      selectedCollectionKey: state.selectedCollectionKey || '',
      selectedTagKey: state.selectedTagKey || '',
      sortKey: state.sortKey || 'year-desc',
      selectedReferenceId: state.selectedReferenceId || '',
    },
    sectionCounts: {},
    sourceCounts: {},
    collectionCounts: {},
    tagCounts: {},
    sortedReferences: Array.isArray(state.references) ? state.references : [],
    filteredReferences: Array.isArray(state.references) ? state.references : [],
    citationUsageIndex: {},
  }
}

export const useReferencesStore = defineStore('references', {
  state: () => ({
    librarySections: REFERENCE_LIBRARY_SECTIONS,
    sourceSections: REFERENCE_SOURCE_SECTIONS,
    collections: REFERENCE_COLLECTIONS,
    tags: REFERENCE_TAGS,
    references: REFERENCE_FIXTURES,
    documentReferenceSelections: {},
    citationStyle: 'apa',
    selectedSectionKey: 'all',
    selectedSourceKey: '',
    selectedCollectionKey: '',
    selectedTagKey: '',
    selectedReferenceId: REFERENCE_FIXTURES[0]?.id || '',
    referenceDockPdfOpen: false,
    referenceDockPdfReferenceId: '',
    sortKey: 'year-desc',
    resolvedQueryState: buildDefaultResolvedQueryState({
      librarySections: REFERENCE_LIBRARY_SECTIONS,
      sourceSections: REFERENCE_SOURCE_SECTIONS,
      collections: REFERENCE_COLLECTIONS,
      tags: REFERENCE_TAGS,
      references: REFERENCE_FIXTURES,
      selectedSectionKey: 'all',
      selectedSourceKey: '',
      selectedCollectionKey: '',
      selectedTagKey: '',
      sortKey: 'year-desc',
    }),
    isLoading: false,
    loadError: '',
    importInFlight: false,
  }),

  getters: {
    sectionCounts: (state) => state.resolvedQueryState?.sectionCounts || {},

    sourceCounts: (state) => state.resolvedQueryState?.sourceCounts || {},

    collectionCounts: (state) => state.resolvedQueryState?.collectionCounts || {},

    selectedCollection: (state) => resolveCollection(state.collections, state.selectedCollectionKey),

    tagCounts: (state) => state.resolvedQueryState?.tagCounts || {},

    selectedTag: (state) =>
      state.tags.find((tag) => normalizeTagKey(tag.key) === normalizeTagKey(state.selectedTagKey)) || null,

    filteredReferences: (state) => state.resolvedQueryState?.filteredReferences || [],

    selectedReference(state) {
      return (
        state.references.find((reference) => reference.id === state.selectedReferenceId) ||
        this.filteredReferences[0] ||
        null
      )
    },

    selectedReferencePdfTabOpen(state) {
      return (
        state.referenceDockPdfOpen === true &&
        String(state.referenceDockPdfReferenceId || '') === String(state.selectedReferenceId || '')
      )
    },

    sortedLibrary() {
      return this.resolvedQueryState?.sortedReferences || []
    },

    availableCitationStyles() {
      return getAvailableCitationStyles()
    },

    citedIn() {
      return this.resolvedQueryState?.citationUsageIndex || {}
    },

    citedKeys() {
      return new Set(Object.keys(this.citedIn))
    },
  },

  actions: {
    buildLibrarySnapshotPayload() {
      return {
        version: 2,
        citationStyle: this.citationStyle,
        documentReferenceSelections: this.documentReferenceSelections,
        collections: this.collections,
        tags: this.tags,
        references: this.references,
      }
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

      this.resolvedQueryState = resolved && typeof resolved === 'object'
        ? resolved
        : buildDefaultResolvedQueryState(this.$state)
      const query = this.resolvedQueryState?.query || {}
      this.selectedSectionKey = String(query.selectedSectionKey || 'all')
      this.selectedSourceKey = String(query.selectedSourceKey || '')
      this.selectedCollectionKey = String(query.selectedCollectionKey || '')
      this.selectedTagKey = String(query.selectedTagKey || '')
      this.sortKey = String(query.sortKey || 'year-desc')
      this.selectedReferenceId = String(
        this.resolvedQueryState?.selectedReferenceId ||
        query.selectedReferenceId ||
        this.selectedReferenceId ||
        ''
      )
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
      const normalized = {
        ...buildDefaultReferenceLibrarySnapshot(),
        ...(snapshot && typeof snapshot === 'object' ? snapshot : {}),
      }

      this.collections = Array.isArray(normalized.collections) ? normalized.collections : []
      this.tags = Array.isArray(normalized.tags) ? normalized.tags : []
      this.references = Array.isArray(normalized.references) ? normalized.references : []
      this.documentReferenceSelections = normalizeDocumentReferenceSelectionsForReferences(
        normalized.documentReferenceSelections,
        this.references
      )
      this.citationStyle = String(normalized.citationStyle || 'apa')
      if (!resolveCollection(this.collections, this.selectedCollectionKey)) {
        this.selectedCollectionKey = ''
      }
      if (!this.tags.some((tag) => normalizeTagKey(tag.key) === normalizeTagKey(this.selectedTagKey))) {
        this.selectedTagKey = ''
      }
      if (!this.sourceSections.some((section) => section.key === this.selectedSourceKey)) {
        this.selectedSourceKey = ''
      }

      if (preferredSelectedReferenceId !== null && preferredSelectedReferenceId !== undefined) {
        this.selectedReferenceId = String(preferredSelectedReferenceId || '')
      } else if (!this.references.some((reference) => reference.id === this.selectedReferenceId)) {
        this.selectedReferenceId = ''
      }
      await this.syncResolvedQueryState()
      if (
        this.referenceDockPdfReferenceId &&
        !this.references.some((reference) => reference.id === this.referenceDockPdfReferenceId)
      ) {
        this.closeReferenceDockPdf()
      } else {
        const workspace = useWorkspaceStore()
        if (
          workspace.referenceDockActivePage !== REFERENCE_DOCK_PDF_PAGE ||
          this.selectedReferencePdfTabOpen
        ) {
          return
        }
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
      setUserCitationStyles(Array.isArray(referenceStyles) ? referenceStyles : [])
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

      const normalized = Array.isArray(styles) ? styles : []
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
      if (importedReferences.length === 0) {
        return {
          importedCount: 0,
          selectedReferenceId: '',
          selectedReference: null,
          reusedExisting: false,
        }
      }
      const shouldMark = importedReferences.length > 0 ? await shouldMarkReferenceForZoteroPush() : false
      const markedReferences = shouldMark
        ? importedReferences.map((reference) => ({ ...reference, _appPushPending: true }))
        : importedReferences

      this.importInFlight = true
      try {
        const mutation = await applyReferenceMutation({
          snapshot: this.buildLibrarySnapshotPayload(),
          action: {
            type: 'mergeImportedReferences',
            imported: markedReferences,
          },
        })
        const selectedReferenceId = String(mutation?.result?.selectedReferenceId || '')
        await this.commitLibrarySnapshot(
          projectRoot,
          mutation?.snapshot || this.buildLibrarySnapshotPayload(),
          { preferredSelectedReferenceId: selectedReferenceId }
        )
        const selectedReference = selectedReferenceId
          ? this.references.find((reference) => reference.id === selectedReferenceId) || null
          : null
        return {
          importedCount: Number(mutation?.result?.importedCount || 0),
          selectedReferenceId,
          selectedReference,
          reusedExisting: mutation?.result?.reusedExisting === true,
        }
      } finally {
        this.importInFlight = false
      }
    },

    async importResolvedReferenceText(projectRoot = '', content = '') {
      this.importInFlight = true
      try {
        const importedReferences = await importReferencesFromText(content)
        if (importedReferences.length === 0) {
          return {
            importedCount: 0,
            selectedReferenceId: '',
            selectedReference: null,
            reusedExisting: false,
          }
        }

        const shouldMark = await shouldMarkReferenceForZoteroPush()
        const markedReferences = shouldMark
          ? importedReferences.map((reference) => ({ ...reference, _appPushPending: true }))
          : importedReferences
        const mutation = await applyReferenceMutation({
          snapshot: this.buildLibrarySnapshotPayload(),
          action: {
            type: 'mergeImportedReferences',
            imported: markedReferences,
          },
        })
        const selectedReferenceId = String(mutation?.result?.selectedReferenceId || '')
        await this.commitLibrarySnapshot(
          projectRoot,
          mutation?.snapshot || this.buildLibrarySnapshotPayload(),
          { preferredSelectedReferenceId: selectedReferenceId }
        )
        const selectedReference = selectedReferenceId
          ? this.references.find((reference) => reference.id === selectedReferenceId) || null
          : null
        return {
          importedCount: Number(mutation?.result?.importedCount || 0),
          selectedReferenceId,
          selectedReference,
          reusedExisting: mutation?.result?.reusedExisting === true,
        }
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
      if (mutation?.result?.changed) {
        await this.commitLibrarySnapshot(projectRoot, mutation.snapshot)
      }
      return mutation?.result?.collection && typeof mutation.result.collection === 'object'
        ? mutation.result.collection
        : null
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
      if (mutation?.result?.changed) {
        await this.commitLibrarySnapshot(projectRoot, mutation.snapshot)
      }
      return mutation?.result?.collection && typeof mutation.result.collection === 'object'
        ? mutation.result.collection
        : null
    },

    async removeCollection(projectRoot = '', collectionKey = '') {
      const mutation = await applyReferenceMutation({
        snapshot: this.buildLibrarySnapshotPayload(),
        action: {
          type: 'removeCollection',
          collectionKey,
        },
      })
      if (mutation?.result?.removed !== true) return false

      await this.commitLibrarySnapshot(projectRoot, mutation.snapshot, {
        preferredSelectedReferenceId: this.selectedReferenceId,
      })
      return true
    },

    async setSelectedSection(sectionKey) {
      const exists = this.librarySections.some((section) => section.key === sectionKey)
      this.selectedSectionKey = exists ? sectionKey : 'all'
      this.selectedSourceKey = ''
      this.selectedCollectionKey = ''
      this.selectedTagKey = ''
      await this.syncResolvedQueryState()
    },

    async setSelectedSource(sourceKey = '') {
      const exists = this.sourceSections.some((section) => section.key === sourceKey)
      this.selectedSourceKey = exists ? sourceKey : ''
      this.selectedSectionKey = 'all'
      this.selectedCollectionKey = ''
      this.selectedTagKey = ''
      await this.syncResolvedQueryState()
    },

    async setSelectedCollection(collectionKey = '') {
      const collection = resolveCollection(this.collections, collectionKey)
      this.selectedCollectionKey = collection?.key || ''
      this.selectedSectionKey = 'all'
      this.selectedSourceKey = ''
      this.selectedTagKey = ''
      await this.syncResolvedQueryState()
    },

    async setSelectedTag(tagKey = '') {
      const normalized = normalizeTagKey(tagKey)
      const exists = this.tags.some((tag) => normalizeTagKey(tag.key) === normalized)
      this.selectedTagKey = exists ? normalized : ''
      this.selectedSectionKey = 'all'
      this.selectedSourceKey = ''
      this.selectedCollectionKey = ''
      await this.syncResolvedQueryState()
    },

    async setSortKey(value = '') {
      this.sortKey = [
        'year-desc',
        'year-asc',
        'title-asc',
        'title-desc',
        'author-asc',
        'author-desc',
      ].includes(value)
        ? value
        : 'year-desc'
      await this.syncResolvedQueryState()
    },

    setCitationStyle(style = 'apa') {
      const normalized = String(style || '').trim()
      this.citationStyle = normalized && getCitationStyleInfo(normalized) ? normalized : 'apa'
    },

    selectReference(referenceId) {
      if (!this.references.some((reference) => reference.id === referenceId)) return
      this.selectedReferenceId = referenceId
    },

    openReferenceDockPdf(referenceId = this.selectedReferenceId) {
      const normalizedReferenceId = String(referenceId || '').trim()
      if (!normalizedReferenceId) return false
      this.referenceDockPdfOpen = true
      this.referenceDockPdfReferenceId = normalizedReferenceId
      return true
    },

    closeReferenceDockPdf(referenceId = this.referenceDockPdfReferenceId) {
      const normalizedReferenceId = String(referenceId || '').trim()
      if (!normalizedReferenceId || normalizedReferenceId === this.referenceDockPdfReferenceId) {
        this.referenceDockPdfOpen = false
        this.referenceDockPdfReferenceId = ''
      }
    },

    resetReferenceDockTabs() {
      this.referenceDockPdfOpen = false
      this.referenceDockPdfReferenceId = ''
    },

    getByKey(referenceKey = '') {
      const normalized = String(referenceKey || '').trim()
      if (!normalized) return null
      return (
        this.references.find(
          (reference) => reference.citationKey === normalized || reference.id === normalized
        ) || null
      )
    },

    getDocumentReferenceIds(texPath = '') {
      const normalizedTexPath = String(texPath || '').trim()
      if (!normalizedTexPath) return []
      return Array.isArray(this.documentReferenceSelections[normalizedTexPath])
        ? this.documentReferenceSelections[normalizedTexPath]
        : []
    },

    documentReferencesForTex(texPath = '') {
      const selectedIds = new Set(this.getDocumentReferenceIds(texPath))
      if (selectedIds.size === 0) return []
      return this.references.filter((reference) => selectedIds.has(String(reference.id || '')))
    },

    getDocumentReferenceByKey(texPath = '', referenceKey = '') {
      const normalized = String(referenceKey || '').trim()
      if (!normalized) return null
      return (
        this.documentReferencesForTex(texPath).find(
          (reference) => reference.citationKey === normalized || reference.id === normalized
        ) || null
      )
    },

    isReferenceSelectedForTex(texPath = '', referenceIdOrKey = '') {
      const normalized = String(referenceIdOrKey || '').trim()
      if (!normalized) return false
      return this.documentReferencesForTex(texPath).some(
        (reference) => reference.id === normalized || reference.citationKey === normalized
      )
    },

    searchAvailableReferencesForDocument(texPath = '', query = '') {
      const selectedIds = new Set(this.getDocumentReferenceIds(texPath))
      return this.searchRefs(query)
        .filter((reference) => !selectedIds.has(String(reference.id || '')))
    },

    async setDocumentReferenceIds(projectRoot = '', texPath = '', referenceIds = []) {
      const normalizedTexPath = String(texPath || '').trim()
      if (!normalizedTexPath) return false
      const validReferenceIds = new Set(this.references.map((reference) => String(reference.id || '')))
      const ids = Array.from(
        new Set(
          (Array.isArray(referenceIds) ? referenceIds : [])
            .map((referenceId) => String(referenceId || '').trim())
            .filter((referenceId) => validReferenceIds.has(referenceId))
        )
      )
      const nextSelections = { ...this.documentReferenceSelections }
      if (ids.length > 0) {
        nextSelections[normalizedTexPath] = ids
      } else {
        delete nextSelections[normalizedTexPath]
      }
      await this.commitLibrarySnapshot(projectRoot, {
        ...this.buildLibrarySnapshotPayload(),
        documentReferenceSelections: nextSelections,
      }, {
        preferredSelectedReferenceId: this.selectedReferenceId,
      })
      return true
    },

    async addDocumentReference(projectRoot = '', texPath = '', referenceId = '') {
      const normalizedReferenceId = String(referenceId || '').trim()
      if (!normalizedReferenceId || !this.references.some((reference) => reference.id === normalizedReferenceId)) {
        return false
      }
      const ids = this.getDocumentReferenceIds(texPath)
      if (ids.includes(normalizedReferenceId)) return false
      return this.setDocumentReferenceIds(projectRoot, texPath, [...ids, normalizedReferenceId])
    },

    async removeDocumentReference(projectRoot = '', texPath = '', referenceId = '') {
      const normalizedReferenceId = String(referenceId || '').trim()
      if (!normalizedReferenceId) return false
      const ids = this.getDocumentReferenceIds(texPath)
      if (!ids.includes(normalizedReferenceId)) return false
      return this.setDocumentReferenceIds(
        projectRoot,
        texPath,
        ids.filter((id) => id !== normalizedReferenceId)
      )
    },

    searchRefs(query = '') {
      const normalizedQuery = String(query || '').trim().toLowerCase()
      if (!normalizedQuery) return this.sortedLibrary
      return this.sortedLibrary.filter((reference) => {
        const haystack = [
          reference.title,
          ...(Array.isArray(reference.authors) ? reference.authors : []),
          reference.authorLine,
          reference.source,
          reference.citationKey,
          reference.identifier,
          reference.pages,
          ...(Array.isArray(reference.tags) ? reference.tags : []),
        ].filter(Boolean).join(' ').toLowerCase()
        return haystack.includes(normalizedQuery)
      })
    },

    async addReference(projectRoot = '', reference = {}, options = {}) {
      const {
        markForZoteroPush = true,
        persist = true,
      } = options
      const shouldMark = markForZoteroPush ? await shouldMarkReferenceForZoteroPush() : false
      const mutation = await applyReferenceMutation({
        snapshot: this.buildLibrarySnapshotPayload(),
        action: {
          type: 'addReference',
          reference,
          markForZoteroPush: shouldMark ? true : reference._appPushPending === true,
        },
      })
      const selectedReferenceId = String(mutation?.result?.selectedReferenceId || '')

      await this.commitLibrarySnapshot(
        projectRoot,
        mutation?.snapshot || this.buildLibrarySnapshotPayload(),
        {
          persist,
          preferredSelectedReferenceId: selectedReferenceId,
        }
      )
      return this.references.find((reference) => reference.id === selectedReferenceId) || null
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
      if (mutation?.result?.changed !== true) return false
      const selectedReferenceId =
        preferredSelectedReferenceId !== undefined
          ? String(preferredSelectedReferenceId || '')
          : String(this.selectedReferenceId || mutation?.result?.selectedReferenceId || '')

      await this.commitLibrarySnapshot(
        projectRoot,
        mutation?.snapshot || this.buildLibrarySnapshotPayload(),
        {
          persist,
          preferredSelectedReferenceId: selectedReferenceId,
        }
      )
      return true
    },

    async refreshReferenceMetadata(projectRoot = '', referenceId = '') {
      const normalizedReferenceId = String(referenceId || '').trim()
      const reference = this.references.find((item) => item.id === normalizedReferenceId)
      if (!reference) return null

      const refreshed = await refreshReferenceMetadataWithBackend(reference)
      if (!refreshed || typeof refreshed !== 'object') return null

      await this.updateReference(projectRoot, normalizedReferenceId, refreshed, {
        preferredSelectedReferenceId: normalizedReferenceId,
      })
      return refreshed
    },

    async removeReference(projectRoot = '', referenceId = '') {
      const target = this.references.find((reference) => reference.id === referenceId)
      if (!target) return false

      const mutation = await applyReferenceMutation({
        snapshot: this.buildLibrarySnapshotPayload(),
        action: {
          type: 'removeReference',
          referenceId,
        },
      })
      if (mutation?.result?.removed !== true) return false
      const preferredSelectedReferenceId = this.selectedReferenceId === referenceId
        ? ''
        : this.selectedReferenceId

      await this.commitLibrarySnapshot(projectRoot, mutation.snapshot, {
        preferredSelectedReferenceId,
      })

      if (target._pushedByApp && target._zoteroKey) {
        deleteFromZotero(target).catch(() => {})
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
      if (mutation?.result?.changed !== true) return false

      await this.commitLibrarySnapshot(projectRoot, mutation.snapshot, {
        preferredSelectedReferenceId: this.selectedReferenceId,
      })
      return mutation?.result?.toggledOn === true
    },

    async attachReferencePdf(projectRoot = '', referenceId = '', sourcePath = '') {
      const referenceIndex = this.references.findIndex((reference) => reference.id === referenceId)
      if (referenceIndex === -1) return null

      const updatedReference = await storeReferencePdf(
        projectRoot,
        this.references[referenceIndex],
        sourcePath
      )

      await this.commitLibrarySnapshot(projectRoot, {
        ...this.buildLibrarySnapshotPayload(),
        references: this.references.map((candidate, index) =>
          index === referenceIndex ? updatedReference : candidate
        ),
      }, {
        preferredSelectedReferenceId: referenceId,
      })
      return updatedReference
    },

    async renameReferencePdfAsset(projectRoot = '', referenceId = '', nextBaseName = '') {
      const referenceIndex = this.references.findIndex((reference) => reference.id === referenceId)
      if (referenceIndex === -1) return null

      const updatedReference = await renameReferencePdfAssetWithBackend(
        projectRoot,
        this.references[referenceIndex],
        nextBaseName
      )

      await this.commitLibrarySnapshot(projectRoot, {
        ...this.buildLibrarySnapshotPayload(),
        references: this.references.map((candidate, index) =>
          index === referenceIndex ? updatedReference : candidate
        ),
      }, {
        preferredSelectedReferenceId: referenceId,
      })
      return updatedReference
    },

    async importReferencePdf(projectRoot = '', sourcePath = '') {
      this.importInFlight = true
      try {
        const importedReference = await importReferenceFromPdf(sourcePath)
        if (!importedReference) return null

        const duplicate = await findDuplicateReference(this.references, importedReference)
        if (duplicate?.id) {
          return this.attachReferencePdf(projectRoot, duplicate.id, sourcePath)
        }

        const hydratedReference = await storeReferencePdf(projectRoot, importedReference, sourcePath)
        await this.addReference(projectRoot, hydratedReference)
        return hydratedReference
      } finally {
        this.importInFlight = false
      }
    },

    async exportBibTeXAsync(referenceIds = []) {
      const references = Array.isArray(referenceIds) && referenceIds.length > 0
        ? referenceIds
            .map((referenceId) => this.references.find((reference) => reference.id === referenceId))
            .filter(Boolean)
        : this.references

      return exportReferencesToBibTeX(references)
    },

    async formatReferenceCitationAsync(referenceId = '', mode = 'reference', number) {
      const reference = this.references.find((candidate) => candidate.id === referenceId)
      if (!reference) return ''
      return formatCitation(this.citationStyle, mode, reference, number)
    },

    cleanup() {
      this.collections = REFERENCE_COLLECTIONS
      this.tags = REFERENCE_TAGS
      this.references = REFERENCE_FIXTURES
      this.documentReferenceSelections = {}
      this.citationStyle = 'apa'
      this.selectedSectionKey = 'all'
      this.selectedSourceKey = ''
      this.selectedCollectionKey = ''
      this.selectedTagKey = ''
      this.selectedReferenceId = REFERENCE_FIXTURES[0]?.id || ''
      this.referenceDockPdfOpen = false
      this.referenceDockPdfReferenceId = ''
      this.sortKey = 'year-desc'
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
      })
      this.isLoading = false
      this.loadError = ''
      this.importInFlight = false
    },
  },
})
