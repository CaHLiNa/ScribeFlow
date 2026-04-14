import { defineStore, getActivePinia } from 'pinia'
import { t } from '../i18n/index.js'
import { formatCitation, formatCitationAsync } from '../services/references/citationFormatter.js'
import {
  citationStyleUsesFastPath,
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
  normalizeReferenceLibrarySnapshot,
  readOrCreateReferenceLibrarySnapshot,
  writeReferenceLibrarySnapshot,
} from '../services/references/referenceLibraryIO.js'
import {
  findDuplicateReference,
  importReferenceFromPdf,
  importReferencesFromText,
  mergeImportedReferences,
  parseBibTeXText,
  parseReferenceImportText,
} from '../services/references/bibtexImport.js'
import { normalizeReferenceSearchTokens } from '../domains/references/referenceInterop.js'
import { deriveStyleId, parseCslMetadata } from '../utils/cslParser.js'

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

function referenceHasPdf(reference = {}) {
  return String(reference.pdfPath || '').trim().length > 0 || reference.hasPdf === true
}

async function shouldMarkReferenceForZoteroPush() {
  try {
    const { loadZoteroConfig } = await import('../services/references/zoteroSync.js')
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

    filteredReferences: (state) =>
      state.references
        .filter((reference) => filterReferenceBySection(reference, state.selectedSectionKey))
        .filter((reference) => filterReferenceBySource(reference, state.selectedSourceKey))
        .filter((reference) =>
          filterReferenceByCollection(reference, state.selectedCollectionKey, state.collections)
        )
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
    async persistLibrarySnapshot(projectRoot = '') {
      const snapshot = {
        version: 2,
        citationStyle: this.citationStyle,
        collections: this.collections,
        tags: this.tags,
        references: this.references,
      }
      await writeReferenceLibrarySnapshot(projectRoot, snapshot)
      return snapshot
    },

    applyLibrarySnapshot(snapshot = {}) {
      const normalized = {
        ...buildDefaultReferenceLibrarySnapshot(),
        ...normalizeReferenceLibrarySnapshot(snapshot),
      }

      this.collections = normalized.collections
      this.tags = normalized.tags
      this.references = normalized.references
      this.citationStyle = String(normalized.citationStyle || 'apa')
      if (!resolveCollection(this.collections, this.selectedCollectionKey)) {
        this.selectedCollectionKey = ''
      }
      if (!this.sourceSections.some((section) => section.key === this.selectedSourceKey)) {
        this.selectedSourceKey = ''
      }

      if (!this.references.some((reference) => reference.id === this.selectedReferenceId)) {
        this.selectedReferenceId = this.references[0]?.id || ''
      }
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
      const workspaceModule = await import('../stores/workspace.js')
      const workspace = workspaceModule.useWorkspaceStore()
      const workspacePath = String(workspace.path || '').trim()
      if (!workspacePath) {
        setUserCitationStyles([])
        return []
      }

      const { invoke } = await import('@tauri-apps/api/core')
      const stylesDir = `${workspacePath}/styles`
      const exists = await invoke('path_exists', { path: stylesDir }).catch(() => false)
      if (!exists) {
        setUserCitationStyles([])
        return []
      }

      const entries = await invoke('read_dir', { path: stylesDir }).catch(() => [])
      const styles = []
      for (const entry of Array.isArray(entries) ? entries : []) {
        if (!entry?.name?.endsWith('.csl')) continue
        try {
          const xml = await invoke('read_file', { path: `${stylesDir}/${entry.name}` })
          const metadata = parseCslMetadata(xml)
          styles.push({
            id: deriveStyleId(metadata.id, metadata.title),
            name: metadata.title,
            category: metadata.category || 'Custom',
            filename: entry.name,
          })
        } catch {
          // Skip malformed user styles.
        }
      }

      setUserCitationStyles(styles)
      return styles
    },

    async importBibTeXContent(projectRoot = '', content = '') {
      return this.importReferenceText(projectRoot, content, 'bibtex')
    },

    async importReferenceText(projectRoot = '', content = '', format = 'auto') {
      const importedReferences =
        format === 'bibtex' ? parseBibTeXText(content) : parseReferenceImportText(content, format)
      const shouldMark = importedReferences.length > 0 ? await shouldMarkReferenceForZoteroPush() : false
      const markedReferences = shouldMark
        ? importedReferences.map((reference) => ({ ...reference, _shouldersPushPending: true }))
        : importedReferences
      const mergedReferences = mergeImportedReferences(this.references, markedReferences)
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
        await writeReferenceLibrarySnapshot(projectRoot, snapshot)
        this.applyLibrarySnapshot(snapshot)
        if (markedReferences[0]) {
          const importedSelection = mergedReferences.find((reference) => {
            if (markedReferences.some((candidate) => candidate.id === reference.id)) return true
            return Boolean(findDuplicateReference(markedReferences, reference))
          })
          if (importedSelection) this.selectedReferenceId = importedSelection.id
        }
        return importedCount
      } finally {
        this.importInFlight = false
      }
    },

    async importResolvedReferenceText(projectRoot = '', content = '') {
      this.importInFlight = true
      try {
        const importedReferences = await importReferencesFromText(content)
        if (importedReferences.length === 0) return 0

        const shouldMark = await shouldMarkReferenceForZoteroPush()
        const markedReferences = shouldMark
          ? importedReferences.map((reference) => ({ ...reference, _shouldersPushPending: true }))
          : importedReferences
        const mergedReferences = mergeImportedReferences(this.references, markedReferences)
        const importedCount = Math.max(0, mergedReferences.length - this.references.length)
        const snapshot = {
          version: 2,
          citationStyle: this.citationStyle,
          collections: this.collections,
          tags: this.tags,
          references: mergedReferences,
        }
        await writeReferenceLibrarySnapshot(projectRoot, snapshot)
        this.applyLibrarySnapshot(snapshot)
        if (markedReferences[0]) {
          const importedSelection = mergedReferences.find((reference) => {
            if (markedReferences.some((candidate) => candidate.id === reference.id)) return true
            return Boolean(findDuplicateReference(markedReferences, reference))
          })
          if (importedSelection) {
            this.selectedReferenceId = importedSelection.id
          }
        }
        return importedCount
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

      if (!this.filteredReferences.some((reference) => reference.id === this.selectedReferenceId)) {
        this.selectedReferenceId = this.filteredReferences[0]?.id || ''
      }

      await this.persistLibrarySnapshot(projectRoot)
      return true
    },

    setSelectedSection(sectionKey) {
      const exists = this.librarySections.some((section) => section.key === sectionKey)
      this.selectedSectionKey = exists ? sectionKey : 'all'
      this.selectedSourceKey = ''
      this.selectedCollectionKey = ''
      if (!this.filteredReferences.some((reference) => reference.id === this.selectedReferenceId)) {
        this.selectedReferenceId = this.filteredReferences[0]?.id || ''
      }
    },

    setSelectedSource(sourceKey = '') {
      const exists = this.sourceSections.some((section) => section.key === sourceKey)
      this.selectedSourceKey = exists ? sourceKey : ''
      this.selectedSectionKey = 'all'
      this.selectedCollectionKey = ''
      if (!this.filteredReferences.some((reference) => reference.id === this.selectedReferenceId)) {
        this.selectedReferenceId = this.filteredReferences[0]?.id || ''
      }
    },

    setSelectedCollection(collectionKey = '') {
      const collection = resolveCollection(this.collections, collectionKey)
      this.selectedCollectionKey = collection?.key || ''
      this.selectedSectionKey = 'all'
      this.selectedSourceKey = ''
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
      const duplicate = findDuplicateReference(this.references, reference)
      if (duplicate) return duplicate

      const shouldMark = markForZoteroPush ? await shouldMarkReferenceForZoteroPush() : false
      const nextReference = {
        ...reference,
        _shouldersPushPending: shouldMark ? true : reference._shouldersPushPending === true,
      }

      this.references = [...this.references, nextReference]
      this.selectedReferenceId = nextReference.id
      if (persist) await this.persistLibrarySnapshot(projectRoot)
      return nextReference
    },

    async updateReference(projectRoot = '', referenceId = '', updates = {}, options = {}) {
      const { persist = true } = options
      const referenceIndex = this.references.findIndex((reference) => reference.id === referenceId)
      if (referenceIndex === -1) return false

      this.references = this.references.map((reference, index) =>
        index === referenceIndex
          ? {
              ...reference,
              ...updates,
            }
          : reference
      )

      if (persist) await this.persistLibrarySnapshot(projectRoot)
      return true
    },

    async removeReference(projectRoot = '', referenceId = '') {
      const target = this.references.find((reference) => reference.id === referenceId)
      if (!target) return false

      this.references = this.references.filter((reference) => reference.id !== referenceId)
      if (this.selectedReferenceId === referenceId) {
        this.selectedReferenceId = this.filteredReferences[0]?.id || ''
      }
      await this.persistLibrarySnapshot(projectRoot)

      if (target._pushedByShoulders && target._zoteroKey) {
        import('../services/references/zoteroSync.js')
          .then(({ deleteFromZotero }) => deleteFromZotero(target))
          .catch(() => {})
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

        const duplicate = findDuplicateReference(this.references, importedReference)
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

    exportBibTeX(referenceIds = []) {
      const references = Array.isArray(referenceIds) && referenceIds.length > 0
        ? referenceIds
            .map((referenceId) => this.references.find((reference) => reference.id === referenceId))
            .filter(Boolean)
        : this.references
      return exportReferencesToBibTeX(references)
    },

    formatReferenceCitation(referenceId = '', mode = 'reference', number) {
      const reference = this.references.find((candidate) => candidate.id === referenceId)
      if (!reference) return ''
      return formatCitation(this.citationStyle, mode, reference, number)
    },

    async formatReferenceCitationAsync(referenceId = '', mode = 'reference', number) {
      const reference = this.references.find((candidate) => candidate.id === referenceId)
      if (!reference) return ''
      if (citationStyleUsesFastPath(this.citationStyle)) {
        return formatCitation(this.citationStyle, mode, reference, number)
      }
      return formatCitationAsync(this.citationStyle, mode, reference, number)
    },

    cleanup() {
      this.collections = REFERENCE_COLLECTIONS
      this.tags = REFERENCE_TAGS
      this.references = REFERENCE_FIXTURES
      this.citationStyle = 'apa'
      this.selectedSectionKey = 'all'
      this.selectedSourceKey = ''
      this.selectedCollectionKey = ''
      this.selectedReferenceId = REFERENCE_FIXTURES[0]?.id || ''
      this.searchQuery = ''
      this.sortKey = 'year-desc'
      this.isLoading = false
      this.loadError = ''
      this.importInFlight = false
    },
  },
})
