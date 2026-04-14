import { invoke } from '@tauri-apps/api/core'
import { cslToReferenceRecord } from '../../domains/references/referenceInterop.js'
import { findDuplicateReference } from './referenceImport.js'

const ZOTERO_KEYCHAIN_KEY = 'zotero-api-key'
const ZOTERO_API_BASE = 'https://api.zotero.org'

export const zoteroSyncState = {
  status: 'disconnected',
  lastSyncTime: null,
  error: null,
  errorType: null,
  progress: null,
}

class ZoteroApiError extends Error {
  constructor(status, body) {
    super(`Zotero API error ${status}: ${body}`)
    this.name = 'ZoteroApiError'
    this.status = status
  }
}

class ZoteroAuthError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ZoteroAuthError'
  }
}

class ZoteroRateLimitError extends Error {
  constructor(retryAfter) {
    super(`Rate limited, retry after ${retryAfter}s`)
    this.name = 'ZoteroRateLimitError'
    this.retryAfter = retryAfter
  }
}

function setSyncState(partial = {}) {
  Object.assign(zoteroSyncState, partial)
}

function extractZoteroItemKey(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  const segments = normalized.split('/')
  return segments.at(-1) || ''
}

function classifyError(error) {
  if (error instanceof ZoteroAuthError) return 'auth'
  if (error instanceof ZoteroRateLimitError) return 'rate-limit'
  if (/timeout|network|resolve|connect/i.test(String(error?.message || ''))) return 'network'
  return 'generic'
}

function sanitizeZoteroConfig(config = null) {
  if (!config || typeof config !== 'object') return null
  const next = { ...config }
  delete next._apiKeyFallback
  delete next._credentialStorage
  return next
}

async function getGlobalConfigDir() {
  return invoke('get_global_config_dir')
}

function resolveConfigPath(globalConfigDir = '') {
  return `${String(globalConfigDir || '').replace(/\/+$/, '')}/zotero.json`
}

async function readZoteroConfigRaw(globalConfigDir = null) {
  try {
    const resolvedDir = globalConfigDir || await getGlobalConfigDir()
    const content = await invoke('read_file', { path: resolveConfigPath(resolvedDir) })
    return JSON.parse(content)
  } catch {
    return null
  }
}

async function writeZoteroConfigRaw(config = null, globalConfigDir = null) {
  const resolvedDir = globalConfigDir || await getGlobalConfigDir()
  const path = resolveConfigPath(resolvedDir)
  if (!config) {
    await invoke('delete_path', { path }).catch(() => {})
    return
  }
  await invoke('write_file', {
    path,
    content: JSON.stringify(config, null, 2),
  })
}

export async function storeZoteroApiKey(apiKey = '') {
  const raw = (await readZoteroConfigRaw()) || {}

  await writeZoteroConfigRaw({
    ...raw,
    _apiKeyFallback: apiKey,
    _credentialStorage: 'mirrored-file-fallback',
  })

  try {
    await invoke('keychain_set', { key: ZOTERO_KEYCHAIN_KEY, value: apiKey })
  } catch {
    localStorage.setItem('zoteroApiKey', apiKey)
  }
}

export async function loadZoteroApiKey() {
  try {
    const value = await invoke('keychain_get', { key: ZOTERO_KEYCHAIN_KEY })
    if (value) return value
  } catch {
    // fall through
  }

  const rawConfig = await readZoteroConfigRaw()
  const fileFallback = String(rawConfig?._apiKeyFallback || '').trim()
  if (fileFallback) return fileFallback

  const fallback = localStorage.getItem('zoteroApiKey')
  if (fallback) return fallback
  return null
}

export async function clearZoteroApiKey() {
  await invoke('keychain_delete', { key: ZOTERO_KEYCHAIN_KEY }).catch(() => {})
  const raw = await readZoteroConfigRaw()
  if (raw && (raw._apiKeyFallback || raw._credentialStorage)) {
    const next = { ...raw }
    delete next._apiKeyFallback
    delete next._credentialStorage
    await writeZoteroConfigRaw(next)
  }
  localStorage.removeItem('zoteroApiKey')
}

export async function disconnectZotero() {
  await clearZoteroApiKey()
  await saveZoteroConfig(null)
  setSyncState({
    status: 'disconnected',
    lastSyncTime: null,
    error: null,
    errorType: null,
    progress: null,
  })
}

export async function loadZoteroConfig() {
  try {
    const raw = await readZoteroConfigRaw()
    return sanitizeZoteroConfig(raw)
  } catch {
    return null
  }
}

