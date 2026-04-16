import { isAiContextAvailable } from '../../domains/ai/aiContextRuntime.js'
import { t } from '../../i18n/index.js'
import { isAltalsManagedFilesystemSkill } from './skillDiscovery.js'

export const AI_BUILT_IN_ACTION_DEFINITIONS = [
  {
    id: 'grounded-chat',
    kind: 'built-in-action',
    titleKey: 'Grounded chat',
    descriptionKey: 'Ask the AI about the active workbench context without leaving the project.',
    requiredContext: ['workspace'],
  },
]

export const AI_SKILL_DEFINITIONS = AI_BUILT_IN_ACTION_DEFINITIONS

const REQUIRED_CONTEXT_LABELS = {
  document: 'active document',
  selection: 'selected text',
  reference: 'selected reference',
}

function getDisplayTitle(entry = {}) {
  return String(entry.titleKey || entry.name || entry.id || '').trim()
}

function getDocumentBlock(contextBundle = {}) {
  if (!contextBundle.document?.available) return `- ${t('Active document')}: ${t('Unavailable')}`
  return `- ${t('Active document')}: ${contextBundle.document.filePath}`
}

function getWorkspaceBlock(contextBundle = {}) {
  if (!contextBundle.workspace?.available) return `- ${t('Folder')}: ${t('Unavailable')}`
  return `- ${t('Folder')}: ${contextBundle.workspace.path}`
}

function getSelectionBlock(contextBundle = {}) {
  if (!contextBundle.selection?.available) return `- ${t('Selected text')}: ${t('Unavailable')}`
  return [
    `- ${t('Selected text')}:`,
    '```text',
    contextBundle.selection.text,
    '```',
  ].join('\n')
}

function getReferenceBlock(contextBundle = {}) {
  if (!contextBundle.reference?.available) return `- ${t('Selected reference')}: ${t('Unavailable')}`

  const parts = [
    `- ${t('Selected reference title')}: ${contextBundle.reference.title || t('Untitled reference')}`,
  ]
  if (contextBundle.reference.citationKey) {
    parts.push(`- ${t('Citation key')}: ${contextBundle.reference.citationKey}`)
  }
  if (contextBundle.reference.year) {
    parts.push(`- ${t('Year')}: ${contextBundle.reference.year}`)
  }
  if (contextBundle.reference.authorLine) {
    parts.push(`- ${t('Author line')}: ${contextBundle.reference.authorLine}`)
  }
  return parts.join('\n')
}

function buildMissingContextBlock(entry = {}, contextBundle = {}) {
  const requiredContext = Array.isArray(entry.requiredContext) ? entry.requiredContext : []
  const missing = requiredContext.filter((kind) => !isAiContextAvailable(kind, contextBundle))
  if (missing.length === 0) return ''

  return [
    `${t('Action')}: ${getDisplayTitle(entry)}`,
    '',
    t('This action is not fully grounded yet.'),
    t('Missing context:'),
    ...missing.map((kind) => `- ${t(REQUIRED_CONTEXT_LABELS[kind] || kind)}`),
  ].join('\n')
}

const BUILT_IN_BRIEF_BUILDERS = {
  'grounded-chat': (contextBundle) =>
    [
      `${t('Task')}: ${t('Answer the user in a grounded way using the currently active project context.')}`,
      '',
      `${t('Context')}:`,
      getWorkspaceBlock(contextBundle),
      getDocumentBlock(contextBundle),
      contextBundle.selection.available ? getSelectionBlock(contextBundle) : `- ${t('Selected text')}: ${t('Unavailable')}`,
      contextBundle.reference.available ? getReferenceBlock(contextBundle) : `- ${t('Selected reference')}: ${t('Unavailable')}`,
      '',
      `${t('Requirements')}:`,
      `- ${t('Stay close to the supplied project context.')}`,
      `- ${t('Make uncertainty explicit instead of inventing support.')}`,
      `- ${t('Keep the answer useful for a research workflow.')}`,
    ].join('\n'),
}

export function getAiSkillBehaviorId(entry = null, fallbackSkillId = '') {
  if (!entry) return String(fallbackSkillId || '').trim()
  if (entry.kind === 'filesystem-skill') {
    return String(entry.slug || entry.name || fallbackSkillId || '').trim()
  }
  return String(entry.id || fallbackSkillId || '').trim()
}

function buildFilesystemSkillBrief(skill = {}, contextBundle = {}) {
  return [
    `${t('Skill')}: ${skill.name || skill.slug || t('Unnamed skill')}`,
    `${t('Type')}: ${t('Filesystem skill')}`,
    `${t('Source path')}: ${skill.skillFilePath || skill.directoryPath || t('unknown')}`,
    `${t('Scope')}: ${skill.scope === 'user' ? t('User scope') : t('Workspace scope')}`,
    skill.supportingFiles?.length
      ? `${t('Supporting files in skill directory')}: ${skill.supportingFiles.join(', ')}`
      : `${t('Supporting files in skill directory')}: ${t('None discovered')}`,
    '',
    `${t('Grounded project context')}:`,
    getWorkspaceBlock(contextBundle),
    getDocumentBlock(contextBundle),
    getSelectionBlock(contextBundle),
    getReferenceBlock(contextBundle),
    '',
    `${t('Skill instructions (from SKILL.md)')}:`,
    '```md',
    String(skill.markdown || '').trim(),
    '```',
    '',
    `${t('Requirements')}:`,
    `- ${t('Follow the skill instructions as the primary workflow.')}`,
    `- ${t('Stay grounded in the supplied Altals project context.')}`,
    `- ${t('If the skill expects tools or files not yet available, say so explicitly instead of inventing them.')}`,
  ].join('\n')
}

export function getBuiltInAiActionById(actionId = '') {
  return AI_BUILT_IN_ACTION_DEFINITIONS.find((action) => action.id === actionId) || null
}

export function getAiSkillById(skillId = '', altalsSkills = []) {
  return (
    getBuiltInAiActionById(skillId)
    || (Array.isArray(altalsSkills)
      ? altalsSkills.find((skill) =>
        skill.id === skillId && isAltalsManagedFilesystemSkill(skill)
      ) || null
      : null)
  )
}

export function buildPreparedAiBrief(skillOrId = '', contextBundle = {}, options = {}) {
  const altalsSkills = Array.isArray(options.altalsSkills) ? options.altalsSkills : []
  const entry = typeof skillOrId === 'string'
    ? getAiSkillById(skillOrId, altalsSkills)
    : skillOrId

  if (!entry) return ''

  if (entry.kind === 'filesystem-skill') {
    if (!isAltalsManagedFilesystemSkill(entry)) return ''
    return buildFilesystemSkillBrief(entry, contextBundle)
  }

  const missingContextBlock = buildMissingContextBlock(entry, contextBundle)
  if (missingContextBlock) return missingContextBlock

  const builder = BUILT_IN_BRIEF_BUILDERS[entry.id]
  return typeof builder === 'function' ? builder(contextBundle) : ''
}
