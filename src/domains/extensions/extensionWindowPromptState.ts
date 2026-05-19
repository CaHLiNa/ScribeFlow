function normalizeId(value = '') {
  return String(value || '').trim()
}

function hasOwnValue(item = {}) {
  return Object.prototype.hasOwnProperty.call(item, 'value')
}

function quickPickValue(item = {}) {
  return hasOwnValue(item) ? item.value : String(item?.label || '')
}

export function seedQuickPickSelection(items = []) {
  if (!Array.isArray(items)) return []
  return items
    .filter((item) => Boolean(item?.picked))
    .map((item) => normalizeId(item?.id))
    .filter(Boolean)
}

export function toggleQuickPickSelection(selectedIds = [], itemId = '') {
  const normalizedItemId = normalizeId(itemId)
  const normalizedSelectedIds = Array.isArray(selectedIds)
    ? selectedIds.map((entry) => normalizeId(entry)).filter(Boolean)
    : []
  if (!normalizedItemId) return normalizedSelectedIds
  if (normalizedSelectedIds.includes(normalizedItemId)) {
    return normalizedSelectedIds.filter((entry) => entry !== normalizedItemId)
  }
  return [...normalizedSelectedIds, normalizedItemId]
}

export function isQuickPickItemSelected(selectedIds = [], itemId = '') {
  const normalizedItemId = normalizeId(itemId)
  if (!normalizedItemId) return false
  return Array.isArray(selectedIds)
    ? selectedIds.map((entry) => normalizeId(entry)).includes(normalizedItemId)
    : false
}

export function resolveQuickPickSubmission({
  requestItems = [],
  filteredItems = [],
  activeIndex = 0,
  selectedItemIds = [],
  canPickMany = false,
  explicitItem = null,
} = {}) {
  if (canPickMany) {
    const selected = Array.isArray(selectedItemIds)
      ? selectedItemIds.map((entry) => normalizeId(entry)).filter(Boolean)
      : []
    const selectedSet = new Set(selected)
    if (!Array.isArray(requestItems)) return []
    return requestItems
      .filter((item) => selectedSet.has(normalizeId(item?.id)))
      .map((item) => quickPickValue(item))
  }

  const availableItems = Array.isArray(filteredItems) ? filteredItems : []
  const target = explicitItem || availableItems[Math.max(0, Number(activeIndex) || 0)]
  if (!target || typeof target !== 'object') return undefined
  return quickPickValue(target)
}
