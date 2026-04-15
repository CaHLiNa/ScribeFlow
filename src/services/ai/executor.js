import { extractJsonPayload, normalizeAiArtifact } from '../../domains/ai/aiArtifactRuntime.js'
import { buildPreparedAiBrief, getAiSkillById } from './skillRegistry.js'
import { requestOpenAiCompatibleCompletion } from './openAiCompatible.js'

function buildSystemPrompt(skill = {}) {
  return [
    'You are Altals AI, a local-first academic research assistant embedded in a writing workbench.',
    'You must stay grounded in the supplied project context and never invent evidence or citations.',
    'Return valid JSON only.',
    `Current skill: ${skill.id || 'unknown'}.`,
  ].join(' ')
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

function buildUserPrompt(skill = {}, contextBundle = {}, userInstruction = '', conversation = []) {
  const brief = buildPreparedAiBrief(skill.id, contextBundle)
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
    historyBlock,
    userInstruction
      ? `Additional user instruction:\n${String(userInstruction || '').trim()}`
      : 'Additional user instruction:\nNone.',
    '',
    buildResponseContract(skill.id, contextBundle),
  ].join('\n')
}

export async function executeAiSkill({
  skillId = '',
  contextBundle = {},
  config = {},
  apiKey = '',
  userInstruction = '',
  conversation = [],
  signal,
} = {}) {
  const skill = getAiSkillById(skillId)
  if (!skill) {
    throw new Error('AI skill is not available.')
  }

  const messages = [
    {
      role: 'system',
      content: buildSystemPrompt(skill),
    },
    {
      role: 'user',
      content: buildUserPrompt(skill, contextBundle, userInstruction, conversation),
    },
  ]

  const { content } = await requestOpenAiCompatibleCompletion(config, apiKey, messages, {
    signal,
  })

  const payload = extractJsonPayload(content) || {
    answer: content,
  }

  const artifact = normalizeAiArtifact(skill.id, payload, contextBundle, content)
  return {
    skill,
    content,
    payload,
    artifact,
  }
}
