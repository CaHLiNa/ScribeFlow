const SUPPORTED_TYPES = new Set([
  'proposal',
  'review',
  'citation_set',
  'patch',
  'compile_diagnosis',
  'translation_block',
  'note_bundle',
])

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function cleanText(value = '') {
  return String(value || '').trim()
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = cleanText(value)
    if (text) return text
  }
  return ''
}

function truncate(text = '', max = 220) {
  const normalized = cleanText(text).replace(/\s+/g, ' ')
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1).trim()}...`
}

function normalizeComparableText(text = '') {
  return cleanText(text).replace(/\s+/g, ' ')
}

function dedupeArtifactText(artifact = null) {
  if (!artifact) return artifact
  if (
    artifact.summary
    && artifact.body
    && normalizeComparableText(artifact.summary) === normalizeComparableText(artifact.body)
  ) {
    artifact.summary = ''
  }
  return artifact
}

function parsePayload(payload) {
  if (!payload) return null
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload)
    } catch {
      return null
    }
  }
  return typeof payload === 'object' ? payload : null
}

function resolveArtifactType(payload, context = {}) {
  const explicitType = cleanText(payload?._type)
  if (SUPPORTED_TYPES.has(explicitType)) return explicitType

  const intent = cleanText(context.artifactIntent)
  if (intent && SUPPORTED_TYPES.has(intent)) return intent

  const role = cleanText(context.role)
  if (role === 'reviewer') return 'review'
  if (role === 'citation_librarian') return 'citation_set'
  if (role === 'pdf_translator') return 'translation_block'
  if (role === 'tex_typ_fixer') return 'patch'

  return null
}

function normalizeOptions(options = []) {
  return asArray(options)
    .map((item) => {
      const title = firstNonEmpty(item?.title, item?.label)
      const description = firstNonEmpty(item?.description, item?.summary, item?.text)
      if (!title && !description) return null
      return {
        title,
        description,
        url: cleanText(item?.url),
        doi: cleanText(item?.doi),
      }
    })
    .filter(Boolean)
}

function normalizeItems(items = []) {
  return asArray(items)
    .map((item) => firstNonEmpty(item?.title, item?.text, item))
    .filter(Boolean)
}

function normalizePatch(payload = {}) {
  return asArray(payload.changes || payload.patches)
    .map((entry) => ({
      filePath: cleanText(entry?.filePath || entry?.path),
      summary: firstNonEmpty(entry?.summary, entry?.description, entry?.diff),
    }))
    .filter((entry) => entry.filePath || entry.summary)
}

function normalizeProblems(items = []) {
  return asArray(items)
    .map((item) => ({
      sourcePath: cleanText(item?.sourcePath || item?.filePath || item?.file || ''),
      line: Number.isInteger(item?.line) && item.line > 0 ? item.line : null,
      column: Number.isInteger(item?.column) && item.column >= 0 ? item.column : null,
      severity: item?.severity === 'error' ? 'error' : 'warning',
      origin: cleanText(item?.origin || 'compile'),
      message: firstNonEmpty(item?.message, item?.summary, item?.raw),
    }))
    .filter((item) => item.message)
}

function buildBaseArtifact(type, payload = {}, context = {}) {
  const title = firstNonEmpty(
    payload.title,
    payload.prompt,
    context.label,
  )
  const sourceFile = cleanText(
    payload.sourceFile
    || payload.filePath
    || context.filePath
    || context.sourceFile,
  )
  const summary = firstNonEmpty(
    payload.summary,
    payload.description,
    payload.text,
    payload.body,
  )

  return dedupeArtifactText({
    type,
    title: title || type,
    summary: truncate(summary),
    body: cleanText(payload.body || payload.text),
    prompt: cleanText(payload.prompt),
    sourceFile,
    createdAt: context.createdAt || null,
    options: normalizeOptions(payload.options),
    items: normalizeItems(payload.items),
    changes: normalizePatch(payload),
  })
}

function inferTextArtifact(message, context = {}) {
  const body = cleanText(
    asArray(message?.parts)
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n\n'),
  )
  if (!body) return null

  const type = resolveArtifactType(null, context)
  if (!type || type === 'proposal') return null

  const artifact = buildBaseArtifact(type, { body, text: body }, context)
  if (!artifact.summary) artifact.summary = truncate(body)
  return dedupeArtifactText(artifact)
}

export function normalizeArtifactPayload(payload, context = {}) {
  const parsed = parsePayload(payload)
  if (!parsed) return null

  const type = resolveArtifactType(parsed, context)
  if (!type) return null

  const artifact = buildBaseArtifact(type, parsed, context)

  if (type === 'citation_set' && artifact.options.length === 0) {
    artifact.options = normalizeOptions(parsed.references || parsed.candidates || parsed.entries)
  }

  if (type === 'note_bundle' && artifact.items.length === 0) {
    artifact.items = normalizeItems(parsed.notes || parsed.highlights || parsed.points)
  }

  if (type === 'translation_block') {
    artifact.sourceText = cleanText(parsed.sourceText || parsed.source || '')
    artifact.translation = cleanText(parsed.translation || parsed.translatedText || artifact.body)
  }

  if (type === 'patch' && artifact.changes.length === 0 && artifact.body) {
    artifact.changes = [{
      filePath: artifact.sourceFile,
      summary: truncate(artifact.body),
    }]
  }

  if (type === 'compile_diagnosis') {
    artifact.kind = cleanText(parsed.kind || '')
    artifact.status = cleanText(parsed.status || '')
    artifact.errorCount = Number(parsed.errorCount || 0)
    artifact.warningCount = Number(parsed.warningCount || 0)
    artifact.durationMs = Number(parsed.durationMs || 0)
    artifact.compileTargetPath = cleanText(parsed.compileTargetPath || '')
    artifact.commandPreview = cleanText(parsed.commandPreview || '')
    artifact.problems = normalizeProblems(parsed.problems || parsed.items)
    if (!artifact.summary) {
      artifact.summary = firstNonEmpty(
        parsed.summary,
        `${artifact.errorCount} errors, ${artifact.warningCount} warnings`,
      )
    }
  }

  if (type === 'review' && !artifact.body) {
    artifact.body = firstNonEmpty(parsed.review, parsed.analysis, parsed.notes)
  }

  if (!artifact.summary) {
    artifact.summary = truncate(artifact.body || artifact.prompt)
  }

  return dedupeArtifactText(artifact)
}

export function collectArtifactsFromMessage(message, context = {}) {
  const artifacts = []
  const parts = asArray(message?.parts)

  for (const part of parts) {
    const partContext = {
      ...context,
      createdAt: message?.createdAt || context.createdAt,
    }
    const artifact = normalizeArtifactPayload(part?.output, partContext)
    if (!artifact) continue
    artifacts.push({
      id: `${message?.id || 'message'}:${part?.toolCallId || part?.type || artifacts.length}`,
      messageId: message?.id || null,
      toolName: cleanText(part?.toolName || part?.type?.replace('tool-', '')),
      ...artifact,
    })
  }

  if (artifacts.length > 0) return artifacts

  const textArtifact = inferTextArtifact(message, context)
  if (!textArtifact) return []

  return [{
    id: `${message?.id || 'message'}:text-artifact`,
    messageId: message?.id || null,
    toolName: null,
    ...textArtifact,
  }]
}
