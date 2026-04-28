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
      ? normalizedDefinitions.filter((definition) => allowedPageIds.has(definition.id))
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
