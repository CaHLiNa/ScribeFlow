import { defineStore } from 'pinia'
import { t } from '../i18n/index.js'
import {
  REFERENCE_COLLECTIONS,
  REFERENCE_FIXTURES,
  REFERENCE_LIBRARY_SECTIONS,
  REFERENCE_TAGS,
} from '../services/references/referenceLibraryFixtures.js'
import {
  buildDefaultReferenceLibrarySnapshot,
  normalizeReferenceLibrarySnapshot,
  readOrCreateReferenceLibrarySnapshot,
  writeReferenceLibrarySnapshot,
} from '../services/references/referenceLibraryIO.js'
import { mergeImportedReferences, parseBibTeXText } from '../services/references/bibtexImport.js'

function filterReferenceBySection(reference, sectionKey) {
  if (sectionKey === 'unfiled') return !reference.collections.length
  if (sectionKey === 'missing-identifier') return !String(reference.identifier || '').trim()
  if (sectionKey === 'missing-pdf') return reference.hasPdf !== true
  return true
}

export const useReferencesStore = defineStore('references', {
  state: () => ({
    librarySections: REFERENCE_LIBRARY_SECTIONS,
    collections: REFERENCE_COLLECTIONS,
    tags: REFERENCE_TAGS,
    references: REFERENCE_FIXTURES,
    selectedSectionKey: 'all',
    selectedReferenceId: REFERENCE_FIXTURES[0]?.id || '',
    detailTab: 'metadata',
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

    filteredReferences: (state) =>
      state.references.filter((reference) =>
        filterReferenceBySection(reference, state.selectedSectionKey)
      ),

    selectedReference(state) {
      return (
        state.references.find((reference) => reference.id === state.selectedReferenceId) ||
        this.filteredReferences[0] ||
        null
      )
    },
  },

  actions: {
    applyLibrarySnapshot(snapshot = {}) {
      const normalized = {
        ...buildDefaultReferenceLibrarySnapshot(),
        ...normalizeReferenceLibrarySnapshot(snapshot),
      }

      this.collections = normalized.collections
      this.tags = normalized.tags
      this.references = normalized.references

      if (!this.references.some((reference) => reference.id === this.selectedReferenceId)) {
        this.selectedReferenceId = this.references[0]?.id || ''
      }
    },

    async loadWorkspaceLibrary(workspaceDataDir = '') {
      this.isLoading = true
      this.loadError = ''

      try {
        const snapshot = await readOrCreateReferenceLibrarySnapshot(workspaceDataDir)
        this.applyLibrarySnapshot(snapshot)
      } catch (error) {
        this.loadError = error?.message || t('Failed to load reference library')
        this.applyLibrarySnapshot(buildDefaultReferenceLibrarySnapshot())
      } finally {
        this.isLoading = false
      }
    },

    async importBibTeXContent(workspaceDataDir = '', content = '') {
      const importedReferences = parseBibTeXText(content)
      const mergedReferences = mergeImportedReferences(this.references, importedReferences)
      const importedCount = Math.max(0, mergedReferences.length - this.references.length)

      this.importInFlight = true
      try {
        const snapshot = {
          version: 1,
          collections: this.collections,
          tags: this.tags,
          references: mergedReferences,
        }
        await writeReferenceLibrarySnapshot(workspaceDataDir, snapshot)
        this.applyLibrarySnapshot(snapshot)
        if (importedReferences[0]?.id) {
          const importedSelection = mergedReferences.find((reference) =>
            importedReferences.some((candidate) => candidate.id === reference.id)
          )
          if (importedSelection) {
            this.selectedReferenceId = importedSelection.id
          }
        }
        return importedCount
      } finally {
        this.importInFlight = false
      }
    },

    setSelectedSection(sectionKey) {
      const exists = this.librarySections.some((section) => section.key === sectionKey)
      this.selectedSectionKey = exists ? sectionKey : 'all'
      if (!this.filteredReferences.some((reference) => reference.id === this.selectedReferenceId)) {
        this.selectedReferenceId = this.filteredReferences[0]?.id || ''
      }
    },

    selectReference(referenceId) {
      if (!this.references.some((reference) => reference.id === referenceId)) return
      this.selectedReferenceId = referenceId
    },

    setDetailTab(tab) {
      this.detailTab = tab === 'annotations' ? 'annotations' : 'metadata'
    },

    cleanup() {
      this.collections = REFERENCE_COLLECTIONS
      this.tags = REFERENCE_TAGS
      this.references = REFERENCE_FIXTURES
      this.selectedSectionKey = 'all'
      this.selectedReferenceId = REFERENCE_FIXTURES[0]?.id || ''
      this.detailTab = 'metadata'
      this.isLoading = false
      this.loadError = ''
      this.importInFlight = false
    },
  },
})
