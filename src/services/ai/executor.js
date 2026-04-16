import { extractJsonPayload, normalizeAiArtifact } from '../../domains/ai/aiArtifactRuntime.js'
import { t } from '../../i18n/index.js'
import {
  buildPreparedAiBrief,
  getAiSkillBehaviorId,
  getAiSkillById,
} from './skillRegistry.js'
import { isAltalsManagedFilesystemSkill } from './skillDiscovery.js'
import { loadSkillSupportingFiles, buildSkillSupportPromptBlock } from './skillSupportFiles.js'
import { runAiProviderRuntime } from './runtime/providerRuntime.js'

function buildSystemPrompt(skill = {}, { structured = false } = {}) {
  const lines = [
    'You are Altals AI, a local-first academic research assistant embedded in a writing workbench.',
    'You must stay grounded in the supplied project context and never invent evidence or citations.',
    `Current entry: ${skill.id || 'unknown'}.`,
  ]

  if (structured) {
    lines.push('Return valid JSON only.')
  }

  return lines.join(' ')
}

function buildResponseContract(skillId = '', contextBundle = {}) {
  if (skillId === 'grounded-chat') {
    return [
      'Return JSON with this shape:',
      '{',
      '  "answer": "grounded answer for the user",',
      '  "rationale": "brief note about what context supported the answer"',
      '}',
    ].join('\n')
  }

  if (skillId === 'revise-with-citations') {
    return [
      'Return JSON with this shape:',
      '{',
      '  "replacement_text": "the revised paragraph only",',
      '  "citation_suggestion": "where the citation should appear",',
      '  "rationale": "why this revision is grounded in the supplied context"',
      '}',
    ].join('\n')
  }

  if (skillId === 'draft-related-work') {
    return [
      'Return JSON with this shape:',
      '{',
      '  "paragraph": "related-work paragraph",',
      '  "citation_suggestion": "citation placement guidance",',
      '  "rationale": "how the paragraph uses the supplied reference",',
      '  "title": "optional short title for a note if no direct patch should be applied"',
      '}',
    ].join('\n')
  }

  if (skillId === 'summarize-selection') {
    return [
      'Return JSON with this shape:',
      '{',
      '  "title": "short note title",',
      '  "note_markdown": "# Heading\\n\\nstructured markdown note",',
      '  "takeaway": "one sentence takeaway",',
      '  "rationale": "why these are the key points"',
      '}',
    ].join('\n')
  }

  if (skillId === 'find-supporting-references') {
    return [
      'Return JSON with this shape:',
      '{',
      '  "answer": "diagnosis of what support is missing",',
      '  "rationale": "what in the passage created this diagnosis",',
      '  "title": "optional short label"',
      '}',
    ].join('\n')
  }

  return [
    'Return JSON with this shape:',
    '{',
    '  "answer": "useful grounded answer",',
    '  "rationale": "brief support note"',
    '}',
  ].join('\n')
}

function requiresStructuredResponse(skillId = '') {
  return skillId !== 'grounded-chat'
}

function buildReferencedFilesBlock(referencedFiles = []) {
  const entries = (Array.isArray(referencedFiles) ? referencedFiles : []).filter(Boolean)
  if (entries.length === 0) return ''

  return [
    'Referenced files:',
    ...entries.flatMap((file) => {
      const header = `- ${file.relativePath || file.path}`
      const content = String(file.content || '').trim()
      if (!content) {
        return [header, '  (content unavailable)']
      }
      return [
        header,
        '```text',
        content.length > 5000 ? `${content.slice(0, 5000).trimEnd()}…` : content,
        '```',
      ]
    }),
  ].join('\n')
}

function buildAttachmentBlock(attachments = []) {
  const entries = (Array.isArray(attachments) ? attachments : []).filter(Boolean)
  if (entries.length === 0) return ''

  return [
    'Attached files:',
    ...entries.flatMap((attachment) => {
      const summary = `- ${attachment.name} (${attachment.mediaType || 'unknown'})`
      if (!attachment.isText) {
        return [summary, '  Non-text attachment attached in the desktop app. Use metadata only unless more context is requested.']
      }

      if (attachment.readError) {
        return [summary, `  Failed to read content: ${attachment.readError}`]
      }

      const content = String(attachment.content || '').trim()
      if (!content) {
        return [summary, '  No inline text preview available.']
      }

      return [
        summary,
        '```text',
        content,
        '```',
      ]
    }),
  ].join('\n')
}

function buildRequestedToolsBlock(requestedTools = []) {
  const entries = (Array.isArray(requestedTools) ? requestedTools : [])
    .map((tool) => String(tool || '').trim())
    .filter(Boolean)
  if (entries.length === 0) return ''

  return [
    'User-mentioned tools:',
    ...entries.map((tool) => `- ${tool}`),
  ].join('\n')
}

