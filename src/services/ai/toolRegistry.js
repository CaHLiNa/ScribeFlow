export const AI_TOOL_DEFINITIONS = Object.freeze([
  {
    id: 'list-workspace-directory',
    label: 'list_workspace_directory',
    labelKey: 'List workspace directory',
    description: 'List immediate files and folders inside a workspace directory.',
    descriptionKey: 'List immediate files and folders inside a workspace directory.',
  },
  {
    id: 'search-workspace-files',
    label: 'search_workspace_files',
    labelKey: 'Search workspace files',
    description: 'Search workspace files by path or filename.',
    descriptionKey: 'Search workspace files by path or filename.',
  },
  {
    id: 'read-workspace-file',
    label: 'read_workspace_file',
    labelKey: 'Read workspace file',
    description: 'Read any text file from the current workspace.',
    descriptionKey: 'Read any text file from the current workspace.',
  },
  {
    id: 'read-active-document',
    label: 'read_active_document',
    labelKey: 'Read active document',
    description: 'Read the current open draft as workspace context.',
    descriptionKey: 'Read the current open draft as workspace context.',
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
    id: 'create-workspace-file',
    label: 'create_workspace_file',
    labelKey: 'Create workspace file',
    description: 'Create a new text file inside the current workspace and open it in the editor.',
    descriptionKey: 'Create a new text file inside the current workspace and open it in the editor.',
  },
  {
    id: 'write-workspace-file',
    label: 'write_workspace_file',
    labelKey: 'Write workspace file',
    description: 'Write text content to a workspace file and optionally open it in the editor.',
    descriptionKey: 'Write text content to a workspace file and optionally open it in the editor.',
  },
  {
    id: 'open-workspace-file',
    label: 'open_workspace_file',
    labelKey: 'Open workspace file',
    description: 'Open an existing workspace file in the editor.',
    descriptionKey: 'Open an existing workspace file in the editor.',
  },
  {
    id: 'delete-workspace-path',
    label: 'delete_workspace_path',
    labelKey: 'Delete workspace path',
    description: 'Delete a file or folder inside the current workspace.',
    descriptionKey: 'Delete a file or folder inside the current workspace.',
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
export const CORE_WORKSPACE_AGENT_TOOL_IDS = Object.freeze([
  'list-workspace-directory',
  'search-workspace-files',
  'read-workspace-file',
  'read-active-document',
  'read-editor-selection',
])

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

export function resolveRuntimeAiToolIds(enabledToolIds = [], options = {}) {
  const normalized = normalizeEnabledAiToolIds(enabledToolIds)
  if (String(options?.runtimeIntent || '').trim() !== 'agent') {
    return normalized
  }

  return [...new Set([...normalized, ...CORE_WORKSPACE_AGENT_TOOL_IDS])]
}

export function buildAiToolPromptBlock(tools = AI_TOOL_DEFINITIONS) {
  const entries = Array.isArray(tools) ? tools : []
  if (entries.length === 0) return 'Available tools: none.'

  return [
    'Available tools in this Altals runtime:',
    ...entries.map((tool) => `- ${tool.label}: ${tool.description}`),
  ].join('\n')
}
