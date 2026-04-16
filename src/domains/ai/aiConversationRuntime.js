import { t } from '../../i18n/index.js'

function trimText(value = '') {
  return String(value || '').trim()
}

function previewText(value = '', maxChars = 120) {
  const normalized = trimText(value)
  if (!normalized || normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, maxChars).trimEnd()}…`
}

function skillLabel(skill = null) {
  if (!skill) return t('Grounded chat')
  if (skill.kind === 'filesystem-skill') return skill.name || skill.slug || t('Unnamed skill')
  return t(skill.titleKey || skill.id || 'Grounded chat')
}

function providerSummary(providerState = {}) {
  const label = trimText(providerState.currentProviderLabel)
  const model = trimText(providerState.model)
  return [label, model].filter(Boolean).join(' · ')
}

function artifactPreview(artifact = null) {
  if (!artifact) return ''
  if (artifact.type === 'doc_patch') return previewText(artifact.replacementText, 180)
  if (artifact.type === 'note_draft') return previewText(artifact.content, 180)
  return previewText(artifact.content || artifact.rationale || '', 180)
}

export function buildAiContextChips(contextBundle = {}) {
  const chips = []

  if (contextBundle.workspace?.available) {
    chips.push({
      kind: 'workspace',
      label: t('Folder'),
      value: trimText(contextBundle.workspace.label || contextBundle.workspace.path),
    })
  }

  if (contextBundle.document?.available) {
    chips.push({
      kind: 'document',
      label: t('Document'),
      value: trimText(contextBundle.document.label || contextBundle.document.filePath),
    })
  }

  if (contextBundle.selection?.available) {
    chips.push({
      kind: 'selection',
      label: t('Selection'),
      value: trimText(contextBundle.selection.preview || contextBundle.selection.text),
    })
  }

  if (contextBundle.reference?.available) {
    chips.push({
      kind: 'reference',
      label: t('Reference'),
      value: trimText(
        contextBundle.reference.citationKey
          ? `${contextBundle.reference.citationKey} · ${contextBundle.reference.title || ''}`
          : contextBundle.reference.title
      ),
    })
  }

  return chips.filter((chip) => chip.value)
}

function summarizeContextForTool(contextBundle = {}) {
  return buildAiContextChips(contextBundle)
    .map((chip) => `${chip.label}: ${chip.value}`)
    .join(' · ')
}

function normalizeToolEvent(event = {}) {
  const toolId = trimText(event.toolId || event.id)
  if (!toolId) return null

  return {
    type: 'tool',
    toolId,
    status: trimText(event.status || 'done') || 'done',
    label: trimText(event.label || toolId),
    context: trimText(event.context),
    detail: trimText(event.detail),
    payload: event.payload && typeof event.payload === 'object' ? event.payload : null,
  }
}

function mergeToolParts(existingParts = [], nextEvent = {}) {
  const normalizedEvent = normalizeToolEvent(nextEvent)
  if (!normalizedEvent) return Array.isArray(existingParts) ? existingParts : []

  const parts = Array.isArray(existingParts) ? [...existingParts] : []
  const existingIndex = parts.findIndex(
    (part) => part.type === 'tool' && part.toolId === normalizedEvent.toolId
  )

  if (existingIndex >= 0) {
    parts.splice(existingIndex, 1, {
      ...parts[existingIndex],
      ...normalizedEvent,
    })
    return parts
  }

  parts.push(normalizedEvent)
  return parts
}

function replaceOrAppendTextualPart(
  existingParts = [],
  matcher = () => false,
  nextPart = {},
  preferredAfterTypes = ['tool', 'status']
) {
  const parts = Array.isArray(existingParts) ? [...existingParts] : []
  const existingIndex = parts.findIndex(matcher)
  if (existingIndex >= 0) {
    parts.splice(existingIndex, 1, {
      ...parts[existingIndex],
      ...nextPart,
    })
    return parts
  }

  const insertAfterIndex = [...parts]
    .map((part, index) => ({ part, index }))
    .filter(({ part }) => preferredAfterTypes.includes(part.type))
    .map(({ index }) => index)
    .pop()

  if (Number.isInteger(insertAfterIndex)) {
    parts.splice(insertAfterIndex + 1, 0, nextPart)
    return parts
  }

  parts.push(nextPart)
  return parts
}

export function extractAiMessageText(message = null) {
  if (!message) return ''
  if (Array.isArray(message.parts) && message.parts.length > 0) {
    return message.parts
      .filter((part) => part.type === 'text' || part.type === 'support' || part.type === 'note' || part.type === 'error')
      .map((part) => trimText(part.text))
      .filter(Boolean)
      .join('\n\n')
      .trim()
  }
  return trimText(message.content)
}

export function buildAiUserConversationMessage({
  id = '',
  skill = null,
  userInstruction = '',
  contextBundle = {},
  createdAt = Date.now(),
} = {}) {
  const text = trimText(userInstruction) || skillLabel(skill)

  return {
    id,
    role: 'user',
    createdAt,
    content: text,
    parts: [
      {
        type: 'text',
        text,
      },
    ],
    metadata: {
      skillLabel: skillLabel(skill),
      contextChips: buildAiContextChips(contextBundle),
    },
  }
}

export function buildAiPendingAssistantMessage({
  id = '',
  skill = null,
  providerState = {},
  contextBundle = {},
  createdAt = Date.now(),
} = {}) {
  return {
    id,
    role: 'assistant',
    createdAt,
    content: '',
    parts: [],
    metadata: {
      skillLabel: skillLabel(skill),
      providerSummary: providerSummary(providerState),
      contextChips: buildAiContextChips(contextBundle),
    },
  }
}

export function buildAiAssistantConversationMessage({
  id = '',
  skill = null,
  result = null,
  artifact = null,
  providerState = {},
  contextBundle = {},
  createdAt = Date.now(),
} = {}) {
  const payload = result?.payload || {}
  const mainText = trimText(
    artifact?.type === 'doc_patch'
      ? artifact.replacementText
      : artifact?.type === 'note_draft'
        ? artifact.content
        : artifact?.content || payload.answer || payload.summary || payload.paragraph || result?.content
  )
  const rationale = trimText(payload.rationale || artifact?.rationale)
  const citationSuggestion = trimText(payload.citation_suggestion || artifact?.citationSuggestion)

  const parts = []

  if (Array.isArray(result?.events)) {
    for (const event of result.events) {
      const normalizedPart = normalizeToolEvent(event)
      if (normalizedPart) {
        parts.push(normalizedPart)
      }
    }
  }

  if (rationale) {
    parts.push({
      type: 'support',
      label: t('Grounding note'),
      text: rationale,
    })
  }

  if (mainText) {
    parts.push({
      type: 'text',
      text: mainText,
    })
  }

  if (citationSuggestion) {
    parts.push({
      type: 'note',
      label: t('Citation suggestion'),
      text: citationSuggestion,
    })
  }

  if (artifact) {
    parts.push({
      type: 'artifact',
      artifactId: artifact.id,
      title: artifact.title || artifact.type,
      artifactType: artifact.type,
      preview: artifactPreview(artifact),
    })
  }

  return {
    id,
    role: 'assistant',
    createdAt,
    content: mainText || rationale || trimText(result?.content),
    parts,
    metadata: {
      skillLabel: skillLabel(skill),
      providerSummary: providerSummary(providerState),
      contextChips: buildAiContextChips(contextBundle),
    },
  }
}

export function buildAiFailedAssistantMessage({
  id = '',
  skill = null,
  error = '',
  providerState = {},
  contextBundle = {},
  events = [],
  createdAt = Date.now(),
} = {}) {
  const message = trimText(error) || t('AI execution failed.')
  const parts = []

  if (Array.isArray(events)) {
    for (const event of events) {
      const normalizedPart = normalizeToolEvent(event)
      if (normalizedPart) {
        parts.push(normalizedPart)
      }
    }
  }

  return {
    id,
    role: 'assistant',
    createdAt,
    content: message,
    parts: [
      ...parts,
      {
        type: 'error',
        text: message,
      },
    ],
    metadata: {
      skillLabel: skillLabel(skill),
      providerSummary: providerSummary(providerState),
      contextChips: buildAiContextChips(contextBundle),
    },
  }
}

export function applyAiToolEventToMessage(message = null, event = {}) {
  if (!message) return message

  const nextParts = mergeToolParts(message.parts, event)
  return {
    ...message,
    parts: nextParts,
  }
}

export function applyAiConversationEventToMessage(message = null, event = {}) {
  if (!message || !event || typeof event !== 'object') return message

  if (event.eventType === 'tool' || event.toolId) {
    return applyAiToolEventToMessage(message, event)
  }

  if (event.eventType === 'assistant-content') {
    const text = trimText(event.text)
    if (!text) return message
    return {
      ...message,
      content: text,
      parts: replaceOrAppendTextualPart(
        message.parts,
        (part) => part.type === 'text' && part.isStreaming === true,
        {
          type: 'text',
          text,
          isStreaming: true,
        }
      ),
    }
  }

  if (event.eventType === 'assistant-reasoning') {
    const text = trimText(event.text)
    if (!text) return message
    return {
      ...message,
      parts: replaceOrAppendTextualPart(
        message.parts,
        (part) => part.type === 'support' && part.isStreaming === true,
        {
          type: 'support',
          label: t('Reasoning'),
          text,
          isStreaming: true,
        },
        ['status']
      ),
    }
  }

  return message
}