export async function saveZoteroConfig(config = null) {
  if (!config) {
    await writeZoteroConfigRaw(null)
    return
  }
  const raw = (await readZoteroConfigRaw()) || {}
  await writeZoteroConfigRaw({
    ...raw,
    ...sanitizeZoteroConfig(config),
  })
}

async function zoteroApi(path = '', { method = 'GET', body = null, headers = {}, apiKey } = {}) {
  const response = await invoke('proxy_api_call_full', {
    request: {
      url: `${ZOTERO_API_BASE}${path}`,
      method,
      headers: {
        'Zotero-API-Key': apiKey,
        'Zotero-API-Version': '3',
        'User-Agent': 'Altals-Desktop/1.0',
        ...headers,
      },
      body: body ? JSON.stringify(body) : '',
    },
  })

  if (Number(response.status) === 429) {
    throw new ZoteroRateLimitError(Number(response.headers['retry-after'] || 10))
  }
  if (Number(response.status) === 403) {
    throw new ZoteroAuthError('Zotero API key is invalid or expired')
  }

  return {
    data: response.body ? JSON.parse(response.body) : null,
    headers: response.headers || {},
    status: Number(response.status),
  }
}

export async function validateApiKey(apiKey = '') {
  const { data } = await zoteroApi('/keys/current', { apiKey })
  return { userID: String(data.userID), username: data.username }
}

export async function fetchUserGroups(apiKey = '', userId = '') {
  const { data } = await zoteroApi(`/users/${userId}/groups`, { apiKey })
  return (Array.isArray(data) ? data : []).map((group) => ({
    id: String(group.id),
    name: group.data?.name || '',
    owner: String(group.data?.owner || ''),
    canWrite:
      group.meta?.library?.libraryEditing !== 'admins' || String(group.data?.owner || '') === String(userId),
  }))
}

export async function fetchCollections(apiKey = '', libraryType = 'user', libraryId = '') {
  const prefix = libraryType === 'group' ? `/groups/${libraryId}` : `/users/${libraryId}`
  const { data } = await zoteroApi(`${prefix}/collections`, { apiKey })
  return (Array.isArray(data) ? data : []).map((collection) => ({
    key: collection.key,
    name: collection.data?.name || '',
    parentCollection: collection.data?.parentCollection || null,
  }))
}

async function fetchItemsPage(apiKey, libraryType, libraryId, { start = 0, limit = 100, since = 0 } = {}) {
  const prefix = libraryType === 'group' ? `/groups/${libraryId}` : `/users/${libraryId}`
  const headers = {}
  if (since > 0) headers['If-Modified-Since-Version'] = String(since)

  const response = await zoteroApi(
    `${prefix}/items?format=csljson&limit=${limit}&start=${start}&itemType=-attachment%20||%20note%20||%20annotation`,
    { apiKey, headers }
  )

  if (response.status === 304) {
    return { items: [], totalResults: 0, lastVersion: since }
  }

  return {
    items: Array.isArray(response.data?.items) ? response.data.items : [],
    totalResults: Number(response.headers['total-results'] || 0),
    lastVersion: Number(response.headers['last-modified-version'] || since || 0),
  }
}

async function fetchAllItems(apiKey, libraryType, libraryId, sinceVersion = 0, onProgress) {
  let start = 0
  const limit = 100
  let allItems = []
  let lastVersion = sinceVersion
  let totalResults = 0

  const firstPage = await fetchItemsPage(apiKey, libraryType, libraryId, {
    start,
    limit,
    since: sinceVersion,
  })
  if (firstPage.items.length === 0 && firstPage.totalResults === 0) {
    return { items: [], lastVersion: firstPage.lastVersion || sinceVersion }
  }

  allItems = firstPage.items
  totalResults = firstPage.totalResults
  lastVersion = firstPage.lastVersion
  start += limit
  onProgress?.({ current: allItems.length, total: totalResults })

  while (start < totalResults) {
    const page = await fetchItemsPage(apiKey, libraryType, libraryId, {
      start,
      limit,
      since: sinceVersion,
    })
    allItems.push(...page.items)
    onProgress?.({ current: allItems.length, total: totalResults })
    start += limit
  }

  return { items: allItems, lastVersion }
}

async function fetchRawItem(apiKey, libraryType, libraryId, itemKey = '') {
  const prefix = libraryType === 'group' ? `/groups/${libraryId}` : `/users/${libraryId}`
  const { data } = await zoteroApi(`${prefix}/items/${itemKey}?format=json`, { apiKey })
  return data?.data || null
}

