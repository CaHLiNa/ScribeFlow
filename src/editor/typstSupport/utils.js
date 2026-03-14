const LABEL_RE = /<([A-Za-z][\w:-]*)>/g

export function extractTypstLabels(text = '') {
  const labels = []
  const seen = new Set()
  let match

  LABEL_RE.lastIndex = 0
  while ((match = LABEL_RE.exec(String(text))) !== null) {
    const label = match[1]
    if (!label || seen.has(label)) continue
    seen.add(label)
    labels.push(label)
  }

  return labels
}

export function buildTypstLabelSet(text = '') {
  return new Set(extractTypstLabels(text))
}

function formatReferenceDetail(ref = {}) {
  const author = ref.author?.[0]?.family || ref.author?.[0]?.given || ''
  const year = ref.issued?.['date-parts']?.[0]?.[0] || ''
  const title = ref.title || ''

  const left = [author, year].filter(Boolean).join(' ')
  return [left, title].filter(Boolean).join(' · ') || 'Library reference'
}

export function collectTypstReferenceOptions({ referencesStore, documentText = '', query = '', limit = 12 } = {}) {
  const normalizedQuery = String(query || '').trim().toLowerCase()
  const options = []
  const seen = new Set()

  for (const label of extractTypstLabels(documentText)) {
    if (normalizedQuery && !label.toLowerCase().includes(normalizedQuery)) continue
    const insertText = `@${label}`
    options.push({
      label: insertText,
      detail: 'Document label',
      type: 'variable',
      apply: insertText,
    })
    seen.add(insertText)
    if (options.length >= limit) return options
  }

  const refs = referencesStore
    ? (normalizedQuery ? referencesStore.searchRefs(normalizedQuery) : referencesStore.sortedLibrary || referencesStore.library || [])
    : []

  for (const ref of refs) {
    const key = ref?._key
    if (!key) continue

    const insertText = `@${key}`
    if (seen.has(insertText)) continue

    options.push({
      label: insertText,
      detail: formatReferenceDetail(ref),
      type: 'constant',
      apply: insertText,
    })
    seen.add(insertText)

    if (options.length >= limit) break
  }

  return options
}
