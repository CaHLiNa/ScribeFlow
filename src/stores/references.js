import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { events } from '../services/telemetry'
import { useWorkspaceStore } from './workspace'
import { useEditorStore } from './editor'
import { useFilesStore } from './files'
import { buildReferenceKey } from '../utils/referenceKeys'
import {
  addReferenceTags,
  normalizeReferenceCollections,
  normalizeReferenceTags,
  removeReferenceTags,
  replaceReferenceTags,
  sanitizeReferenceRecord,
  updateReferenceWorkflowField,
} from '../domains/reference/referenceMetadata'
import {
  addReferenceCollection,
  createReferenceSavedView,
  createReferenceWorkbenchCollection,
  deleteReferenceSavedView,
  deleteReferenceWorkbenchCollection,
  sanitizeReferenceWorkbenchState,
  toggleReferenceCollection,
  removeReferenceCollection,
} from '../domains/reference/referenceWorkbench'
import {
  exportReferencesAsBibTeX,
  exportReferencesAsRis,
  searchReferences,
  searchSortedReferences,
  sortReferences,
} from '../domains/reference/referenceSearchExport'
import { createReferenceLibraryRuntime } from '../domains/reference/referenceLibraryRuntime'
import { createReferenceLibraryLoadRuntime } from '../domains/reference/referenceLibraryLoadRuntime'
import { createReferenceAssetRuntime } from '../domains/reference/referenceAssetRuntime'
import { createReferenceCrudRuntime } from '../domains/reference/referenceCrudRuntime'
import { createReferenceMigrationRuntime } from '../domains/reference/referenceMigrationRuntime'
import { createReferenceMutationRuntime } from '../domains/reference/referenceMutationRuntime'
import { createReferenceWorkspaceViewRuntime } from '../domains/reference/referenceWorkspaceViewRuntime'
import {
  auditReferenceImportCandidate,
  buildMergedReference,
  cloneReferenceValue,
  prepareReferenceImport,
} from '../domains/reference/referenceImportMerge'
import {
  copyFileIfPresent,
  deleteLegacyWorkspaceReferenceLibrary,
  ensureReferenceStorageReady,
  loadPersistedCitationStyle,
  loadReferenceUserStyles,
  readFileIfExists,
  readJsonArray,
  readWorkspaceReferenceCollection,
} from '../domains/reference/referenceStorageIO'
import {
  createEmptyGlobalReferenceWorkbench,
  createEmptyWorkspaceReferenceCollection,
  parseGlobalReferenceWorkbench,
  resolveGlobalReferenceFulltextPath,
  resolveGlobalReferenceLibraryPath,
  resolveGlobalReferencePdfPath,
  resolveGlobalReferencePdfsDir,
  resolveGlobalReferenceWorkbenchPath,
  resolveGlobalReferenceFulltextDir,
  resolveLegacyWorkspaceReferenceFulltextDir,
  resolveLegacyWorkspaceReferenceLibraryPath,
  resolveLegacyWorkspaceReferencePdfsDir,
  resolveWorkspaceReferenceCollectionPath,
  resolveWorkspaceReferencesDir,
} from '../services/referenceLibraryPaths'

const EDITABLE_REFERENCE_KEY_RE = /^[A-Za-z][A-Za-z0-9:_.-]*$/

function normalizeEditableReferenceKey(value) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
}

function referenceKey(ref = {}) {
  return ref?._key || ref?.id || null
}

async function extractPdfTextLazily(path) {
  const { extractTextFromPdf } = await import('../utils/pdfMetadata.js')
  return extractTextFromPdf(path)
}


function buildKeyMapFromList(list = []) {
  const map = {}
  for (let i = 0; i < list.length; i += 1) {
    const key = referenceKey(list[i])
    if (key) map[key] = i
  }
  return map
}

