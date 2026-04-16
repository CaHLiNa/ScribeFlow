export const AI_TOOL_DEFINITIONS = Object.freeze([
  {
    id: 'read-active-document',
    label: 'read_active_document',
    labelKey: 'Read active document',
    description: 'Read the current open draft as grounded project context.',
    descriptionKey: 'Read the current open draft as grounded project context.',
  },
  {
    id: 'read-editor-selection',
    label: 'read_editor_selection',
    labelKey: 'Read editor selection',
    description: 'Read the current text selection from the active editor.',
    descriptionKey: 'Read the current text selection from the active editor.',
  },
  {
    id: 'read-selected-reference',
    label: 'read_selected_reference',
    labelKey: 'Read selected reference',
    description: 'Read the currently selected reference metadata and citation identity.',
    descriptionKey: 'Read the currently selected reference metadata and citation identity.',
  },
  {
    id: 'apply-document-patch',
    label: 'apply_document_patch',
    labelKey: 'Apply document patch',
    description: 'Write a replacement patch back into the active draft selection.',
    descriptionKey: 'Write a replacement patch back into the active draft selection.',
  },
  {
    id: 'open-note-draft',
    label: 'open_note_draft',
    labelKey: 'Open note draft',
    description: 'Create and open a markdown draft from AI output.',
    descriptionKey: 'Create and open a markdown draft from AI output.',
  },
  {
    id: 'load-skill-support-files',
    label: 'load_skill_support_files',
    labelKey: 'Load skill support files',
    description: 'Load text support files that live alongside a discovered SKILL.md package.',
    descriptionKey: 'Load text support files that live alongside a discovered SKILL.md package.',
  },
])

export const AI_TOOL_IDS = Object.freeze(AI_TOOL_DEFINITIONS.map((tool) => tool.id))

export function normalizeEnabledAiToolIds(value = undefined) {
  if (!Array.isArray(value)) {
    return [...AI_TOOL_IDS]
  }
  const allowed = new Set(AI_TOOL_IDS)
  const requested = value
  const normalized = requested
    .map((item) => String(item || '').trim())
    .filter((item) => allowed.has(item))

  return [...new Set(normalized)]
}

export function resolveEnabledAiTools(enabledToolIds = [], allTools = AI_TOOL_DEFINITIONS) {
  const enabled = new Set(normalizeEnabledAiToolIds(enabledToolIds))
  return (Array.isArray(allTools) ? allTools : []).filter((tool) => enabled.has(tool.id))
}

export function buildAiToolPromptBlock(tools = AI_TOOL_DEFINITIONS) {
  const entries = Array.isArray(tools) ? tools : []
  if (entries.length === 0) return 'Available tools: none.'

  return [
    'Available tools in this Altals runtime:',
    ...entries.map((tool) => `- ${tool.label}: ${tool.description}`),
  ].join('\n')
}
