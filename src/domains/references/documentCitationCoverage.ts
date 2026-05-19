function normalizeCitationKey(value = '') {
  return String(value || '').trim()
}

function uniqueCitationKeys(values = []) {
  const seen = new Set()
  const keys = []

  for (const value of Array.isArray(values) ? values : []) {
    const key = normalizeCitationKey(value)
    if (!key || seen.has(key)) continue
    seen.add(key)
    keys.push(key)
  }

  return keys
}

export function citationKeysForReference(reference = {}) {
  return uniqueCitationKeys([reference?.citationKey, reference?.id])
}

export function referenceMatchesCitationKey(reference = {}, citationKey = '') {
  const normalizedKey = normalizeCitationKey(citationKey)
  if (!normalizedKey) return false
  return citationKeysForReference(reference).includes(normalizedKey)
}

export function buildDocumentCitationCoverage({ citedKeys = [], selectedReferences = [] } = {}) {
  const normalizedCitedKeys = uniqueCitationKeys(citedKeys)
  const normalizedSelectedReferences = Array.isArray(selectedReferences)
    ? selectedReferences.filter((reference) => reference && typeof reference === 'object')
    : []
  const selectedCitationKeys = new Set(
    normalizedSelectedReferences.flatMap((reference) => citationKeysForReference(reference))
  )
  const citedKeySet = new Set(normalizedCitedKeys)
  const linkedCitationKeys = normalizedCitedKeys.filter((key) => selectedCitationKeys.has(key))
  const missingCitationKeys = normalizedCitedKeys.filter((key) => !selectedCitationKeys.has(key))
  const unusedReferences = normalizedSelectedReferences.filter((reference) => {
    const referenceKeys = citationKeysForReference(reference)
    return referenceKeys.length > 0 && !referenceKeys.some((key) => citedKeySet.has(key))
  })

  return {
    citedKeys: normalizedCitedKeys,
    linkedCitationKeys,
    missingCitationKeys,
    unusedReferences,
    counts: {
      cited: normalizedCitedKeys.length,
      linked: linkedCitationKeys.length,
      missing: missingCitationKeys.length,
      selected: normalizedSelectedReferences.length,
      unused: unusedReferences.length,
    },
    allCitationsLinked:
      normalizedCitedKeys.length > 0 && missingCitationKeys.length === 0,
  }
}
