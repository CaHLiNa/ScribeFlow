import { isAltalsManagedFilesystemSkill } from './skillDiscovery.js'

function normalizeInvocationName(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^[/$]+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeSearchText(value = '') {
  return String(value || '').trim().toLowerCase()
}

function tokenizePrompt(value = '') {
  return normalizeSearchText(value)
    .split(/[^a-z0-9\u4e00-\u9fff]+/u)
    .filter((token) => token.length >= 2)
}

function getInvocationDraft(prompt = '') {
  const normalized = String(prompt || '')
  const match = normalized.match(/^\s*([/$])([^\s]*)/)
  if (!match) return null

  return {
    prefix: match[1],
    partialName: normalizeInvocationName(match[2]),
    rawToken: String(match[2] || ''),
    prompt: normalized,
  }
}

function buildSkillSlug(skill = {}) {
  return normalizeInvocationName(skill.slug || skill.name || skill.directoryName || skill.id)
}

function buildActionSuggestion(action = {}, recentSet = new Set()) {
  return {
    id: action.id,
    kind: 'built-in-action',
    prefix: '/',
    groupKey: recentSet.has(action.id) ? 'recent-actions' : 'shell-actions',
    groupLabel: recentSet.has(action.id) ? 'Recent actions' : 'Shell actions',
    insertText: `/${action.id} `,
    title: action.titleKey || action.id,
    description: action.descriptionKey || '',
  }
}

function buildFilesystemSuggestion(skill = {}, prefix = '/', recentSet = new Set()) {
  const slug = buildSkillSlug(skill)
  return {
    id: skill.id,
    kind: 'filesystem-skill',
    prefix,
    groupKey: recentSet.has(skill.id) ? 'recent-skills' : 'skills',
    groupLabel: recentSet.has(skill.id) ? 'Recent skills' : 'Skills',
    insertText: `${prefix}${slug} `,
    title: skill.name || skill.slug || skill.directoryName || skill.id,
    description: skill.description || '',
  }
}

function matchBuiltInAction(name = '', actions = []) {
  return (Array.isArray(actions) ? actions : []).find((action) =>
    normalizeInvocationName(action.id) === name
  ) || null
}

function matchFilesystemSkill(name = '', skills = []) {
  return (Array.isArray(skills) ? skills : []).find((skill) =>
    buildSkillSlug(skill) === name && isAltalsManagedFilesystemSkill(skill)
  ) || null
}

function explicitSkillRequirements(skill = {}) {
  if (Array.isArray(skill.requiredContext) && skill.requiredContext.length > 0) {
    return skill.requiredContext
  }

  const slug = buildSkillSlug(skill)
  if (slug.includes('revise-with-citations')) return ['workspace', 'selection', 'reference']
  if (slug.includes('summarize-selection')) return ['workspace', 'selection']
  if (slug.includes('draft-related-work')) return ['workspace', 'document', 'reference']
  if (slug.includes('find-supporting-references')) return ['workspace', 'selection']
  return ['workspace']
}

function hasContext(contextBundle = {}, requiredContext = []) {
  return (Array.isArray(requiredContext) ? requiredContext : []).every(
    (kind) => contextBundle?.[kind]?.available === true
  )
}

function scorePromptAgainstKeywords(prompt = '', keywords = []) {
  const normalizedPrompt = normalizeSearchText(prompt)
  return (Array.isArray(keywords) ? keywords : []).reduce(
    (score, keyword) => score + (normalizedPrompt.includes(keyword) ? 18 : 0),
    0
  )
}

function keywordBoostForSkill(skill = {}, prompt = '') {
  const slug = buildSkillSlug(skill)

  if (slug.includes('revise-with-citations')) {
    return scorePromptAgainstKeywords(prompt, [
      'revise',
      'rewrite',
      'tighten',
      'polish',
      'citation',
      'cite',
      '改写',
      '润色',
      '引用',
      '补引用',
    ])
  }

  if (slug.includes('summarize-selection')) {
    return scorePromptAgainstKeywords(prompt, [
      'summarize',
      'summary',
      'note',
      'takeaway',
      '总结',
      '摘要',
      '笔记',
      '提炼',
    ])
  }

  if (slug.includes('draft-related-work')) {
    return scorePromptAgainstKeywords(prompt, [
      'related work',
      'related-work',
      'literature review',
      'compare',
      'position',
      '相关工作',
      '综述',
      '对比',
    ])
  }

  if (slug.includes('find-supporting-references')) {
    return scorePromptAgainstKeywords(prompt, [
      'support',
      'evidence',
      'missing citation',
      'need citation',
      'reference gap',
      '支撑',
      '证据',
      '缺引用',
      '补文献',
    ])
  }

  return 0
}

function scoreSkillOverlap(skill = {}, promptTokens = []) {
  const haystack = tokenizePrompt([
    skill.id,
    skill.name,
    skill.slug,
    skill.description,
  ].filter(Boolean).join(' '))
  if (!haystack.length || !promptTokens.length) return 0

  const haystackSet = new Set(haystack)
  let score = 0
  for (const token of promptTokens) {
    if (haystackSet.has(token)) score += 5
  }
  return score
}

export function parseAiInvocationInput(input = '') {
  const normalized = String(input || '').trim()
  if (!normalized) return null

  const match = normalized.match(/^([/$])([^\s]+)(?:\s+([\s\S]*))?$/)
  if (!match) return null

  return {
    prefix: match[1],
    name: normalizeInvocationName(match[2]),
    rawName: String(match[2] || ''),
    remainder: String(match[3] || '').trim(),
  }
}

export function inferAiSkillFromPrompt({
  builtInActions = [],
  fallbackSkill = null,
} = {}) {
  return (
    matchBuiltInAction('grounded-chat', builtInActions)
    || fallbackSkill
    || null
  )
}

export function getAiInvocationSuggestions({
  prompt = '',
  builtInActions = [],
  altalsSkills = [],
  recentSkillIds = [],
} = {}) {
  const draft = getInvocationDraft(prompt)
  if (!draft) return []
  const recentSet = new Set(
    (Array.isArray(recentSkillIds) ? recentSkillIds : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  )

  if (draft.prefix === '/') {
    const skillSuggestions = (Array.isArray(altalsSkills) ? altalsSkills : [])
      .filter((skill) => isAltalsManagedFilesystemSkill(skill))
      .filter((skill) => buildSkillSlug(skill).includes(draft.partialName))
      .map((skill) => buildFilesystemSuggestion(skill, '/', recentSet))
    const actionSuggestions = (Array.isArray(builtInActions) ? builtInActions : [])
      .filter((action) => normalizeInvocationName(action.id).includes(draft.partialName))
      .map((action) => buildActionSuggestion(action, recentSet))
    return [...skillSuggestions, ...actionSuggestions]
  }

  if (draft.prefix === '$') {
    return (Array.isArray(altalsSkills) ? altalsSkills : [])
      .filter((skill) => isAltalsManagedFilesystemSkill(skill))
      .filter((skill) => buildSkillSlug(skill).includes(draft.partialName))
      .map((skill) => buildFilesystemSuggestion(skill, '$', recentSet))
  }

  return []
}

export function applyAiInvocationSuggestion(prompt = '', suggestion = null) {
  const normalizedPrompt = String(prompt || '')
  if (!suggestion?.insertText) return normalizedPrompt

  const match = normalizedPrompt.match(/^(\s*)([/$][^\s]*)([\s\S]*)$/)
  if (!match) return String(suggestion.insertText || '')

  const leading = String(match[1] || '')
  const remainder = String(match[3] || '').replace(/^\s*/, '')
  return `${leading}${suggestion.insertText}${remainder}`.trimEnd()
}

export function resolveAiInvocation({
  prompt = '',
  activeSkill = null,
  builtInActions = [],
  altalsSkills = [],
  contextBundle = {},
} = {}) {
  const parsed = parseAiInvocationInput(prompt)
  if (!parsed) {
    return {
      resolvedSkill: inferAiSkillFromPrompt({
        prompt,
        builtInActions,
        altalsSkills,
        contextBundle,
        fallbackSkill: activeSkill,
      }),
      userInstruction: String(prompt || '').trim(),
      invocation: null,
    }
  }

  if (parsed.prefix === '/') {
    const skill = matchFilesystemSkill(parsed.name, altalsSkills)
    if (skill) {
      return {
        resolvedSkill: skill,
        userInstruction: parsed.remainder,
        invocation: parsed,
      }
    }

    const action = matchBuiltInAction(parsed.name, builtInActions)
    if (action) {
      return {
        resolvedSkill: action,
        userInstruction: parsed.remainder,
        invocation: parsed,
      }
    }
  }

  if (parsed.prefix === '$') {
    const skill = matchFilesystemSkill(parsed.name, altalsSkills)
    if (skill) {
      return {
        resolvedSkill: skill,
        userInstruction: parsed.remainder,
        invocation: parsed,
      }
    }
  }

  return {
    resolvedSkill: inferAiSkillFromPrompt({
      prompt,
      builtInActions,
      altalsSkills,
      contextBundle,
      fallbackSkill: activeSkill,
    }),
    userInstruction: String(prompt || '').trim(),
    invocation: null,
  }
}
