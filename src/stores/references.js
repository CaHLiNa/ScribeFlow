import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { setUserStyles } from '../services/citationStyleRegistry'
import { events } from '../services/telemetry'
import { useWorkspaceStore } from './workspace'
import { useFilesStore } from './files'
import { extractTextFromPdf } from '../utils/pdfMetadata'
import { buildReferenceKey } from '../utils/referenceKeys'
import {
  createEmptyWorkspaceReferenceCollection,
  parseWorkspaceReferenceCollection,
  resolveGlobalReferenceFulltextPath,
  resolveGlobalReferenceLibraryPath,
  resolveGlobalReferencePdfPath,
  resolveGlobalReferencePdfsDir,
  resolveGlobalReferenceFulltextDir,
  resolveLegacyWorkspaceReferenceFulltextDir,
  resolveLegacyWorkspaceReferenceLibraryPath,
  resolveLegacyWorkspaceReferencePdfsDir,
  resolveWorkspaceReferenceCollectionPath,
  resolveWorkspaceReferencesDir,
} from '../services/referenceLibraryPaths'

function normalizeDoi(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\/doi\.org\//i, '')
    .toLowerCase()
}

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeAuthorToken(author = {}) {
  return String(author?.family || author?.given || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

function issuedYear(ref = {}) {
  return Number(ref?.issued?.['date-parts']?.[0]?.[0] || 0)
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  if (value && typeof value === 'object') return Object.keys(value).length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return value !== null && value !== undefined && value !== ''
}

function cloneValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function mergeableFieldNames(existing = {}, incoming = {}) {
  return Array.from(new Set([
    ...Object.keys(existing || {}),
    ...Object.keys(incoming || {}),
  ])).filter((field) => (
    field &&
    field !== 'id' &&
    !field.startsWith('_')
  ))
}

function referenceKey(ref = {}) {
  return ref?._key || ref?.id || null
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

function sortReferences(list = [], sortBy = 'addedAt', sortDir = 'desc') {
  const copy = [...list]
  const dir = sortDir === 'asc' ? 1 : -1
  switch (sortBy) {
    case 'author':
      return copy.sort((a, b) => {
        const aAuth = a.author?.[0]?.family || ''
        const bAuth = b.author?.[0]?.family || ''
        return dir * aAuth.localeCompare(bAuth)
      })
    case 'year':
      return copy.sort((a, b) => {
        const aYear = a.issued?.['date-parts']?.[0]?.[0] || 0
        const bYear = b.issued?.['date-parts']?.[0]?.[0] || 0
        return dir * (aYear - bYear)
      })
    case 'title':
      return copy.sort((a, b) => dir * (a.title || '').localeCompare(b.title || ''))
    case 'addedAt':
    default:
      return copy.sort((a, b) => {
        const aDate = a._addedAt || ''
        const bDate = b._addedAt || ''
        return dir * aDate.localeCompare(bDate)
      })
  }
}

function filterReferences(list = [], query = '') {
  if (!query || !query.trim()) return list

  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  return list.filter(ref => {
    const searchable = [
      ref.title || '',
      ref._key || '',
      ref.DOI || '',
      String(ref.issued?.['date-parts']?.[0]?.[0] || ''),
      ...(ref.author || []).map(a => `${a.family || ''} ${a.given || ''}`),
      ...(ref._tags || []),
      ref['container-title'] || '',
      ref.abstract || '',
    ].join(' ').toLowerCase()

    return tokens.every(token => searchable.includes(token))
  })
}

async function readFileIfExists(path) {
  if (!path) return null
  try {
    const exists = await invoke('path_exists', { path })
    if (!exists) return null
    return await invoke('read_file', { path })
  } catch {
    return null
  }
}

async function readJsonArray(path) {
  const raw = await readFileIfExists(path)
  if (!raw) return []
  try {
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

async function readWorkspaceReferenceCollection(path) {
  return parseWorkspaceReferenceCollection(await readFileIfExists(path))
}

async function copyFileIfPresent(src, dest) {
  if (!src || !dest) return false
  try {
    const exists = await invoke('path_exists', { path: src })
    if (!exists) return false
    const destExists = await invoke('path_exists', { path: dest })
    if (!destExists) {
      await invoke('copy_file', { src, dest })
    }
    return true
  } catch {
    return false
  }
}

export const useReferencesStore = defineStore('references', {
  state: () => ({
    library: [],
    keyMap: {},         // citeKey → index in library
    globalLibrary: [],
    globalKeyMap: {},
    workspaceKeys: [],
    initialized: false,
    loading: false,
    activeKey: null,
    selectedKeys: new Set(),
    sortBy: 'addedAt',  // field name: 'addedAt' | 'author' | 'year' | 'title'
    sortDir: 'desc',    // 'asc' | 'desc'
    citationStyle: 'apa',
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
      const citationRe = /\[([^\[\]]*@[a-zA-Z][\w]*[^\[\]]*)\]/g
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
    // --- Persistence ---

    async loadLibrary() {
      const workspace = useWorkspaceStore()
      if (!workspace.projectDir || !workspace.globalConfigDir) return

      this.loading = true

      try {
        await this._ensureReferenceStorageReady()
        let globalLibrary = await readJsonArray(resolveGlobalReferenceLibraryPath(workspace.globalConfigDir))
        let workspaceCollection = await readWorkspaceReferenceCollection(resolveWorkspaceReferenceCollectionPath(workspace.projectDir))

        const migration = await this._migrateLegacyWorkspaceData({
          globalLibrary,
          workspaceKeys: workspaceCollection.keys,
        })

        globalLibrary = migration.globalLibrary
        workspaceCollection = {
          ...workspaceCollection,
          keys: migration.workspaceKeys,
        }

        this.globalLibrary = globalLibrary
        this.globalKeyMap = buildKeyMapFromList(globalLibrary)
        const workspaceView = buildWorkspaceLibrary(globalLibrary, this.globalKeyMap, workspaceCollection.keys)
        this.library = workspaceView.library
        this.workspaceKeys = workspaceView.keys
        this.keyMap = buildKeyMapFromList(workspaceView.library)

        if (migration.didChange) {
          await this._writeLibraries()
        }
      } catch (e) {
        console.warn('Failed to load reference library:', e)
        this.library = []
        this.keyMap = {}
        this.globalLibrary = []
        this.globalKeyMap = {}
        this.workspaceKeys = []
      }

      // Load persisted citation style
      try {
        const stylePath = `${workspace.projectDir}/citation-style.json`
        const exists = await invoke('path_exists', { path: stylePath })
        if (exists) {
          const raw = await invoke('read_file', { path: stylePath })
          const data = JSON.parse(raw)
          if (data.citationStyle) this.citationStyle = data.citationStyle
        }
      } catch { /* use default */ }

      // Load user-added CSL styles from .project/styles/
      try {
        await this._loadUserStyles(workspace.projectDir)
      } catch { /* no user styles */ }

      this.initialized = true
      this.loading = false
      this.startWatching()
    },

    async _loadUserStyles(baseDir) {
      const stylesDir = `${baseDir}/styles`
      const exists = await invoke('path_exists', { path: stylesDir })
      if (!exists) return

      const entries = await invoke('read_dir', { path: stylesDir })
      const cslFiles = (entries || []).filter(e => e.name?.endsWith('.csl'))
      if (cslFiles.length === 0) return

      const { parseCslMetadata, deriveStyleId } = await import('../utils/cslParser')

      const styles = []
      for (const entry of cslFiles) {
        try {
          const xml = await invoke('read_file', { path: `${stylesDir}/${entry.name}` })
          const meta = parseCslMetadata(xml)
          const id = deriveStyleId(meta.id, meta.title)
          styles.push({
            id,
            name: meta.title,
            category: meta.category || 'Custom',
            filename: entry.name,
          })
        } catch {
          // Skip malformed CSL files
        }
      }

      if (styles.length > 0) {
        setUserStyles(styles)
      }
    },

    _saveTimer: null,
    async saveLibrary() {
      clearTimeout(this._saveTimer)
      this._saveTimer = setTimeout(() => this._doSave(), 500)
    },

    async _doSave() {
      await this._writeLibraries()
    },

    async _writeLibraries() {
      const workspace = useWorkspaceStore()
      if (!workspace.projectDir || !workspace.globalConfigDir) return

      const globalLibraryPath = resolveGlobalReferenceLibraryPath(workspace.globalConfigDir)
      const workspaceCollectionPath = resolveWorkspaceReferenceCollectionPath(workspace.projectDir)
      try {
        this._markSelfWrite(globalLibraryPath)
        await invoke('write_file', {
          path: globalLibraryPath,
          content: JSON.stringify(this.globalLibrary, null, 2),
        })
        this._markSelfWrite(workspaceCollectionPath)
        await invoke('write_file', {
          path: workspaceCollectionPath,
          content: JSON.stringify({
            ...createEmptyWorkspaceReferenceCollection(),
            keys: [...this.workspaceKeys],
          }, null, 2),
        })
      } catch (e) {
        console.warn('Failed to save reference library:', e)
      }
    },

    async startWatching() {
      const workspace = useWorkspaceStore()
      if (!workspace.projectDir || !workspace.globalConfigDir) return
      if (this._unlisten) this._unlisten()

      const globalLibraryPath = resolveGlobalReferenceLibraryPath(workspace.globalConfigDir)
      const workspaceCollectionPath = resolveWorkspaceReferenceCollectionPath(workspace.projectDir)
      this._unlisten = await listen('fs-change', async (event) => {
        const paths = event.payload?.paths || []
        const relevant = paths.filter((path) => path === globalLibraryPath || path === workspaceCollectionPath)
        if (relevant.length === 0) return

        let needsReload = false
        for (const path of relevant) {
          if (this._consumeSelfWrite(path)) continue
          needsReload = true
        }
        if (needsReload) {
          await this.loadLibrary()
        }
      })
    },

    stopWatching() {
      if (this._unlisten) { this._unlisten(); this._unlisten = null }
    },

    cleanup() {
      this.stopWatching()
      this.library = []
      this.keyMap = {}
      this.globalLibrary = []
      this.globalKeyMap = {}
      this.workspaceKeys = []
      this.initialized = false
      this.loading = false
      this.activeKey = null
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

    _markSelfWrite(path) {
      if (!path) return
      if (!this._selfWriteCounts) this._selfWriteCounts = {}
      this._selfWriteCounts[path] = (this._selfWriteCounts[path] || 0) + 1
    },

    _consumeSelfWrite(path) {
      if (!path || !this._selfWriteCounts?.[path]) return false
      this._selfWriteCounts[path] -= 1
      if (this._selfWriteCounts[path] <= 0) delete this._selfWriteCounts[path]
      return true
    },

    _syncWorkspaceView() {
      this.globalKeyMap = buildKeyMapFromList(this.globalLibrary)
      const workspaceView = buildWorkspaceLibrary(this.globalLibrary, this.globalKeyMap, this.workspaceKeys)
      this.library = workspaceView.library
      this.workspaceKeys = workspaceView.keys
      this.keyMap = buildKeyMapFromList(workspaceView.library)
    },

    async _deleteReferenceAsset(path) {
      if (!path) return false
      try {
        const exists = await invoke('path_exists', { path })
        if (!exists) return false
        await invoke('delete_path', { path })
        return true
      } catch (error) {
        console.warn('Failed to delete reference asset:', path, error)
        return false
      }
    },

    async _ensureReferenceStorageReady() {
      const workspace = useWorkspaceStore()
      if (!workspace.projectDir || !workspace.globalConfigDir) return

      const globalPdfsDir = resolveGlobalReferencePdfsDir(workspace.globalConfigDir)
      const globalFulltextDir = resolveGlobalReferenceFulltextDir(workspace.globalConfigDir)
      const globalLibraryPath = resolveGlobalReferenceLibraryPath(workspace.globalConfigDir)
      const workspaceRefsDir = resolveWorkspaceReferencesDir(workspace.projectDir)
      const workspaceCollectionPath = resolveWorkspaceReferenceCollectionPath(workspace.projectDir)

      await invoke('create_dir', { path: workspace.globalReferencesDir }).catch(() => {})
      await invoke('create_dir', { path: globalPdfsDir }).catch(() => {})
      await invoke('create_dir', { path: globalFulltextDir }).catch(() => {})
      await invoke('create_dir', { path: workspaceRefsDir }).catch(() => {})

      const globalLibraryExists = await invoke('path_exists', { path: globalLibraryPath }).catch(() => false)
      if (!globalLibraryExists) {
        await invoke('write_file', {
          path: globalLibraryPath,
          content: '[]',
        })
      }

      const workspaceCollectionExists = await invoke('path_exists', { path: workspaceCollectionPath }).catch(() => false)
      if (!workspaceCollectionExists) {
        await invoke('write_file', {
          path: workspaceCollectionPath,
          content: JSON.stringify(createEmptyWorkspaceReferenceCollection(), null, 2),
        })
      }
    },

    async _migrateLegacyWorkspaceData({ globalLibrary = [], workspaceKeys = [] } = {}) {
      const workspace = useWorkspaceStore()
      const legacyLibraryPath = resolveLegacyWorkspaceReferenceLibraryPath(workspace.projectDir)
      const legacyRefs = await readJsonArray(legacyLibraryPath)
      if (legacyRefs.length === 0) {
        return {
          globalLibrary,
          workspaceKeys,
          didChange: false,
        }
      }

      const nextGlobalLibrary = [...globalLibrary]
      const nextWorkspaceKeys = [...workspaceKeys]
      const nextGlobalKeyMap = buildKeyMapFromList(nextGlobalLibrary)
      let didChange = false

      for (const legacyRef of legacyRefs) {
        const key = referenceKey(legacyRef) || buildReferenceKey(legacyRef, new Set(Object.keys(nextGlobalKeyMap)))
        let targetRef = nextGlobalKeyMap[key] !== undefined ? nextGlobalLibrary[nextGlobalKeyMap[key]] : null

        if (!targetRef) {
          const nextRef = {
            ...cloneValue(legacyRef),
            _key: key,
            id: key,
          }
          nextGlobalLibrary.push(nextRef)
          nextGlobalKeyMap[key] = nextGlobalLibrary.length - 1
          targetRef = nextRef
          didChange = true
        }

        if (!nextWorkspaceKeys.includes(key)) {
          nextWorkspaceKeys.push(key)
          didChange = true
        }

        const assetChanged = await this._migrateLegacyReferenceAssets(targetRef, legacyRef, key)
        if (assetChanged) didChange = true
      }

      return {
        globalLibrary: nextGlobalLibrary,
        workspaceKeys: nextWorkspaceKeys,
        didChange,
      }
    },

    async _migrateLegacyReferenceAssets(targetRef, legacyRef, key) {
      const workspace = useWorkspaceStore()
      if (!workspace.projectDir || !workspace.globalConfigDir) return false

      let changed = false
      const legacyPdfsDir = resolveLegacyWorkspaceReferencePdfsDir(workspace.projectDir)
      const legacyFulltextDir = resolveLegacyWorkspaceReferenceFulltextDir(workspace.projectDir)

      if (legacyRef?._pdfFile && !targetRef?._pdfFile) {
        const copied = await copyFileIfPresent(
          `${legacyPdfsDir}/${legacyRef._pdfFile}`,
          resolveGlobalReferencePdfPath(workspace.globalConfigDir, `${key}.pdf`),
        )
        if (copied) {
          targetRef._pdfFile = `${key}.pdf`
          changed = true
        }
      }

      if (legacyRef?._textFile && !targetRef?._textFile) {
        const copied = await copyFileIfPresent(
          `${legacyFulltextDir}/${legacyRef._textFile}`,
          resolveGlobalReferenceFulltextPath(workspace.globalConfigDir, `${key}.txt`),
        )
        if (copied) {
          targetRef._textFile = `${key}.txt`
          changed = true
        }
      }

      return changed
    },

    // --- CRUD ---

    addReference(cslJson) {
      if (!cslJson._key) {
        cslJson._key = this.generateKey(cslJson)
      }
      cslJson.id = cslJson._key

      const duplicateAudit = this.auditImportCandidate(cslJson)
      if (duplicateAudit.existingKey) {
        this.addKeyToWorkspace(duplicateAudit.existingKey)
        return {
          key: duplicateAudit.existingKey,
          status: 'duplicate',
          existingKey: duplicateAudit.existingKey,
          matchType: duplicateAudit.matchType,
        }
      }

      if (!cslJson._addedAt) {
        cslJson._addedAt = new Date().toISOString()
      }

      this.globalLibrary.push(cslJson)
      this.workspaceKeys.push(cslJson._key)
      this._syncWorkspaceView()
      this.saveLibrary()
      events.refImport(cslJson._importMethod || 'manual')

      return { key: cslJson._key, status: 'added' }
    },

    addReferences(cslArray) {
      const report = { added: [], duplicates: [], errors: [] }
      for (const csl of cslArray) {
        try {
          const result = this.addReference({ ...csl })
          if (result.status === 'added') report.added.push(result.key)
          else report.duplicates.push(result.existingKey || result.key)
        } catch (e) {
          report.errors.push({ csl, error: e.message })
        }
      }
      return report
    },

    updateReference(key, updates) {
      const idx = this.globalKeyMap[key]
      if (idx === undefined) return false

      Object.assign(this.globalLibrary[idx], updates)

      if (updates._key && updates._key !== key) {
        this.globalLibrary[idx].id = updates._key
        this.workspaceKeys = this.workspaceKeys.map((item) => (item === key ? updates._key : item))
      }

      this._syncWorkspaceView()
      this.saveLibrary()
      return true
    },

    mergeReference(existingKey, importedRef, fieldSelections = {}) {
      const existingRef = this.getByKey(existingKey)
      if (!existingRef || !importedRef) return { status: 'missing' }

      const merged = {
        ...cloneValue(existingRef),
      }

      for (const field of mergeableFieldNames(existingRef, importedRef)) {
        if (fieldSelections[field] !== 'incoming') continue
        if (!hasValue(importedRef[field])) continue
        merged[field] = cloneValue(importedRef[field])
      }

      this.updateReference(existingKey, merged)
      return {
        status: 'merged',
        key: existingKey,
        ref: this.getByKey(existingKey),
      }
    },

    addKeyToWorkspace(key) {
      if (!key || this.workspaceKeys.includes(key)) return false
      this.workspaceKeys.push(key)
      this._syncWorkspaceView()
      this.saveLibrary()
      return true
    },

    hasKeyInWorkspace(key) {
      return !!key && this.workspaceKeys.includes(key)
    },

    removeReference(key) {
      if (!this.workspaceKeys.includes(key)) return false
      this.workspaceKeys = this.workspaceKeys.filter((item) => item !== key)
      this._syncWorkspaceView()

      if (this.activeKey === key) this.activeKey = null
      this.selectedKeys.delete(key)

      this.saveLibrary()
      return true
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
      const uniqueKeys = Array.from(new Set((keys || []).filter(Boolean)))
      if (uniqueKeys.length === 0) return []

      const workspace = useWorkspaceStore()
      const removeSet = new Set()
      const assetPaths = []

      for (const key of uniqueKeys) {
        const idx = this.globalKeyMap[key]
        if (idx === undefined) continue
        const ref = this.globalLibrary[idx]
        removeSet.add(key)
        if (workspace.globalConfigDir && ref?._pdfFile) {
          assetPaths.push(resolveGlobalReferencePdfPath(workspace.globalConfigDir, ref._pdfFile))
        }
        if (workspace.globalConfigDir && ref?._textFile) {
          assetPaths.push(resolveGlobalReferenceFulltextPath(workspace.globalConfigDir, ref._textFile))
        }
      }

      if (removeSet.size === 0) return []

      this.globalLibrary = this.globalLibrary.filter((ref) => !removeSet.has(referenceKey(ref)))
      this.workspaceKeys = this.workspaceKeys.filter((key) => !removeSet.has(key))

      if (this.activeKey && removeSet.has(this.activeKey)) {
        this.activeKey = null
      }
      for (const key of removeSet) {
        this.selectedKeys.delete(key)
      }

      this._syncWorkspaceView()

      for (const path of assetPaths) {
        await this._deleteReferenceAsset(path)
      }

      await this._writeLibraries()
      return [...removeSet]
    },

    // --- Search ---

    searchRefs(query) {
      if (!query || !query.trim()) return this.sortedLibrary
      return filterReferences(this.library, query)
    },

    searchGlobalRefs(query) {
      if (!query || !query.trim()) return this.sortedGlobalLibrary
      return sortReferences(filterReferences(this.globalLibrary, query), this.sortBy, this.sortDir)
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
      const incomingDoi = normalizeDoi(cslJson?.DOI)
      if (incomingDoi) {
        const strong = this.globalLibrary.find((ref) => normalizeDoi(ref?.DOI) === incomingDoi)
        if (strong) {
          return {
            existingKey: strong._key,
            matchType: 'strong',
            reason: 'doi',
          }
        }
      }

      const incomingTitle = normalizeTitle(cslJson?.title)
      const incomingAuthor = normalizeAuthorToken(cslJson?.author?.[0])
      const incomingYear = issuedYear(cslJson)

      if (incomingTitle && incomingAuthor && incomingYear) {
        const possible = this.globalLibrary.find((ref) => (
          normalizeTitle(ref?.title) === incomingTitle &&
          normalizeAuthorToken(ref?.author?.[0]) === incomingAuthor &&
          issuedYear(ref) === incomingYear
        ))
        if (possible) {
          return {
            existingKey: possible._key,
            matchType: 'possible',
            reason: 'title-author-year',
          }
        }
      }

      return {
        existingKey: null,
        matchType: null,
        reason: null,
      }
    },

    // --- PDF storage ---

    async storePdf(key, sourcePath) {
      const workspace = useWorkspaceStore()
      if (!workspace.globalConfigDir) return

      const pdfsDir = resolveGlobalReferencePdfsDir(workspace.globalConfigDir)
      const textDir = resolveGlobalReferenceFulltextDir(workspace.globalConfigDir)
      const destPdf = resolveGlobalReferencePdfPath(workspace.globalConfigDir, `${key}.pdf`)

      try {
        await invoke('create_dir', { path: pdfsDir }).catch(() => {})
        await invoke('copy_file', { src: sourcePath, dest: destPdf })
        this.updateReference(key, { _pdfFile: `${key}.pdf` })
      } catch (e) {
        console.warn('Failed to store PDF:', e)
      }

      // Extract text for full-text search
      try {
        const text = await extractTextFromPdf(destPdf)
        if (text) {
          await invoke('create_dir', { path: textDir }).catch(() => {})
          await invoke('write_file', {
            path: resolveGlobalReferenceFulltextPath(workspace.globalConfigDir, `${key}.txt`),
            content: text,
          })
          this.updateReference(key, { _textFile: `${key}.txt` })
        }
      } catch (e) {
        console.warn('Failed to extract PDF text:', e)
      }
    },

    // --- Export ---

    exportBibTeX(keys) {
      const refs = keys
        ? keys.map(k => this.getByKey(k)).filter(Boolean)
        : this.library

      return refs.map(ref => {
        const type = cslTypeToBibtex(ref.type)
        const key = ref._key || ref.id
        const fields = []

        if (ref.title) fields.push(`  title = {${ref.title}}`)
        if (ref.author) {
          const authors = ref.author.map(a =>
            `${a.family || ''}${a.given ? ', ' + a.given : ''}`
          ).join(' and ')
          fields.push(`  author = {${authors}}`)
        }
        if (ref.issued?.['date-parts']?.[0]?.[0]) {
          fields.push(`  year = {${ref.issued['date-parts'][0][0]}}`)
        }
        if (ref['container-title']) fields.push(`  journal = {${ref['container-title']}}`)
        if (ref.volume) fields.push(`  volume = {${ref.volume}}`)
        if (ref.issue) fields.push(`  number = {${ref.issue}}`)
        if (ref.page) fields.push(`  pages = {${ref.page}}`)
        if (ref.DOI) fields.push(`  doi = {${ref.DOI}}`)
        if (ref.publisher) fields.push(`  publisher = {${ref.publisher}}`)

        return `@${type}{${key},\n${fields.join(',\n')}\n}`
      }).join('\n\n')
    },

    exportRis(keys) {
      const refs = keys
        ? keys.map(k => this.getByKey(k)).filter(Boolean)
        : this.library

      return refs.map(ref => {
        const lines = []
        lines.push(`TY  - ${cslTypeToRis(ref.type)}`)

        if (ref.title) lines.push(`TI  - ${ref.title}`)
        if (ref.author) {
          for (const a of ref.author) {
            const name = a.family && a.given ? `${a.family}, ${a.given}` : (a.family || a.given || '')
            if (name) lines.push(`AU  - ${name}`)
          }
        }
        if (ref.issued?.['date-parts']?.[0]) {
          const parts = ref.issued['date-parts'][0]
          const yr = parts[0]
          const mo = parts[1] ? String(parts[1]).padStart(2, '0') : ''
          const dy = parts[2] ? String(parts[2]).padStart(2, '0') : ''
          lines.push(`PY  - ${yr}`)
          if (mo) lines.push(`DA  - ${yr}/${mo}${dy ? '/' + dy : ''}`)
        }
        if (ref['container-title']) lines.push(`JO  - ${ref['container-title']}`)
        if (ref.volume) lines.push(`VL  - ${ref.volume}`)
        if (ref.issue) lines.push(`IS  - ${ref.issue}`)
        if (ref.page) {
          const [sp, ep] = ref.page.split('-')
          lines.push(`SP  - ${sp.trim()}`)
          if (ep) lines.push(`EP  - ${ep.trim()}`)
        }
        if (ref.DOI) lines.push(`DO  - ${ref.DOI}`)
        if (ref.URL) lines.push(`UR  - ${ref.URL}`)
        if (ref.abstract) lines.push(`AB  - ${ref.abstract}`)
        if (ref.publisher) lines.push(`PB  - ${ref.publisher}`)
        if (ref.ISSN) lines.push(`SN  - ${ref.ISSN}`)
        else if (ref.ISBN) lines.push(`SN  - ${ref.ISBN}`)
        if (ref._tags?.length) {
          for (const tag of ref._tags) lines.push(`KW  - ${tag}`)
        }
        lines.push('ER  -')

        return lines.join('\n')
      }).join('\n\n')
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

function cslTypeToRis(type) {
  const map = {
    'article-journal': 'JOUR',
    'book': 'BOOK',
    'chapter': 'CHAP',
    'paper-conference': 'CONF',
    'report': 'RPRT',
    'thesis': 'THES',
    'webpage': 'ELEC',
    'article-magazine': 'MGZN',
    'article-newspaper': 'NEWS',
    'manuscript': 'UNPB',
    'legislation': 'BILL',
    'legal_case': 'CASE',
    'dataset': 'DATA',
    'patent': 'PAT',
    'motion_picture': 'VIDEO',
    'song': 'SOUND',
    'map': 'MAP',
  }
  return map[type] || 'GEN'
}

function cslTypeToBibtex(type) {
  const map = {
    'article-journal': 'article',
    'paper-conference': 'inproceedings',
    'book': 'book',
    'chapter': 'incollection',
    'thesis': 'phdthesis',
    'report': 'techreport',
    'webpage': 'misc',
  }
  return map[type] || 'misc'
}