function isSuspiciousSyncedZoteroReference(reference = {}) {
  const authors = Array.isArray(reference.authors) ? reference.authors : []
  return (
    reference?._source === 'zotero' &&
    reference?._importMethod === 'zotero-sync' &&
    String(reference._zoteroKey || '').trim().length > 0 &&
    String(reference.typeKey || '') === 'other' &&
    authors.length === 0 &&
    !String(reference.source || '').trim() &&
    !String(reference.identifier || '').trim() &&
    !Number(reference.year || 0) &&
    !String(reference.abstract || '').trim() &&
    !String(reference.pdfPath || '').trim() &&
    !String(reference.fulltextPath || '').trim()
  )
}

async function pruneNonReferenceZoteroItems(apiKey, referencesStore) {
  const removableIds = []

  for (const reference of referencesStore.references) {
    if (!isSuspiciousSyncedZoteroReference(reference)) continue

    const [libraryType, libraryId] = String(reference._zoteroLibrary || '').split('/')
    if (!libraryType || !libraryId) continue

    try {
      const rawItem = await fetchRawItem(apiKey, libraryType, libraryId, reference._zoteroKey)
      const itemType = String(rawItem?.itemType || '').trim().toLowerCase()
      if (itemType === 'annotation' || itemType === 'note' || itemType === 'attachment') {
        removableIds.push(reference.id)
      }
    } catch {
      // Leave the record untouched if the verification request fails.
    }
  }

  if (!removableIds.length) return 0

  referencesStore.references = referencesStore.references.filter((reference) => !removableIds.includes(reference.id))
  if (!referencesStore.references.some((reference) => reference.id === referencesStore.selectedReferenceId)) {
    referencesStore.selectedReferenceId = referencesStore.filteredReferences[0]?.id || referencesStore.references[0]?.id || ''
  }
  return removableIds.length
}

function zoteroCslToReference(item = {}, libraryLabel = '') {
  const reference = cslToReferenceRecord(item, {
    id: item._key || extractZoteroItemKey(item.id),
  })
  return {
    ...reference,
    _zoteroKey: extractZoteroItemKey(item.id),
    _zoteroLibrary: libraryLabel,
    _source: 'zotero',
    _importMethod: 'zotero-sync',
  }
}

function cslTypeToZoteroItem(type = '') {
  const mapping = {
    'article-journal': 'journalArticle',
    'paper-conference': 'conferencePaper',
    book: 'book',
    chapter: 'bookSection',
    thesis: 'thesis',
    report: 'report',
    webpage: 'webpage',
    dataset: 'dataset',
  }
  return mapping[type] || 'journalArticle'
}

function referenceToZoteroJson(reference = {}, collectionKey = '') {
  const year = Number(reference.year || 0) || ''
  return {
    itemType: cslTypeToZoteroItem(reference.type || reference.typeKey),
    title: reference.title || '',
    creators: (Array.isArray(reference.authors) ? reference.authors : []).map((name) => {
      const parts = String(name || '').trim().split(/\s+/)
      return {
        creatorType: 'author',
        lastName: parts.at(-1) || name,
        firstName: parts.slice(0, -1).join(' '),
      }
    }),
    date: year ? String(year) : '',
    publicationTitle: reference.source || '',
    bookTitle: reference.source || '',
    proceedingsTitle: reference.source || '',
    volume: reference.volume || '',
    issue: reference.issue || '',
    pages: reference.pages || '',
    DOI: /^10\.\d{4,9}\//i.test(String(reference.identifier || '').trim())
      ? String(reference.identifier || '').trim()
      : '',
    url: /^10\.\d{4,9}\//i.test(String(reference.identifier || '').trim())
      ? ''
      : String(reference.identifier || '').trim(),
    abstractNote: reference.abstract || '',
    collections: collectionKey ? [collectionKey] : [],
  }
}

async function pushPendingItems(apiKey, config, referencesStore, projectRoot) {
  const pending = referencesStore.references.filter(
    (reference) => reference._shouldersPushPending && !reference._zoteroKey
  )
  if (!pending.length || !config?.pushTarget) return

  for (const reference of pending) {
    const { libraryType, libraryId, collectionKey } = config.pushTarget
    const prefix = libraryType === 'group' ? `/groups/${libraryId}` : `/users/${libraryId}`
    const body = [referenceToZoteroJson(reference, collectionKey)]
    const response = await zoteroApi(`${prefix}/items`, {
      method: 'POST',
      body,
      apiKey,
    })

    if (response.status !== 200) {
      throw new ZoteroApiError(response.status, JSON.stringify(response.data))
    }

    const successKeys = Object.keys(response.data?.successful || {})
    if (successKeys.length === 0) continue
    const created = response.data.successful[successKeys[0]]
    await referencesStore.updateReference(projectRoot, reference.id, {
      _zoteroKey: created.key,
      _zoteroLibrary: `${libraryType}/${libraryId}`,
      _pushedByShoulders: true,
      _shouldersPushPending: false,
    }, { persist: false })
  }
}

