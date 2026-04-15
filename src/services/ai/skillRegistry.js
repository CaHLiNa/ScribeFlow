import { isAiContextAvailable } from '../../domains/ai/aiContextRuntime.js'

export const AI_SKILL_DEFINITIONS = [
  {
    id: 'grounded-chat',
    titleKey: 'Grounded chat',
    descriptionKey: 'Ask the AI about the active workbench context without leaving the project.',
    requiredContext: ['document'],
  },
  {
    id: 'revise-with-citations',
    titleKey: 'Revise with citations',
    descriptionKey: 'Rewrite the selected passage using the current reference as grounding.',
    requiredContext: ['document', 'selection', 'reference'],
  },
  {
    id: 'draft-related-work',
    titleKey: 'Draft related work',
    descriptionKey:
      'Use the active draft and selected reference to shape a related-work paragraph.',
    requiredContext: ['document', 'reference'],
  },
  {
    id: 'summarize-selection',
    titleKey: 'Summarize selection',
    descriptionKey: 'Turn the active selection into a structured research note.',
    requiredContext: ['selection'],
  },
  {
    id: 'find-supporting-references',
    titleKey: 'Find supporting references',
    descriptionKey: 'Use the active passage to look for missing support and citations.',
    requiredContext: ['document', 'selection'],
  },
]

const REQUIRED_CONTEXT_LABELS = {
  document: 'active document',
  selection: 'selected text',
  reference: 'selected reference',
}

function getSkillTitle(skill = {}) {
  return String(skill.titleKey || skill.id || '').trim()
}

function getDocumentBlock(contextBundle = {}) {
  if (!contextBundle.document?.available) return '- Active document: unavailable'
  return `- Active document: ${contextBundle.document.filePath}`
}

function getSelectionBlock(contextBundle = {}) {
  if (!contextBundle.selection?.available) return '- Selected text: unavailable'
  return [
    '- Selected text:',
    '```text',
    contextBundle.selection.text,
    '```',
  ].join('\n')
}

function getReferenceBlock(contextBundle = {}) {
  if (!contextBundle.reference?.available) return '- Selected reference: unavailable'

  const parts = [
    `- Selected reference title: ${contextBundle.reference.title || 'Untitled reference'}`,
  ]
  if (contextBundle.reference.citationKey) {
    parts.push(`- Citation key: ${contextBundle.reference.citationKey}`)
  }
  if (contextBundle.reference.year) {
    parts.push(`- Year: ${contextBundle.reference.year}`)
  }
  if (contextBundle.reference.authorLine) {
    parts.push(`- Author line: ${contextBundle.reference.authorLine}`)
  }
  return parts.join('\n')
}

function buildMissingContextBlock(skill = {}, contextBundle = {}) {
  const requiredContext = Array.isArray(skill.requiredContext) ? skill.requiredContext : []
  const missing = requiredContext.filter((kind) => !isAiContextAvailable(kind, contextBundle))
  if (missing.length === 0) return ''

  return [
    `Skill: ${getSkillTitle(skill)}`,
    '',
    'This skill is not fully grounded yet.',
    'Missing context:',
    ...missing.map((kind) => `- ${REQUIRED_CONTEXT_LABELS[kind] || kind}`),
  ].join('\n')
}

const BRIEF_BUILDERS = {
  'grounded-chat': (contextBundle) =>
    [
      'Task: Answer the user in a grounded way using the currently active project context.',
      '',
      'Context:',
      getDocumentBlock(contextBundle),
      contextBundle.selection.available ? getSelectionBlock(contextBundle) : '- Selected text: unavailable',
      contextBundle.reference.available ? getReferenceBlock(contextBundle) : '- Selected reference: unavailable',
      '',
      'Requirements:',
      '- Stay close to the supplied project context.',
      '- Make uncertainty explicit instead of inventing support.',
      '- Keep the answer useful for a research workflow.',
    ].join('\n'),
  'revise-with-citations': (contextBundle) =>
    [
      'Task: Revise the selected passage so it reads like a tighter academic paragraph and stays grounded in the selected reference.',
      '',
      'Context:',
      getDocumentBlock(contextBundle),
      getSelectionBlock(contextBundle),
      getReferenceBlock(contextBundle),
      '',
      'Requirements:',
      '- Preserve the underlying claim unless the evidence looks weak.',
      '- If the selected reference is not sufficient support, say so explicitly.',
      '- Suggest where the citation should appear.',
      '',
      'Return:',
      '1. Revised paragraph',
      '2. Citation suggestion',
      '3. Short rationale',
    ].join('\n'),
  'draft-related-work': (contextBundle) =>
    [
      'Task: Draft a related-work paragraph grounded in the selected reference and the current draft context.',
      '',
      'Context:',
      getDocumentBlock(contextBundle),
      getReferenceBlock(contextBundle),
      contextBundle.selection.available
        ? getSelectionBlock(contextBundle)
        : '- Optional target passage: unavailable',
      '',
      'Requirements:',
      '- Use the selected reference as explicit grounding.',
      '- Keep the tone suitable for a research manuscript.',
      '- If the draft context is thin, make the assumptions explicit.',
      '',
      'Return:',
      '1. Related-work paragraph',
      '2. Suggested citation placement',
      '3. Any missing-context warning',
    ].join('\n'),
  'summarize-selection': (contextBundle) =>
    [
      'Task: Summarize the selected text into a structured research note.',
      '',
      'Context:',
      getDocumentBlock(contextBundle),
      getSelectionBlock(contextBundle),
      contextBundle.reference.available
        ? getReferenceBlock(contextBundle)
        : '- Linked reference: unavailable',
      '',
      'Return:',
      '1. One-sentence takeaway',
      '2. Three key points',
      '3. Any follow-up question worth checking',
    ].join('\n'),
  'find-supporting-references': (contextBundle) =>
    [
      'Task: Use the selected passage to identify what kind of supporting references are missing.',
      '',
      'Context:',
      getDocumentBlock(contextBundle),
      getSelectionBlock(contextBundle),
      contextBundle.reference.available
        ? getReferenceBlock(contextBundle)
        : '- Current selected reference: unavailable',
      '',
      'Requirements:',
      '- Focus on evidence gaps, not generic keyword expansion.',
      '- Point out whether the current selected reference is enough.',
      '',
      'Return:',
      '1. Missing-support diagnosis',
      '2. Reference types to look for',
      '3. Search query suggestions',
    ].join('\n'),
}

export function getAiSkillById(skillId = '') {
  return AI_SKILL_DEFINITIONS.find((skill) => skill.id === skillId) || null
}

export function buildPreparedAiBrief(skillId = '', contextBundle = {}) {
  const skill = getAiSkillById(skillId)
  if (!skill) return ''

  const missingContextBlock = buildMissingContextBlock(skill, contextBundle)
  if (missingContextBlock) return missingContextBlock

  const builder = BRIEF_BUILDERS[skill.id]
  return typeof builder === 'function' ? builder(contextBundle) : ''
}
