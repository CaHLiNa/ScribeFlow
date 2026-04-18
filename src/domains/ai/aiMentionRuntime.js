function normalizeSearch(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeSlug(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^[@#$\/]+/, '')
    .replace(/[^a-z0-9\u4e00-\u9fff._/-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

function basenamePath(path = '') {
  const normalized = String(path || '').trim()
  if (!normalized) return ''
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] || normalized
}

function relativeWorkspacePath(workspacePath = '', targetPath = '') {
  const root = String(workspacePath || '').replace(/\/+$/, '')
  const target = String(targetPath || '').trim()
  if (!root || !target.startsWith(root)) return target
  return target.slice(root.length).replace(/^\/+/, '')
}

export function detectAiComposerToken(prompt = '') {
  const normalized = String(prompt || '')
  const match = normalized.match(/(^|\s)([@#$\/])([^\s]*)$/u)
  if (!match) return null

  const tokenText = `${match[2]}${match[3]}`
  const tokenStart = normalized.length - tokenText.length
  return {
    prefix: match[2],
    query: String(match[3] || ''),
    normalizedQuery: normalizeSearch(match[3] || ''),
    tokenText,
    tokenStart,
  }
}

function buildFileSuggestion(entry = {}, workspacePath = '') {
  const relativePath = relativeWorkspacePath(workspacePath, entry.path)
  return {
    id: entry.path,
    kind: 'workspace-file',
    prefix: '@',
    groupKey: 'workspace-files',
    groupLabel: 'Workspace files',
    label: relativePath || entry.name || entry.path,
    description: entry.path,
    insertText: `@${relativePath || entry.path}`,
    path: entry.path,
    relativePath,
  }
}

function buildToolSuggestion(tool = {}) {
  const invocationName = String(tool.invocationName || '').trim()
  return {
    id: tool.id,
    kind: 'tool',
    prefix: '#',
    groupKey: tool.groupKey || 'tools',
    groupLabel: tool.groupLabel || 'Tools',
    label: tool.label,
    description: tool.description,
    insertText: `#${normalizeSlug(invocationName || tool.label || tool.id)}`,
    toolId: tool.id,
    sourceKind: tool.sourceKind || '',
    sourceLabel: tool.sourceLabel || '',
    invocationName,
  }
}

function scoreFileEntry(entry = {}, query = '', workspacePath = '') {
  const relativePath = relativeWorkspacePath(workspacePath, entry.path)
  const searchTarget = `${relativePath} ${entry.name || ''}`.toLowerCase()
  if (!query) return relativePath.split('/').length
  if (searchTarget === query) return 0
  if (searchTarget.startsWith(query)) return 1
  if (String(entry.name || '').toLowerCase().startsWith(query)) return 2
  if (searchTarget.includes(query)) return 3
  return Number.POSITIVE_INFINITY
}

export function getAiComposerSuggestions({
  prompt = '',
  workspacePath = '',
  files = [],
  tools = [],
  slashSuggestions = [],
  skillSuggestions = [],
} = {}) {
  const token = detectAiComposerToken(prompt)
  if (!token) return []

  if (token.prefix === '@') {
    return (Array.isArray(files) ? files : [])
      .filter((entry) => entry && entry.is_dir !== true && entry.path)
      .map((entry) => ({
        entry,
        score: scoreFileEntry(entry, token.normalizedQuery, workspacePath),
      }))
      .filter((entry) => Number.isFinite(entry.score))
      .sort((left, right) => {
        if (left.score !== right.score) return left.score - right.score
        return String(left.entry.path || '').localeCompare(String(right.entry.path || ''))
      })
      .slice(0, 8)
      .map(({ entry }) => buildFileSuggestion(entry, workspacePath))
  }

  if (token.prefix === '#') {
    const normalizedQuery = token.normalizedQuery
    return (Array.isArray(tools) ? tools : [])
      .filter((tool) => {
        const haystack = `${tool.id} ${tool.label} ${tool.description}`.toLowerCase()
        return !normalizedQuery || haystack.includes(normalizedQuery)
      })
      .slice(0, 8)
      .map((tool) => buildToolSuggestion(tool))
  }

  if (token.prefix === '/') {
    return (Array.isArray(slashSuggestions) ? slashSuggestions : []).filter((suggestion) => {
      return !token.normalizedQuery || String(suggestion.insertText || '').toLowerCase().includes(token.normalizedQuery)
    })
  }

  if (token.prefix === '$') {
    return (Array.isArray(skillSuggestions) ? skillSuggestions : []).filter((suggestion) => {
      return !token.normalizedQuery || String(suggestion.insertText || '').toLowerCase().includes(token.normalizedQuery)
    })
  }

  return []
}

export function applyAiComposerSuggestion(prompt = '', suggestion = null) {
  const token = detectAiComposerToken(prompt)
  if (!token || !suggestion?.insertText) return String(prompt || '')

  const normalized = String(prompt || '')
  return `${normalized.slice(0, token.tokenStart)}${suggestion.insertText} `
}

export function parseAiPromptResourceMentions(prompt = '') {
  const normalized = String(prompt || '')
  const fileMentions = [...normalized.matchAll(/(^|\s)@([^\s]+)/gu)]
    .map((match) => String(match[2] || '').trim())
    .filter(Boolean)
  const toolMentions = [...normalized.matchAll(/(^|\s)#([^\s]+)/gu)]
    .map((match) => normalizeSlug(match[2] || ''))
    .filter(Boolean)

  return {
    fileMentions: [...new Set(fileMentions)],
    toolMentions: [...new Set(toolMentions)],
  }
}

export function resolveMentionedWorkspaceFiles(fileMentions = [], files = [], workspacePath = '') {
  const normalizedMentions = (Array.isArray(fileMentions) ? fileMentions : [])
    .map((mention) => String(mention || '').trim())
    .filter(Boolean)
  const entries = Array.isArray(files) ? files : []

  return normalizedMentions
    .map((mention) => {
      const normalizedMention = normalizeSearch(mention)
      return entries.find((entry) => {
        if (!entry?.path || entry.is_dir === true) return false
        const relativePath = relativeWorkspacePath(workspacePath, entry.path)
        return normalizeSearch(relativePath) === normalizedMention
          || normalizeSearch(entry.path) === normalizedMention
          || normalizeSearch(entry.name) === normalizedMention
          || normalizeSearch(basenamePath(relativePath)) === normalizedMention
      }) || null
    })
    .filter(Boolean)
}