export async function deleteFromZotero(reference = {}) {
  const config = await loadZoteroConfig()
  const apiKey = await loadZoteroApiKey()
  if (!config?.lastSyncVersions || !apiKey || !reference?._zoteroKey || !reference?._zoteroLibrary) return

  const [libraryType, libraryId] = String(reference._zoteroLibrary).split('/')
  const prefix = libraryType === 'group' ? `/groups/${libraryId}` : `/users/${libraryId}`
  const versionKey = `${libraryType}/${libraryId}`
  const version = config.lastSyncVersions?.[versionKey] || 0

  await zoteroApi(`${prefix}/items?itemKey=${reference._zoteroKey}`, {
    method: 'DELETE',
    headers: { 'If-Unmodified-Since-Version': String(version) },
    apiKey,
  }).catch(() => {})
}

export async function syncNow(projectRoot = '', referencesStore) {
  const config = await loadZoteroConfig()
  const apiKey = await loadZoteroApiKey()
  if (!config || !apiKey) {
    setSyncState({ status: 'disconnected', error: null, errorType: null, progress: null })
    return { imported: 0, linked: 0, updated: 0 }
  }

  setSyncState({ status: 'syncing', error: null, errorType: null, progress: null })

  try {
    const libraries = [{ libraryType: 'user', libraryId: config.userId }, ...(config._groups || []).map((group) => ({
      libraryType: 'group',
      libraryId: group.id,
    }))]

    let imported = 0
    let linked = 0
    let updated = 0
    config.lastSyncVersions = config.lastSyncVersions || {}

    updated += await pruneNonReferenceZoteroItems(apiKey, referencesStore)

    for (const library of libraries) {
      const versionKey = `${library.libraryType}/${library.libraryId}`
      const { items, lastVersion } = await fetchAllItems(
        apiKey,
        library.libraryType,
        library.libraryId,
        Number(config.lastSyncVersions[versionKey] || 0),
        (progress) => setSyncState({ progress: { phase: versionKey, ...progress } })
      )

      config.lastSyncVersions[versionKey] = lastVersion
      for (const item of items) {
        const normalized = zoteroCslToReference(item, versionKey)
        const existingByZotero = referencesStore.references.find(
          (reference) => String(reference._zoteroKey || '') === String(normalized._zoteroKey || '')
        )

        if (existingByZotero) {
          await referencesStore.updateReference(projectRoot, existingByZotero.id, {
            ...normalized,
            id: existingByZotero.id,
            citationKey: existingByZotero.citationKey || normalized.citationKey,
            collections: existingByZotero.collections,
            tags: existingByZotero.tags,
            pdfPath: existingByZotero.pdfPath,
            fulltextPath: existingByZotero.fulltextPath,
            notes: existingByZotero.notes,
            annotations: existingByZotero.annotations,
          }, { persist: false })
          updated += 1
          continue
        }

        const duplicate = findDuplicateReference(referencesStore.references, normalized)
        if (duplicate?.id) {
          await referencesStore.updateReference(projectRoot, duplicate.id, {
            _zoteroKey: normalized._zoteroKey,
            _zoteroLibrary: normalized._zoteroLibrary,
            _source: 'zotero',
          }, { persist: false })
          linked += 1
          continue
        }

        await referencesStore.addReference(projectRoot, normalized, {
          markForZoteroPush: false,
          persist: false,
        })
        imported += 1
      }
    }

    await pushPendingItems(apiKey, config, referencesStore, projectRoot)
    await referencesStore.persistLibrarySnapshot(projectRoot)
    await saveZoteroConfig(config)
    setSyncState({
      status: 'synced',
      lastSyncTime: new Date().toISOString(),
      error: null,
      errorType: null,
      progress: null,
    })
    return { imported, linked, updated }
  } catch (error) {
    setSyncState({
      status: 'error',
      error: error?.message || String(error),
      errorType: classifyError(error),
      progress: null,
    })
    throw error
  }
}
