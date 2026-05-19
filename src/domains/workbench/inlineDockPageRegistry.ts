function normalizePageList(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function lifecycleDefinitionsFromContext(context = {}) {
  const definitions = Array.isArray(context.pageDefinitions) ? context.pageDefinitions : []
  return new Map(
    definitions
      .map((definition) => [
        String(definition?.id || '').trim(),
        {
          closeable: definition?.closeable === true,
          dynamic: definition?.dynamic === true,
          fallbackPage: String(definition?.fallbackPage || '').trim(),
          permanent: definition?.permanent === true,
        },
      ])
      .filter(([id]) => id)
  )
}

function normalizePage(page = {}, definition = {}, lifecycle = null) {
  const key = String(page.key || '').trim()
  if (!key) return null
  const pageCloseable = Object.prototype.hasOwnProperty.call(page, 'closeable')
    ? page.closeable === true
    : definition.defaults?.closeable === true
  const closeable = lifecycle ? lifecycle.closeable && pageCloseable : pageCloseable

  return {
    ...definition.defaults,
    ...page,
    key,
    type: String(page.type || definition.type || definition.id || '').trim(),
    closeable,
    fallbackPage: lifecycle?.fallbackPage || page.fallbackPage || definition.defaults?.fallbackPage || '',
    lifecycle,
  }
}

function allowedPageIdsFromContext(context = {}) {
  const ids = Array.isArray(context.allowedPageIds) ? context.allowedPageIds : []
  return new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))
}

function isDefinitionAllowed(definition = {}, allowedPageIds = new Set()) {
  if (allowedPageIds.size === 0) return true
  const definitionId = String(definition?.id || '').trim()
  if (!definitionId) return false
  if (allowedPageIds.has(definitionId)) return true
  for (const allowedId of allowedPageIds) {
    if (allowedId.startsWith(definitionId)) {
      return true
    }
  }
  return false
}

export function createInlineDockPageRegistry(definitions = []) {
  const normalizedDefinitions = definitions
    .map((definition) => ({
      ...definition,
      id: String(definition?.id || '').trim(),
      type: String(definition?.type || definition?.id || '').trim(),
    }))
    .filter((definition) => definition.id && typeof definition.resolve === 'function')

  function resolvePages(context = {}) {
    const allowedPageIds = allowedPageIdsFromContext(context)
    const lifecycleDefinitions = lifecycleDefinitionsFromContext(context)
    const definitions = allowedPageIds.size > 0
      ? normalizedDefinitions.filter((definition) => isDefinitionAllowed(definition, allowedPageIds))
      : normalizedDefinitions

    return definitions.flatMap((definition) =>
      normalizePageList(definition.resolve(context))
        .map((page) => normalizePage(page, definition, lifecycleDefinitions.get(definition.id)))
        .filter(Boolean)
    )
  }

  function getDefinition(id = '') {
    const normalizedId = String(id || '').trim()
    return normalizedDefinitions.find((definition) => definition.id === normalizedId) || null
  }

  return {
    getDefinition,
    resolvePages,
  }
}

export function findInlineDockPage(pages = [], key = '') {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey) return null
  return pages.find((page) => page.key === normalizedKey) || null
}

function normalizeType(value = '') {
  return String(value || '').trim()
}

export function findFirstInlineDockPageByType(pages = [], type = '', preferredKey = '') {
  const normalizedType = normalizeType(type)
  if (!normalizedType) return null

  const typedPages = pages.filter((page) => page?.type === normalizedType)
  if (preferredKey) {
    const preferredPage = typedPages.find((page) => page.key === preferredKey)
    if (preferredPage) return preferredPage
  }
  return typedPages[0] || null
}

export function resolveInlineDockActivePageKey(pages = [], requestedType = '', options = {}) {
  const normalizedPages = Array.isArray(pages) ? pages.filter((page) => page?.key) : []
  if (normalizedPages.length === 0) return ''

  const preferredKeysByType = options.preferredKeysByType || {}
  const resolveByType = (type) =>
    findFirstInlineDockPageByType(normalizedPages, type, preferredKeysByType[type] || '')?.key || ''

  const requestedKey = resolveByType(normalizeType(requestedType))
  if (requestedKey) return requestedKey

  const defaultKey = resolveByType(normalizeType(options.defaultType))
  if (defaultKey) return defaultKey

  const fallbackTypes = Array.isArray(options.fallbackTypes) ? options.fallbackTypes : []
  for (const fallbackType of fallbackTypes.map(normalizeType).filter(Boolean)) {
    const fallbackKey = resolveByType(fallbackType)
    if (fallbackKey) return fallbackKey
  }

  return normalizedPages[0]?.key || ''
}

export function resolveInlineDockFallbackPageType(pages = [], closedPage = {}, options = {}) {
  const normalizedPages = Array.isArray(pages) ? pages.filter((page) => page?.key) : []
  if (normalizedPages.length === 0) return ''

  const fallbackTypes = [
    closedPage?.fallbackPage,
    closedPage?.lifecycle?.fallbackPage,
    options.defaultType,
  ].map(normalizeType).filter(Boolean)

  for (const type of fallbackTypes) {
    if (findFirstInlineDockPageByType(normalizedPages, type)) return type
  }

  return normalizedPages[0]?.type || ''
}

export function resolveInlineDockFallbackPage(pages = [], closedPage = {}, options = {}) {
  const normalizedPages = Array.isArray(pages) ? pages.filter((page) => page?.key) : []
  if (normalizedPages.length === 0) return null

  const preferredKeysByType = options.preferredKeysByType || {}
  const resolveByType = (type) =>
    findFirstInlineDockPageByType(
      normalizedPages,
      type,
      preferredKeysByType[normalizeType(type)] || ''
    )

  if (options.preferSameType !== false) {
    const siblingPage = resolveByType(closedPage?.type)
    if (siblingPage) return siblingPage
  }

  const fallbackType = resolveInlineDockFallbackPageType(normalizedPages, closedPage, options)
  return resolveByType(fallbackType) || normalizedPages[0] || null
}
