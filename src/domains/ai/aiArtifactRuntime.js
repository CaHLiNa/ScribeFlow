function tryParseJson(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) return null

  try {
    return JSON.parse(normalized)
  } catch {
    return null
  }
}

export function extractJsonPayload(rawText = '') {
  const direct = tryParseJson(rawText)
  if (direct && typeof direct === 'object') return direct

  const fencedMatch = String(rawText || '').match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch) {
    const fenced = tryParseJson(fencedMatch[1])
    if (fenced && typeof fenced === 'object') return fenced
  }

  const firstBrace = String(rawText || '').indexOf('{')
  const lastBrace = String(rawText || '').lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const sliced = tryParseJson(String(rawText || '').slice(firstBrace, lastBrace + 1))
    if (sliced && typeof sliced === 'object') return sliced
  }

  return null
}

function buildDocPatchArtifact(payload = {}, contextBundle = {}) {
  const replacementText = String(
    payload.replacement_text || payload.revised_paragraph || payload.paragraph || ''
  ).trim()
  if (!replacementText || !contextBundle.selection?.available || !contextBundle.document?.available) {
    return null
  }

  return {
    type: 'doc_patch',
    filePath: contextBundle.document.filePath,
    from: contextBundle.selection.from,
    to: contextBundle.selection.to,
    originalText: contextBundle.selection.text,
    replacementText,
    title: String(payload.title || 'Document patch').trim(),
    rationale: String(payload.rationale || '').trim(),
    citationSuggestion: String(payload.citation_suggestion || '').trim(),
  }
}

function buildNoteDraftArtifact(payload = {}, contextBundle = {}) {
  const content = String(
    payload.note_markdown || payload.content || payload.summary_markdown || payload.paragraph || ''
  ).trim()
  if (!content) return null

  const suggestedTitle = String(payload.title || 'AI note').trim() || 'AI note'
  const slug = suggestedTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'ai-note'

  return {
    type: 'note_draft',
    title: suggestedTitle,
    suggestedName: `${slug}.md`,
    content,
    sourceFilePath: contextBundle.document?.filePath || '',
    rationale: String(payload.rationale || payload.takeaway || '').trim(),
  }
}

export function normalizeAiArtifact(skillId = '', payload = {}, contextBundle = {}, fallbackText = '') {
  if (skillId === 'revise-with-citations') {
    return buildDocPatchArtifact(payload, contextBundle)
  }

  if (skillId === 'draft-related-work') {
    if (contextBundle.selection?.available) {
      return (
        buildDocPatchArtifact(payload, contextBundle) ||
        buildNoteDraftArtifact(payload, contextBundle)
      )
    }
    return buildNoteDraftArtifact(payload, contextBundle)
  }

  if (skillId === 'summarize-selection') {
    return buildNoteDraftArtifact(payload, contextBundle)
  }

  if (skillId === 'find-supporting-references' || skillId === 'grounded-chat') {
    return null
  }

  return null
}

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
