import { buildAgentContextSnapshot, getAiSkillBehaviorId } from './skillRegistry.js'
import { isDefaultAgentActionId } from './builtInActions.js'
import { buildSkillSupportPromptBlock } from './skillSupportFiles.js'
import { isAltalsManagedFilesystemSkill } from './skillDiscovery.js'
import { buildAiToolPromptBlock, resolveEnabledAiTools } from './toolRegistry.js'

function buildResponseContract(behaviorId = '') {
  if (isDefaultAgentActionId(behaviorId)) {
    return [
      'Return JSON with this shape:',
      '{',
      '  "answer": "direct answer for the user",',
      '  "rationale": "brief note about which workspace context supported the answer"',
      '}',
    ].join('\n')
  }

  if (behaviorId === 'revise-with-citations') {
    return [
      'Return JSON with this shape:',
      '{',
      '  "replacement_text": "the revised paragraph only",',
      '  "citation_suggestion": "where the citation should appear",',
      '  "rationale": "why this revision follows from the supplied context"',
      '}',
    ].join('\n')
  }

  if (behaviorId === 'draft-related-work') {
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

  if (behaviorId === 'summarize-selection') {
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

  if (behaviorId === 'find-supporting-references') {
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
    '  "answer": "useful answer",',
    '  "rationale": "brief support note"',
    '}',
  ].join('\n')
}

export function requiresStructuredAgentResponse({ behaviorId = '', runtimeIntent = 'chat' } = {}) {
  if (runtimeIntent === 'agent' && isDefaultAgentActionId(behaviorId)) {
    return false
  }

  return !isDefaultAgentActionId(behaviorId)
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
        return [
          summary,
          '  Non-text attachment attached in the desktop app. Use metadata only unless more context is requested.',
        ]
      }

      if (attachment.readError) {
        return [summary, `  Failed to read content: ${attachment.readError}`]
      }

      const content = String(attachment.content || '').trim()
      if (!content) {
        return [summary, '  No inline text preview available.']
      }

      return [summary, '```text', content, '```']
    }),
  ].join('\n')
}

function buildRequestedToolsBlock(requestedTools = []) {
  const entries = (Array.isArray(requestedTools) ? requestedTools : [])
    .map((tool) => String(tool || '').trim())
    .filter(Boolean)
  if (entries.length === 0) return ''

  return ['User-mentioned tools:', ...entries.map((tool) => `- ${tool}`)].join('\n')
}

function buildConversationBlock(conversation = []) {
  if (!Array.isArray(conversation) || conversation.length === 0) return ''

  return [
    'Recent conversation:',
    ...conversation.map((message) => `${message.role.toUpperCase()}: ${message.content}`),
  ].join('\n')
}

export function buildWorkspaceContextPromptBlock(contextBundle = {}) {
  const workspacePath = String(contextBundle?.workspace?.path || '').trim()
  const documentPath = String(contextBundle?.document?.filePath || '').trim()
  const selectionText = String(
    contextBundle?.selection?.preview || contextBundle?.selection?.text || ''
  ).trim()
  const referenceTitle = String(contextBundle?.reference?.title || '').trim()
  const referenceKey = String(contextBundle?.reference?.citationKey || '').trim()

  return [
    'Workspace context:',
    `- Folder: ${workspacePath || 'Unavailable'}`,
    `- Active document: ${documentPath || 'Unavailable'}`,
    `- Selection: ${selectionText || 'Unavailable'}`,
    `- Reference: ${[referenceKey, referenceTitle].filter(Boolean).join(' · ') || 'Unavailable'}`,
  ].join('\n')
}

function buildAvailableSkillsBlock(altalsSkills = []) {
  const entries = (Array.isArray(altalsSkills) ? altalsSkills : [])
    .filter((skill) => isAltalsManagedFilesystemSkill(skill))
    .map((skill) => ({
      name: String(skill.name || skill.slug || skill.directoryName || skill.id || '').trim(),
      description: String(skill.description || '').trim(),
      scope: String(skill.scope || '').trim(),
    }))
    .filter((skill) => skill.name)

  if (entries.length === 0) {
    return ['Available filesystem skills:', '- None discovered.'].join('\n')
  }

  return [
    'Available filesystem skills:',
    ...entries.map((skill) =>
      `- ${skill.name}${skill.scope ? ` [${skill.scope}]` : ''}${
        skill.description ? `: ${skill.description}` : ''
      }`
    ),
  ].join('\n')
}

function buildAvailableToolsBlock(enabledToolIds = []) {
  return buildAiToolPromptBlock(resolveEnabledAiTools(enabledToolIds))
}