function buildUserPrompt({
  skill = {},
  contextBundle = {},
  userInstruction = '',
  conversation = [],
  altalsSkills = [],
  supportFiles = [],
  attachments = [],
  referencedFiles = [],
  requestedTools = [],
} = {}) {
  const brief = buildPreparedAiBrief(skill, contextBundle, { altalsSkills })
  const supportFileBlock = buildSkillSupportPromptBlock(supportFiles)
  const referencedFilesBlock = buildReferencedFilesBlock(referencedFiles)
  const attachmentBlock = buildAttachmentBlock(attachments)
  const requestedToolsBlock = buildRequestedToolsBlock(requestedTools)
  const behaviorId = getAiSkillBehaviorId(skill)
  const structured = requiresStructuredResponse(behaviorId)
  const historyBlock = conversation.length
    ? [
      'Recent conversation:',
      ...conversation.map((message) => `${message.role.toUpperCase()}: ${message.content}`),
      '',
    ].join('\n')
    : ''

  return [
    brief,
    '',
    supportFileBlock,
    referencedFilesBlock ? `\n${referencedFilesBlock}` : '',
    attachmentBlock ? `\n${attachmentBlock}` : '',
    requestedToolsBlock ? `\n${requestedToolsBlock}` : '',
    '',
    historyBlock,
    userInstruction
      ? `Additional user instruction:\n${String(userInstruction || '').trim()}`
      : 'Additional user instruction:\nNone.',
    ...(structured ? ['', buildResponseContract(behaviorId, contextBundle)] : []),
  ].join('\n')
}

function summarizeContextBundle(contextBundle = {}) {
  const segments = []

  if (contextBundle.document?.available) {
    segments.push(
      String(contextBundle.document.label || contextBundle.document.filePath || '').trim()
    )
  }

  if (contextBundle.selection?.available) {
    segments.push(String(contextBundle.selection.preview || contextBundle.selection.text || '').trim())
  }

  if (contextBundle.reference?.available) {
    const citationKey = String(contextBundle.reference.citationKey || '').trim()
    const title = String(contextBundle.reference.title || '').trim()
    segments.push([citationKey, title].filter(Boolean).join(' · '))
  }

  return segments.filter(Boolean).join(' · ')
}

function summarizeProvider(config = {}) {
  const providerId = String(config.providerId || '').trim()
  const model = String(config.model || '').trim()
  return [providerId, model].filter(Boolean).join(' · ')
}

function upsertEvent(events = [], nextEvent = {}) {
  const toolId = String(nextEvent.toolId || nextEvent.id || '').trim()
  if (!toolId) return events

  const normalizedEvent = {
    ...nextEvent,
    toolId,
  }
  const nextEvents = Array.isArray(events) ? [...events] : []
  const existingIndex = nextEvents.findIndex((event) => String(event.toolId || '') === toolId)

  if (existingIndex >= 0) {
    nextEvents.splice(existingIndex, 1, {
      ...nextEvents[existingIndex],
      ...normalizedEvent,
    })
    return nextEvents
  }

  nextEvents.push(normalizedEvent)
  return nextEvents
}

function buildToolEvent({
  toolId = '',
  status = 'done',
  label = '',
  context = '',
  detail = '',
  payload = null,
} = {}) {
  return {
    eventType: 'tool',
    toolId: String(toolId || '').trim(),
    status: String(status || 'done').trim() || 'done',
    label: String(label || '').trim(),
    context: String(context || '').trim(),
    detail: String(detail || '').trim(),
    payload: payload && typeof payload === 'object' ? payload : null,
  }
}

function buildAssistantStreamEvent(eventType = '', text = '', delta = '') {
  return {
    eventType,
    text: String(text || ''),
    delta: String(delta || ''),
  }
}

function buildTaskProgressDetail(event = {}) {
  const segments = []
  const description = String(event.description || '').trim()
  const lastToolName = String(event.lastToolName || '').trim()
  const elapsedSeconds = Number(event.elapsedSeconds || 0)

  if (description) {
    segments.push(description)
  }

  if (lastToolName) {
    segments.push(lastToolName)
  }

  if (elapsedSeconds > 0) {
    segments.push(t('Running for about {count}s.', { count: elapsedSeconds }))
  }

  return segments.join(' · ')
}

function isPassthroughRuntimeEvent(event = {}) {
  return [
    'ask_user_request',
    'ask_user_resolved',
    'exit_plan_mode_request',
    'exit_plan_mode_resolved',
    'plan_mode_start',
    'plan_mode_end',
    'background_task',
    'compacting',
    'compact_complete',
    'permission_mode_changed',
    'task_started',
    'task_progress',
    'task_notification',
    'waiting_resume',
    'resume_start',
  ].includes(String(event?.type || '').trim())
}

