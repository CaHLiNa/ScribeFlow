export const AI_ANTHROPIC_SDK_TOOL_DEFINITIONS = Object.freeze([
  { id: 'Read', label: 'Read', titleKey: 'Read files', descriptionKey: 'Read files from the current workspace.' },
  { id: 'Glob', label: 'Glob', titleKey: 'Glob search', descriptionKey: 'Search workspace files by glob patterns.' },
  { id: 'Grep', label: 'Grep', titleKey: 'Text search', descriptionKey: 'Search text inside workspace files.' },
  { id: 'LS', label: 'LS', titleKey: 'List directories', descriptionKey: 'List folders and files in the current workspace.' },
  { id: 'WebFetch', label: 'WebFetch', titleKey: 'Web fetch', descriptionKey: 'Fetch remote web content when the model asks for it.' },
  { id: 'TodoWrite', label: 'TodoWrite', titleKey: 'TodoWrite', descriptionKey: 'Create or update Claude task lists during a session.' },
  { id: 'Edit', label: 'Edit', titleKey: 'Edit files', descriptionKey: 'Edit a single file directly from the SDK runtime.' },
  { id: 'MultiEdit', label: 'MultiEdit', titleKey: 'MultiEdit', descriptionKey: 'Apply multiple file edits in one tool run.' },
  { id: 'Write', label: 'Write', titleKey: 'Write files', descriptionKey: 'Create or overwrite files from the SDK runtime.' },
  { id: 'Bash', label: 'Bash', titleKey: 'Run shell commands', descriptionKey: 'Run shell commands from the SDK runtime.' },
])

export const AI_ANTHROPIC_SDK_POLICY_OPTIONS = Object.freeze([
  { value: 'allow', labelKey: 'Allow' },
  { value: 'ask', labelKey: 'Ask' },
  { value: 'deny', labelKey: 'Deny' },
])

export const AI_ANTHROPIC_SDK_RUNTIME_OPTIONS = Object.freeze([
  { value: 'sdk', labelKey: 'Claude Agent SDK' },
  { value: 'http', labelKey: 'Anthropic HTTP' },
])

export const AI_ANTHROPIC_SDK_APPROVAL_OPTIONS = Object.freeze([
  { value: 'per-tool', labelKey: 'Per-tool approval' },
  { value: 'plan', labelKey: 'Plan-only mode' },
])

const DEFAULT_TOOL_POLICIES = Object.freeze({
  Read: 'allow',
  Glob: 'allow',
  Grep: 'allow',
  LS: 'allow',
  WebFetch: 'ask',
  TodoWrite: 'ask',
  Edit: 'ask',
  MultiEdit: 'ask',
  Write: 'ask',
  Bash: 'deny',
})

function normalizePolicyValue(value = 'ask') {
  const normalized = String(value || '').trim()
  return ['allow', 'ask', 'deny'].includes(normalized) ? normalized : 'ask'
}

export function createDefaultAnthropicSdkConfig() {
  return {
    runtimeMode: 'sdk',
    approvalMode: 'per-tool',
    autoAllowAll: false,
    toolPolicies: { ...DEFAULT_TOOL_POLICIES },
  }
}

export function normalizeAnthropicSdkToolPolicies(value = null) {
  const next = { ...DEFAULT_TOOL_POLICIES }
  if (!value || typeof value !== 'object') {
    return next
  }

  for (const tool of AI_ANTHROPIC_SDK_TOOL_DEFINITIONS) {
    next[tool.id] = normalizePolicyValue(value?.[tool.id] || next[tool.id])
  }
  return next
}

export function normalizeAnthropicSdkConfig(value = null) {
  const defaults = createDefaultAnthropicSdkConfig()
  const runtimeMode = String(value?.runtimeMode || defaults.runtimeMode).trim()
  const approvalMode = String(value?.approvalMode || defaults.approvalMode).trim()

  return {
    runtimeMode: runtimeMode === 'http' ? 'http' : 'sdk',
    approvalMode: approvalMode === 'plan' ? 'plan' : 'per-tool',
    autoAllowAll: value?.autoAllowAll === true,
    toolPolicies: normalizeAnthropicSdkToolPolicies(value?.toolPolicies),
  }
}

export function resolveAnthropicSdkAvailableTools(config = null) {
  const normalized = normalizeAnthropicSdkConfig(config)
  return AI_ANTHROPIC_SDK_TOOL_DEFINITIONS
    .map((tool) => tool.id)
    .filter((toolId) => normalized.toolPolicies[toolId] !== 'deny')
}

export function resolveAnthropicSdkAutoAllowedTools(config = null) {
  const normalized = normalizeAnthropicSdkConfig(config)
  if (normalized.autoAllowAll) {
    return resolveAnthropicSdkAvailableTools(normalized)
  }
  return AI_ANTHROPIC_SDK_TOOL_DEFINITIONS
    .map((tool) => tool.id)
    .filter((toolId) => normalized.toolPolicies[toolId] === 'allow')
}

export function resolveAnthropicSdkToolPolicy(config = null, toolName = '') {
  const normalized = normalizeAnthropicSdkConfig(config)
  const normalizedToolName = String(toolName || '').trim()
  return normalized.toolPolicies[normalizedToolName] || 'ask'
}
