const DEFAULT_REFERENCE_WORKBENCH_DETAIL_LAYOUT = Object.freeze({
  minDockWidth: 420,
  minMainWidth: 520,
  maxContainerRatio: 0.52,
})

export const REFERENCE_WORKBENCH_DETAIL_CLOSE_RESET_DELAY_MS = 680
export const REFERENCE_WORKBENCH_DETAIL_LAYOUT = DEFAULT_REFERENCE_WORKBENCH_DETAIL_LAYOUT

function normalizeReferenceWorkbenchDetailLayout(layout = {}) {
  const source = layout && typeof layout === 'object' ? layout : {}
  const minDockWidth = Number(source.minDockWidth)
  const minMainWidth = Number(source.minMainWidth)
  const maxContainerRatio = Number(source.maxContainerRatio)

  return {
    minDockWidth:
      Number.isFinite(minDockWidth) && minDockWidth > 0
        ? minDockWidth
        : DEFAULT_REFERENCE_WORKBENCH_DETAIL_LAYOUT.minDockWidth,
    minMainWidth:
      Number.isFinite(minMainWidth) && minMainWidth > 0
        ? minMainWidth
        : DEFAULT_REFERENCE_WORKBENCH_DETAIL_LAYOUT.minMainWidth,
    maxContainerRatio:
      Number.isFinite(maxContainerRatio) && maxContainerRatio > 0
        ? maxContainerRatio
        : DEFAULT_REFERENCE_WORKBENCH_DETAIL_LAYOUT.maxContainerRatio,
  }
}

export function resolveReferenceDetailDockWidth(width, layout = {}) {
  const { minDockWidth } = normalizeReferenceWorkbenchDetailLayout(layout)
  return Math.max(minDockWidth, Number(width) || 0)
}

export function resolveReferenceDetailMaxWidth(containerWidth = 0, layout = {}) {
  const { minDockWidth, minMainWidth, maxContainerRatio } =
    normalizeReferenceWorkbenchDetailLayout(layout)
  const normalizedContainerWidth = Number(containerWidth)
  if (!Number.isFinite(normalizedContainerWidth) || normalizedContainerWidth <= 0) {
    return Number.MAX_SAFE_INTEGER
  }

  const maxByListWidth = Math.floor(normalizedContainerWidth - minMainWidth)
  const maxByRatio = Math.floor(normalizedContainerWidth * maxContainerRatio)
  return Math.max(minDockWidth, Math.min(maxByListWidth, maxByRatio))
}

export function buildReferenceDetailResizeConstraints({
  containerWidth = 0,
  layout = {},
} = {}) {
  const { minDockWidth, minMainWidth, maxContainerRatio } =
    normalizeReferenceWorkbenchDetailLayout(layout)
  return {
    containerWidth,
    minDockWidth,
    minMainWidth,
    maxContainerRatio,
  }
}

export function buildReferenceDetailResizePayload({
  width,
  containerWidth = 0,
  layout = {},
} = {}) {
  return {
    width,
    ...buildReferenceDetailResizeConstraints({ containerWidth, layout }),
  }
}

export function shouldReconcileReferenceDetailWidth({
  isOpen = false,
  width = 0,
  containerWidth = 0,
  layout = {},
} = {}) {
  if (!isOpen) return false

  const { minDockWidth } = normalizeReferenceWorkbenchDetailLayout(layout)
  const numericWidth = Number(width) || 0
  const maxWidth = resolveReferenceDetailMaxWidth(containerWidth, layout)
  return numericWidth < minDockWidth || numericWidth > maxWidth
}

export function resolveNextReferenceSortKey(sortKey = '', group = '') {
  const normalizedSortKey = String(sortKey || '').trim()
  const normalizedGroup = String(group || '').trim().toLowerCase()

  if (normalizedGroup === 'title') {
    return normalizedSortKey === 'title-asc' ? 'title-desc' : 'title-asc'
  }
  if (normalizedGroup === 'author') {
    return normalizedSortKey === 'author-asc' ? 'author-desc' : 'author-asc'
  }
  if (normalizedGroup === 'year') {
    return normalizedSortKey === 'year-desc' ? 'year-asc' : 'year-desc'
  }
  return normalizedSortKey
}