function mapRuntimeEventToToolEvent(event = {}) {
  if (event.type === 'compacting') {
    return buildToolEvent({
      toolId: 'runtime:compacting',
      status: 'running',
      label: t('Compact context'),
      detail: t('The runtime is compacting earlier context before continuing.'),
      payload: {
        eventType: event.type,
      },
    })
  }

  if (event.type === 'compact_complete') {
    return buildToolEvent({
      toolId: 'runtime:compacting',
      status: 'done',
      label: t('Compact context'),
      detail: t('Context compaction completed.'),
      payload: {
        eventType: event.type,
      },
    })
  }

  if (event.type === 'tool_call_start') {
    const toolName = String(event.toolName || 'tool')
    return buildToolEvent({
      toolId: `runtime:${event.toolCallId || event.toolName || 'tool'}`,
      status: 'running',
      label: toolName,
      detail: t('The model requested a local tool call and is waiting for the result.'),
      payload: {
        eventType: event.type,
        toolName,
        toolCallId: event.toolCallId,
      },
    })
  }

  if (event.type === 'tool_call_progress') {
    const elapsedSeconds = Number(event.elapsedSeconds || 0)
    const toolName = String(event.toolName || 'tool')
    return buildToolEvent({
      toolId: `runtime:${event.toolCallId || event.toolName || 'tool'}`,
      status: 'running',
      label: toolName,
      detail: elapsedSeconds > 0
        ? t('Running for about {count}s.', { count: elapsedSeconds })
        : t('The model requested a local tool call and is waiting for the result.'),
      payload: {
        eventType: event.type,
        toolName,
        toolCallId: event.toolCallId,
        elapsedSeconds,
      },
    })
  }

  if (event.type === 'tool_call_done') {
    const toolName = String(event.toolName || 'tool')
    return buildToolEvent({
      toolId: `runtime:${event.toolCallId || event.toolName || 'tool'}`,
      status: event.isError ? 'error' : 'done',
      label: toolName,
      detail: String(event.detail || '').trim() || (
        event.isError ? t('The tool run failed.') : t('The tool run completed.')
      ),
      payload: {
        eventType: event.type,
        toolName,
        toolCallId: event.toolCallId,
        isError: event.isError === true,
      },
    })
  }

  if (event.type === 'task_started' && event.taskId) {
    return buildToolEvent({
      toolId: `task:${event.taskId}`,
      status: 'running',
      label: t('Background task'),
      context: String(event.taskType || event.taskId || '').trim(),
      detail: String(event.description || '').trim() || t('The agent started a background task.'),
      payload: {
        eventType: event.type,
        taskId: event.taskId,
        taskType: event.taskType,
        toolUseId: event.toolUseId,
      },
    })
  }

  if (event.type === 'task_progress' && event.taskId) {
    return buildToolEvent({
      toolId: `task:${event.taskId}`,
      status: 'running',
      label: t('Background task'),
      context: String(event.lastToolName || event.taskId || '').trim(),
      detail: buildTaskProgressDetail(event) || t('The agent started a background task.'),
      payload: {
        eventType: event.type,
        taskId: event.taskId,
        toolUseId: event.toolUseId,
        elapsedSeconds: Number(event.elapsedSeconds || 0) || 0,
        usage: event.usage || null,
      },
    })
  }

  if (event.type === 'task_notification' && event.taskId) {
    return buildToolEvent({
      toolId: `task:${event.taskId}`,
      status: event.status === 'failed' ? 'error' : 'done',
      label: t('Background task'),
      context: String(event.taskId || '').trim(),
      detail:
        String(event.summary || '').trim()
        || (event.status === 'failed' ? t('The tool run failed.') : t('The tool run completed.')),
      payload: {
        eventType: event.type,
        taskId: event.taskId,
        toolUseId: event.toolUseId,
        status: event.status,
        outputFile: event.outputFile,
        usage: event.usage || null,
      },
    })
  }

  if (event.type === 'permission_request') {
    return buildToolEvent({
      toolId: `permission:${event.requestId || event.toolUseId || event.toolName || 'tool'}`,
      status: 'running',
      label: t('Permission request'),
      context: String(event.displayName || event.toolName || 'tool'),
      detail:
        String(event.title || '').trim()
        || String(event.description || '').trim()
        || t('The model is waiting for your approval before using a built-in tool.'),
      payload: {
        eventType: event.type,
        toolName: event.toolName,
        requestId: event.requestId,
      },
    })
  }

  if (event.type === 'permission_resolved') {
    return buildToolEvent({
      toolId: `permission:${event.requestId || event.toolUseId || event.toolName || 'tool'}`,
      status: event.behavior === 'allow' ? 'done' : 'error',
      label: t('Permission request'),
      context: String(event.toolName || 'tool'),
      detail: event.behavior === 'allow'
        ? t('You approved this tool request.')
        : t('You denied this tool request.'),
      payload: {
        eventType: event.type,
        toolName: event.toolName,
        requestId: event.requestId,
        behavior: event.behavior,
      },
    })
  }

  return null
}

