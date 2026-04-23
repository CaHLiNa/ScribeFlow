import { defineStore, getActivePinia } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { t } from '../i18n/index.js'
import { useWorkspaceStore } from './workspace.js'
import { formatCitation } from '../services/references/citationFormatter.js'
import {
  getAvailableCitationStyles,
  getCitationStyleInfo,
  setUserCitationStyles,
} from '../services/references/citationStyleRegistry.js'
import { exportReferencesToBibTeX } from '../services/references/bibtexExport.js'
import { storeReferencePdf } from '../services/references/referenceAssets.js'
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
  normalizeReferenceRecordWithBackend,
  readOrCreateReferenceLibrarySnapshot,
  writeReferenceLibrarySnapshot,
} from '../services/references/referenceLibraryIO.js'
import {
  findDuplicateReference,
  importReferenceFromPdf,
  importReferencesFromText,
  parseReferenceImportText,
} from '../services/references/bibtexImport.js'
import { deleteFromZotero, loadZoteroConfig } from '../services/references/zoteroSync.js'
import { isBrowserPreviewRuntime } from '../app/browserPreview/routes.js'

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

async function shouldMarkReferenceForZoteroPush() {
  try {
    const config = await loadZoteroConfig()
    return Boolean(config?.pushTarget)
  } catch {
    return false
  }
}

