export function buildZoteroSelectedGroupIds(config = {}) {
  return new Set(
    Array.isArray(config?._groups)
      ? config._groups.map((group) => String(group?.id || group || ''))
      : []
  )
}

export function buildZoteroSelectedGroups(groups = [], selectedGroupIds = new Set()) {
  const selectedIds = selectedGroupIds instanceof Set
    ? selectedGroupIds
    : new Set(Array.isArray(selectedGroupIds) ? selectedGroupIds : [])
  return (Array.isArray(groups) ? groups : []).filter((group) =>
    selectedIds.has(String(group?.id || ''))
  )
}

export function buildZoteroPushTarget(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) return null

  const [libraryType, libraryId, collectionKey] = normalized.split('/')
  return {
    libraryType,
    libraryId,
    collectionKey: collectionKey || '',
  }
}

export function buildZoteroPushTargetValue(config = {}) {
  const target = config?.pushTarget
  if (!target?.libraryType || !target?.libraryId) return ''
  return target.collectionKey
    ? `${target.libraryType}/${target.libraryId}/${target.collectionKey}`
    : `${target.libraryType}/${target.libraryId}`
}

export function buildZoteroPushTargetOptions(config = {}, collectionOptions = [], translate = (key) => key) {
  const userId = String(config?.userId || '').trim()
  return [
    { value: '', label: translate("Don't push to Zotero") },
    { value: `user/${userId}`, label: translate('My Library') },
    ...(Array.isArray(collectionOptions) ? collectionOptions : []),
  ]
}

export function buildZoteroCollectionTree(collections = []) {
  if (!Array.isArray(collections)) return []

  const byParent = new Map()
  for (const collection of collections) {
    const parent = String(collection?.parentCollection || '')
    if (!byParent.has(parent)) byParent.set(parent, [])
    byParent.get(parent).push(collection)
  }

  const walk = (parent = '', depth = 0) =>
    (byParent.get(parent) || [])
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')))
      .flatMap((collection) => [
        { ...collection, depth },
        ...walk(collection.key, depth + 1),
      ])

  return walk()
}

export function buildZoteroCollectionOptions(remoteLibraries = {}, config = {}, translate = (key) => key) {
  const userId = String(config?.userId || '').trim()
  const options = []
  const userCollections = buildZoteroCollectionTree(remoteLibraries?.userCollections || [])

  for (const collection of userCollections) {
    options.push({
      value: `user/${userId}/${collection.key}`,
      label: `${translate('My Library')} → ${'  '.repeat(collection.depth)}${collection.name}`,
    })
  }

  for (const entry of remoteLibraries?.groupCollections || []) {
    const group = entry?.group || {}
    const groupCollections = buildZoteroCollectionTree(entry?.collections || [])
    options.push({ value: `group/${group.id}`, label: group.name })
    for (const collection of groupCollections) {
      options.push({
        value: `group/${group.id}/${collection.key}`,
        label: `${group.name} → ${'  '.repeat(collection.depth)}${collection.name}`,
      })
    }
  }

  return options
}