export async function executeAiSkill({
  skillId = '',
  skill = null,
  contextBundle = {},
  config = {},
  apiKey = '',
  userInstruction = '',
  conversation = [],
  altalsSkills = [],
  attachments = [],
  referencedFiles = [],
  requestedTools = [],
  toolRuntime = {},
  onEvent,
  signal,
} = {}) {
  const resolvedSkill = skill || getAiSkillById(skillId, altalsSkills)
  if (!resolvedSkill) {
    throw new Error('AI skill is not available.')
  }
  if (resolvedSkill.kind === 'filesystem-skill' && !isAltalsManagedFilesystemSkill(resolvedSkill)) {
    throw new Error('AI skill is not available.')
  }

  const enabledToolIds = Array.isArray(config?.enabledTools) ? config.enabledTools : []
  const enabledToolSet = new Set(enabledToolIds)
  const promptSkill = {
    ...resolvedSkill,
    enabledToolIds,
  }
  let events = []
  const emitEvent = (event = {}) => {
    events = upsertEvent(events, event)
    if (typeof onEvent === 'function') {
      onEvent(event, events)
    }
  }

  let supportFiles = []
  if (resolvedSkill.kind === 'filesystem-skill' && enabledToolSet.has('load-skill-support-files')) {
    supportFiles = await loadSkillSupportingFiles(resolvedSkill)
  }

  const behaviorId = getAiSkillBehaviorId(resolvedSkill, skillId)
  const structured = requiresStructuredResponse(behaviorId)
  const systemPrompt = buildSystemPrompt(resolvedSkill, { structured })
  const userPrompt = buildUserPrompt({
    skill: promptSkill,
    contextBundle,
    userInstruction,
    conversation,
    altalsSkills,
    supportFiles,
    attachments,
    referencedFiles,
    requestedTools,
  })

  let content = ''
  let reasoning = ''
  let streamedContent = ''
  let streamedReasoning = ''
  try {
    const response = await runAiProviderRuntime({
      providerId: config.providerId || 'openai',
      config,
      apiKey,
      history: conversation,
      userMessage: userPrompt,
      systemMessage: systemPrompt,
      contextBundle,
      supportFiles,
      enabledToolIds,
      toolRuntime,
      onEvent: (runtimeEvent) => {
        if (runtimeEvent.type === 'chunk') {
          streamedContent += String(runtimeEvent.delta || '')
          onEvent?.(
            buildAssistantStreamEvent(
              'assistant-content',
              streamedContent,
              runtimeEvent.delta
            ),
            events
          )
          return
        }

        if (runtimeEvent.type === 'reasoning') {
          streamedReasoning += String(runtimeEvent.delta || '')
          onEvent?.(
            buildAssistantStreamEvent(
              'assistant-reasoning',
              streamedReasoning,
              runtimeEvent.delta
            ),
            events
          )
          return
        }

        if (isPassthroughRuntimeEvent(runtimeEvent)) {
          onEvent?.(runtimeEvent, events)
        }

        const mappedToolEvent = mapRuntimeEventToToolEvent(runtimeEvent)
        if (mappedToolEvent) {
          emitEvent(mappedToolEvent)
        }
      },
      signal,
    })
    content = response.content || streamedContent
    reasoning = response.reasoning || streamedReasoning

    for (const toolRound of Array.isArray(response.toolRounds) ? response.toolRounds : []) {
      for (const toolCall of Array.isArray(toolRound.toolCalls) ? toolRound.toolCalls : []) {
        emitEvent(buildToolEvent({
          toolId: `runtime:${toolCall.id || toolCall.name || 'tool'}`,
          status: toolCall.result?.isError ? 'error' : 'done',
          label: String(toolCall.name || 'tool'),
          detail: String(toolCall.result?.content || '').slice(0, 220),
        }))
      }
    }

  } catch (error) {
    throw error
  }

  const payload = extractJsonPayload(content) || {
    answer: content,
    rationale: reasoning,
  }

  const artifact = normalizeAiArtifact(behaviorId, payload, contextBundle, content)

  return {
    skill: resolvedSkill,
    behaviorId,
    supportFiles,
    events,
    content,
    payload,
    artifact,
  }
}