function buildWorkspaceLibrary(globalLibrary = [], globalKeyMap = {}, workspaceKeys = []) {
  const seen = new Set()
  const library = []
  const keys = []

  for (const key of workspaceKeys || []) {
    if (!key || seen.has(key)) continue
    const idx = globalKeyMap[key]
    if (idx === undefined) continue
    seen.add(key)
    library.push(globalLibrary[idx])
    keys.push(key)
  }

  return { library, keys }
}

export const useReferencesStore = defineStore('references', {
  state: () => ({
    library: [],
    keyMap: {},         // citeKey → index in library
    globalLibrary: [],
    globalKeyMap: {},
    workspaceKeys: [],
    collections: [],
    savedViews: [],
    initialized: false,
    loading: false,
    activeKey: null,
    libraryDetailMode: 'browse',
    selectedKeys: new Set(),
    sortBy: 'addedAt',  // field name: 'addedAt' | 'author' | 'year' | 'title'
    sortDir: 'desc',    // 'asc' | 'desc'
    citationStyle: 'apa',
    _loadGeneration: 0,
  }),

  getters: {
    getByKey: (state) => (key) => {
      const globalIdx = state.globalKeyMap[key]
      if (globalIdx !== undefined) return state.globalLibrary[globalIdx]
      const idx = state.keyMap[key]
      return idx !== undefined ? state.library[idx] : null
    },

    allKeys: (state) => state.globalLibrary.map((ref) => referenceKey(ref)).filter(Boolean),

    refCount: (state) => state.library.length,

    refsWithPdf: (state) => state.library.filter(r => r._pdfFile),

    sortedLibrary: (state) => sortReferences(state.library, state.sortBy, state.sortDir),

    sortedGlobalLibrary: (state) => sortReferences(state.globalLibrary, state.sortBy, state.sortDir),

    // Citation index: key → [filePaths] that cite it
    citedIn: (state) => {
      const filesStore = useFilesStore()
      const map = {}
      // Pandoc-style: [@key], [@key1; @key2]
      const citationRe = /\[([^\][]*@[a-zA-Z][\w]*[^\][]*)\]/g
      const keyRe = /@([a-zA-Z][\w]*)/g
      // LaTeX-style: \cite{key}, \citep{key1, key2}
      const latexCiteRe = /\\(?:cite[tp]?|citealp|citealt|citeauthor|citeyear|autocite|textcite|parencite|nocite|footcite|fullcite|supercite|smartcite|Cite[tp]?|Parencite|Textcite|Autocite|Smartcite|Footcite|Fullcite)\{([^}]*)\}/g
      const latexKeyRe = /([a-zA-Z][\w.-]*)/g
      const typstCiteRe = /(^|[^\w])@([a-zA-Z][\w.-]*)/gm

      for (const [path, content] of Object.entries(filesStore.fileContents)) {
        if (!content) continue

        if (path.endsWith('.md')) {
          citationRe.lastIndex = 0
          let match
          while ((match = citationRe.exec(content)) !== null) {
            keyRe.lastIndex = 0
            let keyMatch
            while ((keyMatch = keyRe.exec(match[1])) !== null) {
              const key = keyMatch[1]
              if (!map[key]) map[key] = []
              if (!map[key].includes(path)) map[key].push(path)
            }
          }
        } else if (path.endsWith('.tex') || path.endsWith('.latex')) {
          latexCiteRe.lastIndex = 0
          let match
          while ((match = latexCiteRe.exec(content)) !== null) {
            latexKeyRe.lastIndex = 0
            let keyMatch
            while ((keyMatch = latexKeyRe.exec(match[1])) !== null) {
              const key = keyMatch[1]
              if (!map[key]) map[key] = []
              if (!map[key].includes(path)) map[key].push(path)
            }
          }
        } else if (path.endsWith('.typ')) {
          typstCiteRe.lastIndex = 0
          let match
          while ((match = typstCiteRe.exec(content)) !== null) {
            const key = match[2]
            if (!map[key]) map[key] = []
            if (!map[key].includes(path)) map[key].push(path)
          }
        }
      }
      return map
    },

    citedKeys() {
      return new Set(Object.keys(this.citedIn))
    },
  },

  actions: {
    _getReferenceLibraryRuntime() {
      if (!this._referenceLibraryRuntime) {
        this._referenceLibraryRuntime = createReferenceLibraryRuntime({
          captureWorkspaceContext: () => this._captureWorkspaceContext(),
          matchesWorkspaceContext: (context) => this._matchesWorkspaceContext(context),
          loadLibrary: () => this.loadLibrary(),
          getGlobalLibrary: () => this.globalLibrary,
          getCollections: () => this.collections,
          getSavedViews: () => this.savedViews,
          getWorkspaceKeys: () => this.workspaceKeys,
          createEmptyGlobalReferenceWorkbench,
          createEmptyWorkspaceReferenceCollection,
          resolveGlobalReferenceLibraryPath,
          resolveGlobalReferenceWorkbenchPath,
          resolveWorkspaceReferenceCollectionPath,
          invoke,
          listenToFsChange: (handler) => listen('fs-change', handler),
        })
      }
      return this._referenceLibraryRuntime
    },

    _getReferenceLibraryLoadRuntime() {
      if (!this._referenceLibraryLoadRuntime) {
        this._referenceLibraryLoadRuntime = createReferenceLibraryLoadRuntime({
          getWorkspacePath: () => useWorkspaceStore().path,
          getProjectDir: () => useWorkspaceStore().projectDir,
          getGlobalConfigDir: () => useWorkspaceStore().globalConfigDir,
          getLoadGeneration: () => this._loadGeneration,
          setLoadGeneration: (value) => {
            this._loadGeneration = value
          },
          getGlobalLibrary: () => this.globalLibrary,
          getActiveKey: () => this.activeKey,
          setLoading: (value) => {
            this.loading = value
          },
          setGlobalLibrary: (value) => {
            this.globalLibrary = value
          },
          setGlobalKeyMap: (value) => {
            this.globalKeyMap = value
          },
          setCollections: (value) => {
            this.collections = value
          },
          setSavedViews: (value) => {
            this.savedViews = value
          },
          setLibrary: (value) => {
            this.library = value
          },
          setWorkspaceKeys: (value) => {
            this.workspaceKeys = value
          },
          setKeyMap: (value) => {
            this.keyMap = value
          },
          setActiveKey: (value) => {
            this.activeKey = value
          },
          setLibraryDetailMode: (value) => {
            this.libraryDetailMode = value
          },
          setCitationStyle: (value) => {
            this.citationStyle = value
          },
          setInitialized: (value) => {
            this.initialized = value
          },
          ensureReferenceStorageReady,
          readJsonArray: (globalConfigDir) => readJsonArray(resolveGlobalReferenceLibraryPath(globalConfigDir)),
          readWorkspaceReferenceCollection: (projectDir) => readWorkspaceReferenceCollection(resolveWorkspaceReferenceCollectionPath(projectDir)),
          readFileIfExists: (globalConfigDir) => readFileIfExists(resolveGlobalReferenceWorkbenchPath(globalConfigDir)),
          parseGlobalReferenceWorkbench,
          sanitizeReferenceWorkbenchState,
          migrateLegacyWorkspaceData: (context, payload) => this._migrateLegacyWorkspaceData(context, payload),
          sanitizeReferenceRecord,
          referenceKey,
          buildKeyMapFromList,
          buildWorkspaceLibrary,
          writeLibraries: (context) => this._getReferenceLibraryRuntime().writeLibraries(context),
          deleteLegacyWorkspaceReferenceLibrary,
          loadPersistedCitationStyle,
          loadReferenceUserStyles,
          startWatching: (context) => this._getReferenceLibraryRuntime().startWatching(context),
        })
      }
      return this._referenceLibraryLoadRuntime
    },

    _getReferenceMigrationRuntime() {
      if (!this._referenceMigrationRuntime) {
        this._referenceMigrationRuntime = createReferenceMigrationRuntime({
          captureWorkspaceContext: () => this._captureWorkspaceContext(),
          readJsonArray,
          resolveLegacyWorkspaceReferenceLibraryPath,
          resolveLegacyWorkspaceReferencePdfsDir,
          resolveLegacyWorkspaceReferenceFulltextDir,
          resolveGlobalReferencePdfPath,
          resolveGlobalReferenceFulltextPath,
          buildReferenceKey,
          referenceKey,
          cloneReferenceValue,
          buildKeyMapFromList,
          copyFileIfPresent,
          pathExists: (path) => invoke('path_exists', { path }),
          deletePath: (path) => invoke('delete_path', { path }),
        })
      }
      return this._referenceMigrationRuntime
    },

    _getReferenceWorkspaceViewRuntime() {
      if (!this._referenceWorkspaceViewRuntime) {
        this._referenceWorkspaceViewRuntime = createReferenceWorkspaceViewRuntime({
          getGlobalLibrary: () => this.globalLibrary,
          setGlobalLibrary: (value) => {
            this.globalLibrary = value
          },
          setGlobalKeyMap: (value) => {
            this.globalKeyMap = value
          },
          getWorkspaceKeys: () => this.workspaceKeys,
          setWorkspaceKeys: (value) => {
            this.workspaceKeys = value
          },
          setLibrary: (value) => {
            this.library = value
          },
          setKeyMap: (value) => {
            this.keyMap = value
          },
          getActiveKey: () => this.activeKey,
          setActiveKey: (value) => {
            this.activeKey = value
          },
          setLibraryDetailMode: (value) => {
            this.libraryDetailMode = value
          },
          getSelectedKeys: () => this.selectedKeys,
          setSelectedKeys: (value) => {
            this.selectedKeys = value
          },
          buildKeyMapFromList,
          buildWorkspaceLibrary,
          referenceKey,
          saveLibrary: () => this.saveLibrary(),
        })
      }
      return this._referenceWorkspaceViewRuntime
    },

    _getReferenceMutationRuntime() {
      if (!this._referenceMutationRuntime) {
        this._referenceMutationRuntime = createReferenceMutationRuntime({
          getGlobalLibrary: () => this.globalLibrary,
          getGlobalKeyMap: () => this.globalKeyMap,
          getCollections: () => this.collections,
          setCollections: (value) => {
            this.collections = value
          },
          getSavedViews: () => this.savedViews,
          setSavedViews: (value) => {
            this.savedViews = value
          },
          commitGlobalReferenceMutations: (changed) => this._commitGlobalReferenceMutations(changed),
          commitWorkbenchMutations: (changed) => this._commitWorkbenchMutations(changed),
          createReferenceWorkbenchCollection,
          deleteReferenceWorkbenchCollection,
          createReferenceSavedView,
          deleteReferenceSavedView,
          addReferenceCollection,
          removeReferenceCollection,
          toggleReferenceCollection,
          updateReferenceWorkflowField,
          addReferenceTags,
          replaceReferenceTags,
          removeReferenceTags,
        })
      }
      return this._referenceMutationRuntime
    },

    _getReferenceCrudRuntime() {
      if (!this._referenceCrudRuntime) {
        this._referenceCrudRuntime = createReferenceCrudRuntime({
          getGlobalLibrary: () => this.globalLibrary,
          getGlobalKeyMap: () => this.globalKeyMap,
          getWorkspaceKeys: () => this.workspaceKeys,
          setWorkspaceKeys: (value) => {
            this.workspaceKeys = value
          },
          getByKey: (key) => this.getByKey(key),
          syncWorkspaceView: () => this._syncWorkspaceView(),
          saveLibrary: () => this.saveLibrary(),
          generateKey: (ref) => this.generateKey(ref),
          auditImportCandidate: (ref) => this.auditImportCandidate(ref),
          addKeyToWorkspace: (key) => this.addKeyToWorkspace(key),
          prepareReferenceImport,
          buildMergedReference,
          trackReferenceImport: (method) => events.refImport(method),
        })
      }
      return this._referenceCrudRuntime
    },

    _getReferenceAssetRuntime() {
      if (!this._referenceAssetRuntime) {
        this._referenceAssetRuntime = createReferenceAssetRuntime({
          getGlobalLibrary: () => this.globalLibrary,
          getGlobalKeyMap: () => this.globalKeyMap,
          getGlobalConfigDir: () => useWorkspaceStore().globalConfigDir,
          applyGlobalRemoval: (keys) => this._getReferenceWorkspaceViewRuntime().applyGlobalRemoval(keys),
          deleteReferenceAsset: (path) => this._deleteReferenceAsset(path),
          writeLibraries: () => this._writeLibraries(),
          updateReference: (key, updates) => this.updateReference(key, updates),
          resolveGlobalReferencePdfPath,
          resolveGlobalReferenceFulltextPath,
          resolveGlobalReferencePdfsDir,
          resolveGlobalReferenceFulltextDir,
          invoke,
          extractTextFromPdf: (path) => extractPdfTextLazily(path),
        })
      }
      return this._referenceAssetRuntime
    },

    // --- Persistence ---

    _captureWorkspaceContext() {
      return this._getReferenceLibraryLoadRuntime().captureWorkspaceContext()
    },

    _matchesWorkspaceContext(context) {
      return this._getReferenceLibraryLoadRuntime().matchesWorkspaceContext(context)
    },

    _beginLoadContext() {
      return this._getReferenceLibraryLoadRuntime().beginLoadContext()
    },

    _isLoadStale(context) {
      return this._getReferenceLibraryLoadRuntime().isLoadStale(context)
    },

    async loadLibrary() {
      return this._getReferenceLibraryLoadRuntime().loadLibrary()
    },

    async saveLibrary(options = {}) {
      return this._getReferenceLibraryRuntime().saveLibrary(options)
    },

    async _doSave(context = this._captureWorkspaceContext()) {
      return this._getReferenceLibraryRuntime().doSave(context)
    },

    async _writeLibraries(context = this._captureWorkspaceContext()) {
      return this._getReferenceLibraryRuntime().writeLibraries(context)
    },

    async startWatching(context = this._captureWorkspaceContext()) {
      return this._getReferenceLibraryRuntime().startWatching(context)
    },

    stopWatching() {
      return this._getReferenceLibraryRuntime().stopWatching()
    },

    cleanup(options = {}) {
      const { preserveGlobalLibrary = false } = options
      this._getReferenceLibraryRuntime().cleanup()
      this._loadGeneration += 1
      this.library = []
      this.keyMap = {}
      if (!preserveGlobalLibrary) {
        this.globalLibrary = []
        this.globalKeyMap = {}
        this.collections = []
        this.savedViews = []
      }
      this.workspaceKeys = []
      this.initialized = false
      this.loading = false
      this.activeKey = null
      this.libraryDetailMode = 'browse'
      this.selectedKeys = new Set()
      this.citationStyle = 'apa'
    },

    async setCitationStyle(style) {
      this.citationStyle = style
      const workspace = useWorkspaceStore()
      if (!workspace.projectDir) return
      try {
        await invoke('write_file', {
          path: `${workspace.projectDir}/citation-style.json`,
          content: JSON.stringify({ citationStyle: style }),
        })
      } catch (e) {
        console.warn('Failed to save citation style:', e)
      }
    },

    _syncWorkspaceView() {
      return this._getReferenceWorkspaceViewRuntime().syncWorkspaceView()
    },

    async _deleteReferenceAsset(path) {
      return this._getReferenceMigrationRuntime().deleteReferenceAsset(path)
    },

    async _migrateLegacyWorkspaceData(context = this._captureWorkspaceContext(), { globalLibrary = [], workspaceKeys = [] } = {}) {
      return this._getReferenceMigrationRuntime().migrateLegacyWorkspaceData(context, { globalLibrary, workspaceKeys })
    },

    async _migrateLegacyReferenceAssets(context = this._captureWorkspaceContext(), targetRef, legacyRef, key) {
      return this._getReferenceMigrationRuntime().migrateLegacyReferenceAssets(context, targetRef, legacyRef, key)
    },

    // --- CRUD ---

    addReference(cslJson) {
      return this._getReferenceCrudRuntime().addReference(cslJson)
    },

    addReferences(cslArray) {
      return this._getReferenceCrudRuntime().addReferences(cslArray)
    },

    updateReference(key, updates) {
      return this._getReferenceCrudRuntime().updateReference(key, updates)
    },

    _commitGlobalReferenceMutations(changed = false) {
      return this._getReferenceWorkspaceViewRuntime().commitGlobalReferenceMutations(changed)
    },

    _commitWorkbenchMutations(changed = false) {
      return this._getReferenceWorkspaceViewRuntime().commitWorkbenchMutations(changed)
    },

    createCollection(nameRaw = '') {
      return this._getReferenceMutationRuntime().createCollection(nameRaw)
    },

    deleteCollection(collectionId = '') {
      return this._getReferenceMutationRuntime().deleteCollection(collectionId)
    },

    addCollectionToReferences(keys = [], collectionId = '') {
      return this._getReferenceMutationRuntime().addCollectionToReferences(keys, collectionId)
    },

    removeCollectionFromReferences(keys = [], collectionId = '') {
      return this._getReferenceMutationRuntime().removeCollectionFromReferences(keys, collectionId)
    },

    toggleCollectionForReference(key, collectionId = '') {
      return this._getReferenceMutationRuntime().toggleCollectionForReference(key, collectionId)
    },

    createSavedView({ name = '', filters = {} } = {}) {
      return this._getReferenceMutationRuntime().createSavedView({ name, filters })
    },

    deleteSavedView(savedViewId = '') {
      return this._getReferenceMutationRuntime().deleteSavedView(savedViewId)
    },

    setReadingState(keys = [], state = '') {
      return this._getReferenceMutationRuntime().setReadingState(keys, state)
    },

    setPriority(keys = [], priority = '') {
      return this._getReferenceMutationRuntime().setPriority(keys, priority)
    },

    setRating(keys = [], rating = 0) {
      return this._getReferenceMutationRuntime().setRating(keys, rating)
    },

    saveReferenceSummary(key, summary = '') {
      return this._getReferenceMutationRuntime().saveReferenceSummary(key, summary)
    },

    saveReferenceReadingNote(key, note = '') {
      return this._getReferenceMutationRuntime().saveReferenceReadingNote(key, note)
    },

    addTagsToReferences(keys = [], tags = []) {
      return this._getReferenceMutationRuntime().addTagsToReferences(keys, tags)
    },

    replaceTagsForReferences(keys = [], tags = []) {
      return this._getReferenceMutationRuntime().replaceTagsForReferences(keys, tags)
    },

    removeTagsFromReferences(keys = [], tags = []) {
      return this._getReferenceMutationRuntime().removeTagsFromReferences(keys, tags)
    },

    renameReferenceKey(oldKey, nextKeyRaw) {
      const idx = this.globalKeyMap[oldKey]
      if (idx === undefined) {
        return { ok: false, error: 'Reference not found' }
      }

      const nextKey = normalizeEditableReferenceKey(nextKeyRaw)
      if (!nextKey) {
        return { ok: false, error: 'Citation key is required.' }
      }
      if (!EDITABLE_REFERENCE_KEY_RE.test(nextKey)) {
        return { ok: false, error: 'Citation key can only use letters, numbers, _, -, :, and .' }
      }
      if (nextKey === oldKey) {
        return { ok: true, key: oldKey, changed: false }
      }

      const duplicate = this.globalLibrary.some((ref, refIdx) => (
        refIdx !== idx && referenceKey(ref) === nextKey
      ))
      if (duplicate) {
        return { ok: false, error: 'Citation key already exists.' }
      }

      this._getReferenceWorkspaceViewRuntime().applyRenamedReferenceKey(oldKey, nextKey)
      return { ok: true, key: nextKey, oldKey, changed: true }
    },

    mergeReference(existingKey, importedRef, fieldSelections = {}) {
      return this._getReferenceCrudRuntime().mergeReference(existingKey, importedRef, fieldSelections)
    },

    addKeyToWorkspace(key) {
      return this._getReferenceWorkspaceViewRuntime().addKeyToWorkspace(key)
    },

    focusReferenceInLibrary(key, options = {}) {
      if (!key) return false
      const { mode = 'browse', addToWorkspace = false } = options || {}
      if (addToWorkspace) {
        this.addKeyToWorkspace(key)
      }
      this.activeKey = key
      this.libraryDetailMode = mode === 'edit' ? 'edit' : 'browse'
      const editorStore = useEditorStore()
      editorStore.openLibrarySurface('global')
      return true
    },

    closeLibraryDetailMode() {
      this.libraryDetailMode = 'browse'
    },

    hasKeyInWorkspace(key) {
      return !!key && this.workspaceKeys.includes(key)
    },

    removeReference(key) {
      return this._getReferenceWorkspaceViewRuntime().removeReference(key)
    },

    removeReferences(keys) {
      for (const key of keys) {
        this.removeReference(key)
      }
    },

    async removeReferenceFromGlobal(key) {
      const removed = await this.removeReferencesFromGlobal([key])
      return removed.length > 0
    },

    async removeReferencesFromGlobal(keys) {
      return this._getReferenceAssetRuntime().removeReferencesFromGlobal(keys)
    },

    // --- Search ---

    searchRefs(query) {
      if (!query || !query.trim()) return this.sortedLibrary
      return searchReferences(this.library, query)
    },

    searchGlobalRefs(query) {
      if (!query || !query.trim()) return this.sortedGlobalLibrary
      return searchSortedReferences(this.globalLibrary, query, this.sortBy, this.sortDir)
    },

    // --- Key generation ---

    generateKey(cslJson) {
      return buildReferenceKey(cslJson, new Set(Object.keys(this.globalKeyMap)))
    },

    // --- Dedup ---

    findDuplicate(cslJson) {
      return this.auditImportCandidate(cslJson).existingKey
    },

    isDuplicate(cslJson) {
      return this.findDuplicate(cslJson) !== null
    },

    auditImportCandidate(cslJson) {
      return auditReferenceImportCandidate(this.globalLibrary, cslJson)
    },

    // --- PDF storage ---

    async storePdf(key, sourcePath) {
      return this._getReferenceAssetRuntime().storePdf(key, sourcePath)
    },

    // --- Export ---

    exportBibTeX(keys) {
      const refs = keys
        ? keys.map((key) => this.getByKey(key)).filter(Boolean)
        : this.library

      return exportReferencesAsBibTeX(refs)
    },

    exportRis(keys) {
      const refs = keys
        ? keys.map((key) => this.getByKey(key)).filter(Boolean)
        : this.library

      return exportReferencesAsRis(refs)
    },

    pdfPathForKey(key) {
      const workspace = useWorkspaceStore()
      const ref = this.getByKey(key)
      if (!workspace.globalConfigDir || !ref?._pdfFile) return null
      return resolveGlobalReferencePdfPath(workspace.globalConfigDir, ref._pdfFile)
    },

    fulltextPathForKey(key) {
      const workspace = useWorkspaceStore()
      const ref = this.getByKey(key)
      const fileName = ref?._textFile || (key ? `${key}.txt` : '')
      if (!workspace.globalConfigDir || !fileName) return null
      return resolveGlobalReferenceFulltextPath(workspace.globalConfigDir, fileName)
    },
  },
})