function buildDefaultResolvedQueryState(state = {}) {
  return {
    query: {
      selectedSectionKey: state.selectedSectionKey || 'all',
      selectedSourceKey: state.selectedSourceKey || '',
      selectedCollectionKey: state.selectedCollectionKey || '',
      selectedTagKey: state.selectedTagKey || '',
      searchQuery: state.searchQuery || '',
      sortKey: state.sortKey || 'year-desc',
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

function hasDesktopInvoke() {
  return typeof window !== 'undefined' && typeof window.__TAURI_INTERNALS__?.invoke === 'function'
}

async function invokeReferenceMutation(params = {}) {
  if (!hasDesktopInvoke()) {
    throw new Error('References mutation runtime requires desktop Rust backend.')
  }

  return invoke('references_mutation_apply', {
    params: {
      snapshot: params.snapshot && typeof params.snapshot === 'object' ? params.snapshot : {},
      action: params.action && typeof params.action === 'object' ? params.action : { type: '' },
    },
  })
}

async function invokeReferenceQuery(params = {}) {
  if (!hasDesktopInvoke()) {
    throw new Error('References query runtime requires desktop Rust backend.')
  }

  return invoke('references_query_resolve', {
    params: {
      librarySections: Array.isArray(params.librarySections) ? params.librarySections : [],
      sourceSections: Array.isArray(params.sourceSections) ? params.sourceSections : [],
      collections: Array.isArray(params.collections) ? params.collections : [],
      tags: Array.isArray(params.tags) ? params.tags : [],
      references: Array.isArray(params.references) ? params.references : [],
      selectedSectionKey: String(params.selectedSectionKey || ''),
      selectedSourceKey: String(params.selectedSourceKey || ''),
      selectedCollectionKey: String(params.selectedCollectionKey || ''),
      selectedTagKey: String(params.selectedTagKey || ''),
      searchQuery: String(params.searchQuery || ''),
      sortKey: String(params.sortKey || ''),
      fileContents: params.fileContents && typeof params.fileContents === 'object' ? params.fileContents : {},
    },
  })
}

export const useReferencesStore = defineStore('references', {
  state: () => ({
    librarySections: REFERENCE_LIBRARY_SECTIONS,
    sourceSections: REFERENCE_SOURCE_SECTIONS,
    collections: REFERENCE_COLLECTIONS,
    tags: REFERENCE_TAGS,
    references: REFERENCE_FIXTURES,
    citationStyle: 'apa',
    selectedSectionKey: 'all',
    selectedSourceKey: '',
    selectedCollectionKey: '',
    selectedTagKey: '',
    selectedReferenceId: REFERENCE_FIXTURES[0]?.id || '',
    searchQuery: '',
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
      searchQuery: '',
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
        collections: this.collections,
        tags: this.tags,
        references: this.references,
      }
    },

    async commitLibrarySnapshot(projectRoot = '', snapshot = {}, options = {}) {
      const { persist = true } = options
      const nextSnapshot = persist
        ? await writeReferenceLibrarySnapshot(projectRoot, snapshot)
        : await normalizeReferenceLibrarySnapshotWithBackend(snapshot)
      this.applyLibrarySnapshot(nextSnapshot)
      return nextSnapshot
    },

    async refreshResolvedQueryState() {
      const pinia = getActivePinia()
      const fileContents = pinia?.state?.value?.files?.fileContents || {}
      const resolved = await invokeReferenceQuery({
        librarySections: this.librarySections,
        sourceSections: this.sourceSections,
        collections: this.collections,
        tags: this.tags,
        references: this.references,
        selectedSectionKey: this.selectedSectionKey,
        selectedSourceKey: this.selectedSourceKey,
        selectedCollectionKey: this.selectedCollectionKey,
        selectedTagKey: this.selectedTagKey,
        searchQuery: this.searchQuery,
        sortKey: this.sortKey,
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
      this.searchQuery = String(query.searchQuery ?? this.searchQuery ?? '')
    },

    async syncResolvedQueryState(options = {}) {
      const { ensureVisible = false } = options
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
        searchQuery: this.searchQuery,
        sortKey: this.sortKey,
      })
      await this.refreshResolvedQueryState()
      if (ensureVisible) {
        this.ensureSelectedReferenceVisible()
      }
    },

    ensureSelectedReferenceVisible() {
      if (this.filteredReferences.some((reference) => reference.id === this.selectedReferenceId)) {
        return
      }
      this.selectedReferenceId = this.filteredReferences[0]?.id || ''
    },

    async persistLibrarySnapshot(projectRoot = '') {
      return this.commitLibrarySnapshot(projectRoot, this.buildLibrarySnapshotPayload())
    },

    applyLibrarySnapshot(snapshot = {}) {
      const normalized = {
        ...buildDefaultReferenceLibrarySnapshot(),
        ...(snapshot && typeof snapshot === 'object' ? snapshot : {}),
      }

      this.collections = Array.isArray(normalized.collections) ? normalized.collections : []
      this.tags = Array.isArray(normalized.tags) ? normalized.tags : []
      this.references = Array.isArray(normalized.references) ? normalized.references : []
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

      if (!this.references.some((reference) => reference.id === this.selectedReferenceId)) {
        this.selectedReferenceId = this.references[0]?.id || ''
      }
      void this.syncResolvedQueryState({ ensureVisible: true })
    },

    async loadWorkspaceLibrary(projectRoot = '', options = {}) {
      this.isLoading = true
      this.loadError = ''

      try {
        const snapshot = await readOrCreateReferenceLibrarySnapshot(projectRoot, options)
        this.applyLibrarySnapshot(snapshot)
        await this.loadWorkspaceCitationStyles()
      } catch (error) {
        this.loadError = error?.message || t('Failed to load reference library')
        this.applyLibrarySnapshot(buildDefaultReferenceLibrarySnapshot())
        setUserCitationStyles([])
      } finally {
        this.isLoading = false
      }
    },

    async loadWorkspaceCitationStyles() {
      if (isBrowserPreviewRuntime()) {
        setUserCitationStyles([])
        return []
      }

      const workspace = useWorkspaceStore()
      const workspacePath = String(workspace.path || '').trim()
      if (!workspacePath) {
        setUserCitationStyles([])
        return []
      }

      const styles = await invoke('references_scan_workspace_styles', {
        params: {
          workspacePath,
        },
      }).catch(() => [])

      const normalized = Array.isArray(styles) ? styles : []
      setUserCitationStyles(normalized)
      return normalized
    },

    async importBibTeXContent(projectRoot = '', content = '') {
      return this.importReferenceText(projectRoot, content, 'bibtex')
    },

    async importReferenceText(projectRoot = '', content = '', format = 'auto') {
      const importedReferences = await parseReferenceImportText(content, format)
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
        const mutation = await invokeReferenceMutation({
          snapshot: this.buildLibrarySnapshotPayload(),
          action: {
            type: 'mergeImportedReferences',
            imported: markedReferences,
          },
        })
        await this.commitLibrarySnapshot(projectRoot, mutation?.snapshot || this.buildLibrarySnapshotPayload())
        const selectedReferenceId = String(mutation?.result?.selectedReferenceId || '')
        if (selectedReferenceId) this.selectedReferenceId = selectedReferenceId
        this.ensureSelectedReferenceVisible()
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
        const mutation = await invokeReferenceMutation({
          snapshot: this.buildLibrarySnapshotPayload(),
          action: {
            type: 'mergeImportedReferences',
            imported: markedReferences,
          },
        })
        await this.commitLibrarySnapshot(projectRoot, mutation?.snapshot || this.buildLibrarySnapshotPayload())
        const selectedReferenceId = String(mutation?.result?.selectedReferenceId || '')
        if (selectedReferenceId) this.selectedReferenceId = selectedReferenceId
        this.ensureSelectedReferenceVisible()
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
      const mutation = await invokeReferenceMutation({
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
      const mutation = await invokeReferenceMutation({
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
      const mutation = await invokeReferenceMutation({
        snapshot: this.buildLibrarySnapshotPayload(),
        action: {
          type: 'removeCollection',
          collectionKey,
        },
      })
      if (mutation?.result?.removed !== true) return false

      await this.commitLibrarySnapshot(projectRoot, mutation.snapshot)
      this.ensureSelectedReferenceVisible()
      return true
    },

    async setSelectedSection(sectionKey) {
      const exists = this.librarySections.some((section) => section.key === sectionKey)
      this.selectedSectionKey = exists ? sectionKey : 'all'
      this.selectedSourceKey = ''
      this.selectedCollectionKey = ''
      this.selectedTagKey = ''
      await this.syncResolvedQueryState({ ensureVisible: true })
    },

    async setSelectedSource(sourceKey = '') {
      const exists = this.sourceSections.some((section) => section.key === sourceKey)
      this.selectedSourceKey = exists ? sourceKey : ''
      this.selectedSectionKey = 'all'
      this.selectedCollectionKey = ''
      this.selectedTagKey = ''
      await this.syncResolvedQueryState({ ensureVisible: true })
    },

    async setSelectedCollection(collectionKey = '') {
      const collection = resolveCollection(this.collections, collectionKey)
      this.selectedCollectionKey = collection?.key || ''
      this.selectedSectionKey = 'all'
      this.selectedSourceKey = ''
      this.selectedTagKey = ''
      await this.syncResolvedQueryState({ ensureVisible: true })
    },

    async setSelectedTag(tagKey = '') {
      const normalized = normalizeTagKey(tagKey)
      const exists = this.tags.some((tag) => normalizeTagKey(tag.key) === normalized)
      this.selectedTagKey = exists ? normalized : ''
      this.selectedSectionKey = 'all'
      this.selectedSourceKey = ''
      this.selectedCollectionKey = ''
      await this.syncResolvedQueryState({ ensureVisible: true })
    },

    async setSearchQuery(value = '') {
      this.searchQuery = String(value || '')
      await this.syncResolvedQueryState({ ensureVisible: true })
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
      await this.syncResolvedQueryState({ ensureVisible: true })
    },

    setCitationStyle(style = 'apa') {
      const normalized = String(style || '').trim()
      this.citationStyle = normalized && getCitationStyleInfo(normalized) ? normalized : 'apa'
    },

    selectReference(referenceId) {
      if (!this.references.some((reference) => reference.id === referenceId)) return
      this.selectedReferenceId = referenceId
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
      const duplicate = await findDuplicateReference(this.references, reference)
      if (duplicate) return duplicate

      const shouldMark = markForZoteroPush ? await shouldMarkReferenceForZoteroPush() : false
      const nextReference = await normalizeReferenceRecordWithBackend({
        ...reference,
        _appPushPending: shouldMark ? true : reference._appPushPending === true,
      })

      await this.commitLibrarySnapshot(
        projectRoot,
        {
          ...this.buildLibrarySnapshotPayload(),
          references: [...this.references, nextReference],
        },
        { persist }
      )
      this.selectedReferenceId = nextReference.id
      this.ensureSelectedReferenceVisible()
      return this.references.find((reference) => reference.id === nextReference.id) || nextReference
    },

    async updateReference(projectRoot = '', referenceId = '', updates = {}, options = {}) {
      const { persist = true } = options
      const referenceIndex = this.references.findIndex((reference) => reference.id === referenceId)
      if (referenceIndex === -1) return false

      const normalizedReference = await normalizeReferenceRecordWithBackend({
        ...this.references[referenceIndex],
        ...updates,
      })

      await this.commitLibrarySnapshot(
        projectRoot,
        {
          ...this.buildLibrarySnapshotPayload(),
          references: this.references.map((reference, index) =>
            index === referenceIndex ? normalizedReference : reference
          ),
        },
        { persist }
      )
      this.ensureSelectedReferenceVisible()
      return true
    },

    async removeReference(projectRoot = '', referenceId = '') {
      const target = this.references.find((reference) => reference.id === referenceId)
      if (!target) return false

      await this.commitLibrarySnapshot(projectRoot, {
        ...this.buildLibrarySnapshotPayload(),
        references: this.references.filter((reference) => reference.id !== referenceId),
      })
      if (this.selectedReferenceId === referenceId) {
        this.selectedReferenceId = this.filteredReferences[0]?.id || ''
      }

      if (target._pushedByApp && target._zoteroKey) {
        deleteFromZotero(target).catch(() => {})
      }
      return true
    },

    async toggleReferenceCollection(projectRoot = '', referenceId = '', collectionKey = '') {
      const mutation = await invokeReferenceMutation({
        snapshot: this.buildLibrarySnapshotPayload(),
        action: {
          type: 'toggleReferenceCollection',
          referenceId,
          collectionKey,
        },
      })
      if (mutation?.result?.changed !== true) return false

      await this.commitLibrarySnapshot(projectRoot, mutation.snapshot)
      this.ensureSelectedReferenceVisible()
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
      this.citationStyle = 'apa'
      this.selectedSectionKey = 'all'
      this.selectedSourceKey = ''
      this.selectedCollectionKey = ''
      this.selectedTagKey = ''
      this.selectedReferenceId = REFERENCE_FIXTURES[0]?.id || ''
      this.searchQuery = ''
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
        searchQuery: this.searchQuery,
        sortKey: this.sortKey,
      })
      this.isLoading = false
      this.loadError = ''
      this.importInFlight = false
    },
  },
})