function buildAgentModeUserPrompt({
  userInstruction = '',
  conversation = [],
  contextBundle = {},
  altalsSkills = [],
  enabledToolIds = [],
  referencedFiles = [],
  attachments = [],
  requestedTools = [],
} = {}) {
  const conversationBlock = buildConversationBlock(conversation)
  const availableSkillsBlock = buildAvailableSkillsBlock(altalsSkills)
  const availableToolsBlock = buildAvailableToolsBlock(enabledToolIds)
  const referencedFilesBlock = buildReferencedFilesBlock(referencedFiles)
  const attachmentBlock = buildAttachmentBlock(attachments)
  const requestedToolsBlock = buildRequestedToolsBlock(requestedTools)

  return [
    'Current task:',
    String(userInstruction || '').trim() ||
      'Continue the task using the available workspace context.',
    '',
    buildWorkspaceContextPromptBlock(contextBundle),
    `\n${availableSkillsBlock}`,
    `\n${availableToolsBlock}`,
    referencedFilesBlock ? `\n${referencedFilesBlock}` : '',
    attachmentBlock ? `\n${attachmentBlock}` : '',
    requestedToolsBlock ? `\n${requestedToolsBlock}` : '',
    conversationBlock ? `\n${conversationBlock}` : '',
  ].join('\n')
}

function buildSkillModeUserPrompt({
  skill = {},
  contextBundle = {},
  userInstruction = '',
  conversation = [],
  altalsSkills = [],
  supportFiles = [],
  attachments = [],
  referencedFiles = [],
  requestedTools = [],
  enabledToolIds = [],
  behaviorId = '',
  structured = false,
} = {}) {
  const contextSnapshot = buildAgentContextSnapshot(skill, contextBundle, { altalsSkills })
  const supportFileBlock = buildSkillSupportPromptBlock(supportFiles)
  const availableToolsBlock = buildAvailableToolsBlock(enabledToolIds)
  const referencedFilesBlock = buildReferencedFilesBlock(referencedFiles)
  const attachmentBlock = buildAttachmentBlock(attachments)
  const requestedToolsBlock = buildRequestedToolsBlock(requestedTools)
  const conversationBlock = buildConversationBlock(conversation)

  return [
    contextSnapshot,
    '',
    supportFileBlock,
    `\n${availableToolsBlock}`,
    referencedFilesBlock ? `\n${referencedFilesBlock}` : '',
    attachmentBlock ? `\n${attachmentBlock}` : '',
    requestedToolsBlock ? `\n${requestedToolsBlock}` : '',
    conversationBlock ? `\n${conversationBlock}` : '',
    '',
    userInstruction
      ? `Additional user instruction:\n${String(userInstruction || '').trim()}`
      : 'Additional user instruction:\nNone.',
    ...(structured ? ['', buildResponseContract(behaviorId)] : []),
  ].join('\n')
}

export function buildAgentSystemPrompt({
  skill = {},
  runtimeIntent = 'chat',
  behaviorId = '',
  structured = false,
} = {}) {
  const resolvedBehaviorId = String(behaviorId || getAiSkillBehaviorId(skill)).trim()
  const lines = [
    runtimeIntent === 'agent'
      ? 'You are Altals Agent, a local-first workspace agent embedded in a desktop research and coding workbench.'
      : isDefaultAgentActionId(resolvedBehaviorId)
        ? 'You are Altals Agent, a local-first workspace assistant embedded in a desktop research and coding workbench.'
        : 'You are Altals AI, a local-first assistant embedded in a desktop research and coding workbench.',
    runtimeIntent === 'agent'
      ? 'Operate directly on the current workspace. Use available context, tools, and prior conversation to continue the task. Do not ask the user to choose an instruction pack unless genuinely blocked.'
      : isDefaultAgentActionId(resolvedBehaviorId)
        ? 'Answer directly using the supplied workspace context. Do not invent file contents, evidence, or citations.'
        : 'Use the supplied workspace context carefully and do not invent file contents, evidence, or citations.',
    'Filesystem skills are provided as an explicit catalog in the prompt. Do not infer available skills by searching workspace filenames.',
    'If the request involves creating, writing, editing, or opening workspace files and matching tools are listed as available, call those tools instead of claiming the capability is unavailable.',
    `Current entry: ${resolvedBehaviorId || skill.id || 'unknown'}.`,
  ]

  if (structured) {
    lines.push('Return valid JSON only.')
  }

  return lines.join(' ')
}

export function buildAgentUserPrompt({
  skill = {},
  contextBundle = {},
  userInstruction = '',
  conversation = [],
  altalsSkills = [],
  supportFiles = [],
  attachments = [],
  referencedFiles = [],
  requestedTools = [],
  enabledToolIds = [],
  runtimeIntent = 'chat',
} = {}) {
  const behaviorId = getAiSkillBehaviorId(skill)
  const structured = requiresStructuredAgentResponse({
    behaviorId,
    runtimeIntent,
  })

  if (runtimeIntent === 'agent' && isDefaultAgentActionId(behaviorId)) {
    return buildAgentModeUserPrompt({
      userInstruction,
      conversation,
      contextBundle,
      altalsSkills,
      enabledToolIds,
      referencedFiles,
      attachments,
      requestedTools,
    })
  }

  return buildSkillModeUserPrompt({
    skill,
    contextBundle,
    userInstruction,
    conversation,
    altalsSkills,
    supportFiles,
    attachments,
    referencedFiles,
    requestedTools,
    enabledToolIds,
    behaviorId,
    structured,
  })
}
