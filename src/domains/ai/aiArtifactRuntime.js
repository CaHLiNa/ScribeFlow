export function applyTextPatchToContent(content = '', artifact = {}) {
  const source = String(content || '')
  const from = Number.isInteger(artifact.from) ? artifact.from : -1
  const to = Number.isInteger(artifact.to) ? artifact.to : -1
  const originalText = String(artifact.originalText || '')
  const replacementText = String(artifact.replacementText || '')

  if (from < 0 || to < from || to > source.length) {
    throw new Error('Patch range is outside the current document content.')
  }

  const currentSlice = source.slice(from, to)
  if (originalText && currentSlice !== originalText) {
    throw new Error('The current document no longer matches the AI patch source selection.')
  }

  return `${source.slice(0, from)}${replacementText}${source.slice(to)}`
}