export function resolveReferencePdfPath(reference = {}) {
  return String(reference?.pdfPath || '').trim()
}

export function resolveReferenceCitedInFiles(citedIn = {}, citationKey = '') {
  const normalizedCitationKey = String(citationKey || '').trim()
  if (!normalizedCitationKey) return []

  const files = citedIn?.[normalizedCitationKey]
  return Array.isArray(files) ? files : []
}

export function referenceIsInCollection(reference = {}, collectionKey = '', collections = []) {
  const collection = Array.isArray(collections)
    ? collections.find((item) => item?.key === collectionKey)
    : null
  if (!collection) return false

  const memberships = Array.isArray(reference?.collections) ? reference.collections : []
  const normalizedKey = String(collection.key || '').trim().toLowerCase()
  const normalizedLabel = String(collection.label || '').trim().toLowerCase()
  return memberships.some((value) => {
    const normalizedValue = String(value || '').trim().toLowerCase()
    return normalizedValue === normalizedKey || normalizedValue === normalizedLabel
  })
}

export function normalizeReferenceFilenameSegment(value = '', fallback = 'reference') {
  const normalized = String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

export function buildReferenceExportDefaultPath(
  reference = {},
  { extension = '', fallback = 'reference' } = {},
) {
  const basename = normalizeReferenceFilenameSegment(
    reference?.citationKey || reference?.title,
    fallback,
  )
  const normalizedExtension = String(extension || '').trim().replace(/^\.+/, '')
  return normalizedExtension ? `${basename}.${normalizedExtension}` : basename
}

export function buildReferenceContextMenuGroups({
  reference = {},
  collections = [],
  translate = (key) => key,
} = {}) {
  const referenceId = String(reference?.id || '').trim()
  const normalizedCollections = Array.isArray(collections) ? collections : []
  const t = typeof translate === 'function' ? translate : (key) => key

  return [
    {
      key: 'reference-maintenance',
      items: [
        {
          key: `rename-pdf:${referenceId}`,
          label: t('Rename PDF'),
          disabled: !resolveReferencePdfPath(reference),
          actionId: 'rename-pdf',
          referenceId,
        },
        {
          key: `refresh-metadata:${referenceId}`,
          label: t('Refresh Metadata'),
          actionId: 'refresh-metadata',
          referenceId,
        },
      ],
    },
    {
      key: 'reference-collections',
      items: [
        {
          key: `collections:${referenceId}`,
          label: t('Collections'),
          children: normalizedCollections.length
            ? normalizedCollections.map((collection) => ({
                key: `collection:${referenceId}:${collection.key}`,
                label: collection.label,
                checked: referenceIsInCollection(reference, collection.key, normalizedCollections),
                actionId: 'toggle-collection',
                referenceId,
                collectionKey: collection.key,
              }))
            : [
                {
                  key: `collections-empty:${referenceId}`,
                  label: t('No collections yet'),
                  disabled: true,
                  actionId: 'noop',
                  referenceId,
                },
              ],
        },
      ],
    },
    {
      key: 'reference-exports',
      items: [
        {
          key: `export-bibtex:${referenceId}`,
          label: t('Export BibTeX...'),
          actionId: 'export-bibtex',
          referenceId,
        },
        {
          key: `export-detailed:${referenceId}`,
          label: t('Detailed Export...'),
          actionId: 'export-detailed',
          referenceId,
        },
        {
          key: `copy-bibtex:${referenceId}`,
          label: t('Copy BibTeX'),
          actionId: 'copy-bibtex',
          referenceId,
        },
      ],
    },
    {
      key: 'reference-actions',
      items: [
        {
          key: `delete:${referenceId}`,
          label: t('Delete'),
          danger: true,
          actionId: 'delete',
          referenceId,
        },
      ],
    },
  ]
}
