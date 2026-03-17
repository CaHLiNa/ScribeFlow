function normalizeOutlineTitle(title) {
  const normalized = String(title || '').replace(/\u0000/g, '').trim()
  return normalized || '-'
}

export function normalizePdfOutlineTree(items, path = '') {
  if (!Array.isArray(items)) return []

  return items.map((item, index) => {
    const id = path ? `${path}.${index}` : String(index)
    return {
      id,
      title: normalizeOutlineTitle(item?.title),
      dest: item?.dest ?? null,
      url: item?.url ?? '',
      bold: !!item?.bold,
      italic: !!item?.italic,
      items: normalizePdfOutlineTree(item?.items || [], id),
    }
  })
}
