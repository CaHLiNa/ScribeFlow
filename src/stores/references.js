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
  normalizeReferenceRecordWithBackend,
  readOrCreateReferenceLibrarySnapshot,
  writeReferenceLibrarySnapshot,
} from '../services/references/referenceLibraryIO.js'
import {
  findDuplicateReference,
  importReferenceFromPdf,
  importReferencesFromText,
  mergeImportedReferences,
  parseReferenceImportText,
} from '../services/references/bibtexImport.js'
import { deleteFromZotero, loadZoteroConfig } from '../services/references/zoteroSync.js'
import { normalizeReferenceSearchTokens } from '../domains/references/referenceInterop.js'
import { isBrowserPreviewRuntime } from '../app/browserPreview/routes.js'

function normalizedAuthorSortText(reference = {}) {
  const authors = Array.isArray(reference.authors) ? reference.authors : []
  if (authors.length > 0) {
    return authors.join(' ').trim().toLowerCase()
  }
  return String(reference.authorLine || '').trim().toLowerCase()
}

function buildCollectionKey(label = '') {
  const normalized = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || `collection-${Date.now()}`
}

function normalizedCollectionLabel(label = '') {
  return String(label || '').trim().toLowerCase()
}

function normalizeCollectionMembershipValue(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeTagKey(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeTagLabel(value = '') {
  return String(value || '').trim()
}

function normalizeTagEntry(value = null) {
  if (typeof value === 'string') {
    const label = normalizeTagLabel(value)
    if (!label) return null
    return {
      key: normalizeTagKey(label),
      label,
    }
  }

  if (!value || typeof value !== 'object') return null

  const label = normalizeTagLabel(value.label || value.name || value.key || '')
  if (!label) return null

  return {
    ...value,
    key: normalizeTagKey(value.key || label),
    label,
  }
}

function buildTagRegistry(existingTags = [], references = []) {
  const registry = new Map()

  for (const entry of Array.isArray(existingTags) ? existingTags : []) {
    const normalized = normalizeTagEntry(entry)
    if (!normalized?.key) continue
    registry.set(normalized.key, normalized)
  }

  for (const reference of Array.isArray(references) ? references : []) {
    for (const value of Array.isArray(reference?.tags) ? reference.tags : []) {
      const normalized = normalizeTagEntry(value)
      if (!normalized?.key) continue
      if (!registry.has(normalized.key)) {
        registry.set(normalized.key, normalized)
      }
    }
  }

  return [...registry.values()].sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')))
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

function referenceHasCollection(reference = {}, collection = null) {
  if (!collection) return false
  const collectionValues = Array.isArray(reference.collections) ? reference.collections : []
  const normalizedKey = normalizeCollectionMembershipValue(collection.key)
  const normalizedLabel = normalizeCollectionMembershipValue(collection.label)

  return collectionValues.some((value) => {
    const normalizedValue = normalizeCollectionMembershipValue(value)
    return normalizedValue === normalizedKey || normalizedValue === normalizedLabel
  })
}

function filterReferenceBySection(reference, sectionKey) {
  if (sectionKey === 'unfiled') return !reference.collections.length
  if (sectionKey === 'missing-identifier') return !String(reference.identifier || '').trim()
  if (sectionKey === 'missing-pdf') return !referenceHasPdf(reference)
  return true
}

function filterReferenceBySource(reference, sourceKey) {
  if (sourceKey === 'zotero') return String(reference?._source || '').trim().toLowerCase() === 'zotero'
  if (sourceKey === 'manual') return String(reference?._source || '').trim().toLowerCase() !== 'zotero'
  return true
}

function filterReferenceByCollection(reference, collectionKey, collections = []) {
  if (!collectionKey) return true
  const collection = resolveCollection(collections, collectionKey)
  if (!collection) return false
  return referenceHasCollection(reference, collection)
}

function filterReferenceByTag(reference, tagKey = '') {
  const normalizedTag = normalizeTagKey(tagKey)
  if (!normalizedTag) return true
  const tags = Array.isArray(reference?.tags) ? reference.tags : []
  return tags.some((value) => normalizeTagKey(typeof value === 'string' ? value : value?.key || value?.label) === normalizedTag)
}

function referenceHasPdf(reference = {}) {
  return String(reference.pdfPath || '').trim().length > 0 || reference.hasPdf === true
}

async function shouldMarkReferenceForZoteroPush() {
  try {
    const config = await loadZoteroConfig()
    return Boolean(config?.pushTarget)
  } catch {
    return false
  }
}

function normalizedReferenceSearchText(reference = {}) {
  return normalizeReferenceSearchTokens(reference).join(' ')
}

function compareReferences(a = {}, b = {}, sortKey = 'year-desc') {
  if (sortKey === 'year-asc') {
    return (
      Number(a.year || 0) - Number(b.year || 0) ||
      String(a.title || '').localeCompare(String(b.title || ''))
    )
  }
  if (sortKey === 'author-desc') {
    return (
      normalizedAuthorSortText(b).localeCompare(normalizedAuthorSortText(a)) ||
      String(a.title || '').localeCompare(String(b.title || ''))
    )
  }
  if (sortKey === 'author-asc') {
    return (
      normalizedAuthorSortText(a).localeCompare(normalizedAuthorSortText(b)) ||
      String(a.title || '').localeCompare(String(b.title || ''))
    )
  }
  if (sortKey === 'title-desc') {
    return (
      String(b.title || '').localeCompare(String(a.title || '')) ||
      Number(b.year || 0) - Number(a.year || 0)
    )
  }
  if (sortKey === 'title-asc') {
    return (
      String(a.title || '').localeCompare(String(b.title || '')) ||
      Number(b.year || 0) - Number(a.year || 0)
    )
  }
  return (
    Number(b.year || 0) - Number(a.year || 0) ||
    String(a.title || '').localeCompare(String(b.title || ''))
  )
}

function buildCitationUsageIndex(fileContents = {}) {
  const usage = {}
  const markdownCitationRe = /\[([^\[\]]*@[a-zA-Z][\w.-]*[^\[\]]*)\]/g
  const markdownKeyRe = /@([a-zA-Z][\w.-]*)/g
  const latexCitationRe =
    /\\(?:cite[tp]?|citealp|citealt|citeauthor|citeyear|autocite|textcite|parencite|nocite|footcite|fullcite|supercite|smartcite|Cite[tp]?|Parencite|Textcite|Autocite|Smartcite|Footcite|Fullcite)\{([^}]*)\}/g
  const latexKeyRe = /([a-zA-Z][\w.-]*)/g

  for (const [path, content] of Object.entries(fileContents || {})) {
    if (!content || typeof content !== 'string') continue

    if (path.endsWith('.md')) {
      markdownCitationRe.lastIndex = 0
      let citationMatch = null
      while ((citationMatch = markdownCitationRe.exec(content)) !== null) {
        markdownKeyRe.lastIndex = 0
        let keyMatch = null
        while ((keyMatch = markdownKeyRe.exec(citationMatch[1])) !== null) {
          const key = keyMatch[1]
          if (!usage[key]) usage[key] = []
          if (!usage[key].includes(path)) usage[key].push(path)
        }
      }
      continue
    }

    if (path.endsWith('.tex') || path.endsWith('.latex')) {
      latexCitationRe.lastIndex = 0
      let citationMatch = null
      while ((citationMatch = latexCitationRe.exec(content)) !== null) {
        latexKeyRe.lastIndex = 0
        let keyMatch = null
        while ((keyMatch = latexKeyRe.exec(citationMatch[1])) !== null) {
          const key = keyMatch[1]
          if (!usage[key]) usage[key] = []
          if (!usage[key].includes(path)) usage[key].push(path)
        }
      }
    }
  }

  return usage
}

async function resolveImportedSelectionReference(
  mergedReferences = [],
  markedReferences = [],
) {
  if (!markedReferences[0]) return null

  let importedSelection = mergedReferences.find((reference) =>
    markedReferences.some((candidate) => candidate.id === reference.id)
  )
  if (importedSelection) return importedSelection

  for (const reference of mergedReferences) {
    const duplicate = await findDuplicateReference(markedReferences, reference)
    if (duplicate) {
      importedSelection = reference
      break
    }
  }

  return importedSelection || null
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
    isLoading: false,
    loadError: '',
    importInFlight: false,
  }),

  getters: {
    sectionCounts: (state) =>
      Object.fromEntries(
        state.librarySections.map((section) => [
          section.key,
          state.references.filter((reference) => filterReferenceBySection(reference, section.key)).length,
        ])
      ),

    sourceCounts: (state) =>
      Object.fromEntries(
        state.sourceSections.map((section) => [
          section.key,
          state.references.filter((reference) => filterReferenceBySource(reference, section.key)).length,
        ])
      ),

    collectionCounts: (state) =>
      Object.fromEntries(
        state.collections.map((collection) => [
          collection.key,
          state.references.filter((reference) => filterReferenceByCollection(reference, collection.key, state.collections))
            .length,
        ])
      ),

    selectedCollection: (state) => resolveCollection(state.collections, state.selectedCollectionKey),

    tagCounts: (state) =>
      Object.fromEntries(
        state.tags.map((tag) => [
          tag.key,
          state.references.filter((reference) => filterReferenceByTag(reference, tag.key)).length,
        ])
      ),

    selectedTag: (state) =>
      state.tags.find((tag) => normalizeTagKey(tag.key) === normalizeTagKey(state.selectedTagKey)) || null,

    filteredReferences: (state) =>
      state.references
        .filter((reference) => filterReferenceBySection(reference, state.selectedSectionKey))
        .filter((reference) => filterReferenceBySource(reference, state.selectedSourceKey))
        .filter((reference) =>
          filterReferenceByCollection(reference, state.selectedCollectionKey, state.collections)
        )
        .filter((reference) => filterReferenceByTag(reference, state.selectedTagKey))
        .filter((reference) => {
          const query = String(state.searchQuery || '').trim().toLowerCase()
          if (!query) return true
          return normalizedReferenceSearchText(reference).includes(query)
        })
        .slice()
        .sort((a, b) => compareReferences(a, b, state.sortKey)),

    selectedReference(state) {
      return (
        state.references.find((reference) => reference.id === state.selectedReferenceId) ||
        this.filteredReferences[0] ||
        null
      )
    },

    sortedLibrary() {
      return this.references.slice().sort((a, b) => compareReferences(a, b, this.sortKey))
    },

    availableCitationStyles() {
      return getAvailableCitationStyles()
    },

    citedIn() {
      const pinia = getActivePinia()
      const fileContents = pinia?.state?.value?.files?.fileContents || {}
      return buildCitationUsageIndex(fileContents)
    },

    citedKeys() {
      return new Set(Object.keys(this.citedIn))
    },
  },

  actions: {
    syncTagRegistry() {
      this.tags = buildTagRegistry([], this.references)
    },

    ensureSelectedReferenceVisible() {
      if (this.filteredReferences.some((reference) => reference.id === this.selectedReferenceId)) {
        return
      }
      this.selectedReferenceId = this.filteredReferences[0]?.id || ''
    },

    async persistLibrarySnapshot(projectRoot = '') {
      const snapshot = {
        version: 2,
        citationStyle: this.citationStyle,
        collections: this.collections,
        tags: this.tags,
        references: this.references,
      }
      const persisted = await writeReferenceLibrarySnapshot(projectRoot, snapshot)
      this.applyLibrarySnapshot(persisted)
      return persisted
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
      this.ensureSelectedReferenceVisible()
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
      const shouldMark = importedReferences.length > 0 ? await shouldMarkReferenceForZoteroPush() : false
      const markedReferences = shouldMark
        ? importedReferences.map((reference) => ({ ...reference, _appPushPending: true }))
        : importedReferences
      const mergedReferences = await mergeImportedReferences(this.references, markedReferences)
      const importedCount = Math.max(0, mergedReferences.length - this.references.length)

      this.importInFlight = true
      try {
        const snapshot = {
          version: 2,
          citationStyle: this.citationStyle,
          collections: this.collections,
          tags: this.tags,
          references: mergedReferences,
        }
        const persisted = await writeReferenceLibrarySnapshot(projectRoot, snapshot)
        this.applyLibrarySnapshot(persisted)
        const importedSelection = await resolveImportedSelectionReference(mergedReferences, markedReferences)
        if (importedSelection) this.selectedReferenceId = importedSelection.id
        this.ensureSelectedReferenceVisible()
        return {
          importedCount,
          selectedReferenceId: importedSelection?.id || '',
          selectedReference: importedSelection || null,
          reusedExisting: importedCount === 0 && !!importedSelection,
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
        const mergedReferences = await mergeImportedReferences(this.references, markedReferences)
        const importedCount = Math.max(0, mergedReferences.length - this.references.length)
        const snapshot = {
          version: 2,
          citationStyle: this.citationStyle,
          collections: this.collections,
          tags: this.tags,
          references: mergedReferences,
        }
        const persisted = await writeReferenceLibrarySnapshot(projectRoot, snapshot)
        this.applyLibrarySnapshot(persisted)
        const importedSelection = await resolveImportedSelectionReference(mergedReferences, markedReferences)
        if (importedSelection) {
          this.selectedReferenceId = importedSelection.id
        }
        this.ensureSelectedReferenceVisible()
        return {
          importedCount,
          selectedReferenceId: importedSelection?.id || '',
          selectedReference: importedSelection || null,
          reusedExisting: importedCount === 0 && !!importedSelection,
        }
      } finally {
        this.importInFlight = false
      }
    },

    async createCollection(projectRoot = '', label = '') {
      const trimmedLabel = String(label || '').trim()
      if (!trimmedLabel) return null

      const existingCollection = this.collections.find(
        (collection) => normalizedCollectionLabel(collection.label) === normalizedCollectionLabel(trimmedLabel)
      )
      if (existingCollection) return existingCollection

      let key = buildCollectionKey(trimmedLabel)
      let suffix = 2
      while (this.collections.some((collection) => collection.key === key)) {
        key = `${buildCollectionKey(trimmedLabel)}-${suffix}`
        suffix += 1
      }

      const nextCollection = {
        key,
        label: trimmedLabel,
      }

      this.collections = [...this.collections, nextCollection]
      await this.persistLibrarySnapshot(projectRoot)
      return nextCollection
    },

    async renameCollection(projectRoot = '', collectionKey = '', nextLabel = '') {
      const collection = resolveCollection(this.collections, collectionKey)
      const trimmedLabel = String(nextLabel || '').trim()
      if (!collection || !trimmedLabel) return null

      const duplicate = this.collections.find(
        (candidate) =>
          candidate.key !== collection.key &&
          normalizedCollectionLabel(candidate.label) === normalizedCollectionLabel(trimmedLabel)
      )
      if (duplicate) return null

      this.collections = this.collections.map((candidate) =>
        candidate.key === collection.key
          ? {
              ...candidate,
              label: trimmedLabel,
            }
          : candidate
      )

      this.references = this.references.map((reference) => {
        const memberships = Array.isArray(reference.collections) ? reference.collections : []
        if (memberships.length === 0) return reference

        const nextCollections = memberships.map((value) => {
          const normalizedValue = normalizeCollectionMembershipValue(value)
          if (
            normalizedValue === normalizeCollectionMembershipValue(collection.key) ||
            normalizedValue === normalizeCollectionMembershipValue(collection.label)
          ) {
            return collection.key
          }
          return value
        })

        return {
          ...reference,
          collections: nextCollections,
        }
      })

      await this.persistLibrarySnapshot(projectRoot)
      return this.collections.find((candidate) => candidate.key === collection.key) || null
    },

    async removeCollection(projectRoot = '', collectionKey = '') {
      const collection = resolveCollection(this.collections, collectionKey)
      if (!collection) return false

      this.collections = this.collections.filter((candidate) => candidate.key !== collection.key)
      this.references = this.references.map((reference) => {
        const memberships = Array.isArray(reference.collections) ? reference.collections : []
        if (memberships.length === 0) return reference

        const nextCollections = memberships.filter((value) => {
          const normalizedValue = normalizeCollectionMembershipValue(value)
          return (
            normalizedValue !== normalizeCollectionMembershipValue(collection.key) &&
            normalizedValue !== normalizeCollectionMembershipValue(collection.label)
          )
        })

        if (nextCollections.length === memberships.length) return reference
        return {
          ...reference,
          collections: nextCollections,
        }
      })

      if (normalizeCollectionMembershipValue(this.selectedCollectionKey) === normalizeCollectionMembershipValue(collection.key)) {
        this.selectedCollectionKey = ''
      }

      this.ensureSelectedReferenceVisible()

      await this.persistLibrarySnapshot(projectRoot)
      return true
    },

    setSelectedSection(sectionKey) {
      const exists = this.librarySections.some((section) => section.key === sectionKey)
      this.selectedSectionKey = exists ? sectionKey : 'all'
      this.selectedSourceKey = ''
      this.selectedCollectionKey = ''
      this.selectedTagKey = ''
      if (!this.filteredReferences.some((reference) => reference.id === this.selectedReferenceId)) {
        this.selectedReferenceId = this.filteredReferences[0]?.id || ''
      }
    },

    setSelectedSource(sourceKey = '') {
      const exists = this.sourceSections.some((section) => section.key === sourceKey)
      this.selectedSourceKey = exists ? sourceKey : ''
      this.selectedSectionKey = 'all'
      this.selectedCollectionKey = ''
      this.selectedTagKey = ''
      if (!this.filteredReferences.some((reference) => reference.id === this.selectedReferenceId)) {
        this.selectedReferenceId = this.filteredReferences[0]?.id || ''
      }
    },

    setSelectedCollection(collectionKey = '') {
      const collection = resolveCollection(this.collections, collectionKey)
      this.selectedCollectionKey = collection?.key || ''
      this.selectedSectionKey = 'all'
      this.selectedSourceKey = ''
      this.selectedTagKey = ''
      if (!this.filteredReferences.some((reference) => reference.id === this.selectedReferenceId)) {
        this.selectedReferenceId = this.filteredReferences[0]?.id || ''
      }
    },

    setSelectedTag(tagKey = '') {
      const normalized = normalizeTagKey(tagKey)
      const exists = this.tags.some((tag) => normalizeTagKey(tag.key) === normalized)
      this.selectedTagKey = exists ? normalized : ''
      this.selectedSectionKey = 'all'
      this.selectedSourceKey = ''
      this.selectedCollectionKey = ''
      if (!this.filteredReferences.some((reference) => reference.id === this.selectedReferenceId)) {
        this.selectedReferenceId = this.filteredReferences[0]?.id || ''
      }
    },

    setSearchQuery(value = '') {
      this.searchQuery = String(value || '')
      if (!this.filteredReferences.some((reference) => reference.id === this.selectedReferenceId)) {
        this.selectedReferenceId = this.filteredReferences[0]?.id || ''
      }
    },

    setSortKey(value = '') {
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
      if (!this.filteredReferences.some((reference) => reference.id === this.selectedReferenceId)) {
        this.selectedReferenceId = this.filteredReferences[0]?.id || ''
      }
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
      return this.sortedLibrary.filter((reference) =>
        normalizedReferenceSearchText(reference).includes(normalizedQuery)
      )
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

      this.references = [...this.references, nextReference]
      this.tags = buildTagRegistry(this.tags, this.references)
      this.selectedReferenceId = nextReference.id
      this.ensureSelectedReferenceVisible()
      if (persist) await this.persistLibrarySnapshot(projectRoot)
      return nextReference
    },

    async updateReference(projectRoot = '', referenceId = '', updates = {}, options = {}) {
      const { persist = true } = options
      const referenceIndex = this.references.findIndex((reference) => reference.id === referenceId)
      if (referenceIndex === -1) return false

      const normalizedReference = await normalizeReferenceRecordWithBackend({
        ...this.references[referenceIndex],
        ...updates,
      })

      this.references = this.references.map((reference, index) =>
        index === referenceIndex ? normalizedReference : reference
      )

      this.tags = buildTagRegistry(this.tags, this.references)
      this.ensureSelectedReferenceVisible()
      if (persist) await this.persistLibrarySnapshot(projectRoot)
      return true
    },

    async removeReference(projectRoot = '', referenceId = '') {
      const target = this.references.find((reference) => reference.id === referenceId)
      if (!target) return false

      this.references = this.references.filter((reference) => reference.id !== referenceId)
      this.tags = buildTagRegistry(this.tags, this.references)
      if (this.selectedReferenceId === referenceId) {
        this.selectedReferenceId = this.filteredReferences[0]?.id || ''
      }
      await this.persistLibrarySnapshot(projectRoot)

      if (target._pushedByApp && target._zoteroKey) {
        deleteFromZotero(target).catch(() => {})
      }
      return true
    },

    async toggleReferenceCollection(projectRoot = '', referenceId = '', collectionKey = '') {
      const collection = resolveCollection(this.collections, collectionKey)
      if (!collection) return false

      const referenceIndex = this.references.findIndex((reference) => reference.id === referenceId)
      if (referenceIndex === -1) return false

      const reference = this.references[referenceIndex]
      const currentCollections = Array.isArray(reference.collections) ? reference.collections : []
      const isMember = referenceHasCollection(reference, collection)
      const nextCollections = currentCollections.filter((value) => {
        const normalizedValue = normalizeCollectionMembershipValue(value)
        return (
          normalizedValue !== normalizeCollectionMembershipValue(collection.key) &&
          normalizedValue !== normalizeCollectionMembershipValue(collection.label)
        )
      })

      if (!isMember) {
        nextCollections.push(collection.key)
      }

      this.references = this.references.map((candidate, index) =>
        index === referenceIndex
          ? {
              ...candidate,
              collections: nextCollections,
            }
          : candidate
      )

      this.tags = buildTagRegistry(this.tags, this.references)
      this.ensureSelectedReferenceVisible()
      await this.persistLibrarySnapshot(projectRoot)
      return !isMember
    },

    async attachReferencePdf(projectRoot = '', referenceId = '', sourcePath = '') {
      const referenceIndex = this.references.findIndex((reference) => reference.id === referenceId)
      if (referenceIndex === -1) return null

      const updatedReference = await storeReferencePdf(
        projectRoot,
        this.references[referenceIndex],
        sourcePath
      )

      this.references = this.references.map((candidate, index) =>
        index === referenceIndex ? updatedReference : candidate
      )
      await this.persistLibrarySnapshot(projectRoot)
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
      this.isLoading = false
      this.loadError = ''
      this.importInFlight = false
    },
  },
})
