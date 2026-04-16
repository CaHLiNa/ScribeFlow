function buildToolResult(toolCallId = '', content = '', isError = false) {
  return {
    toolCallId,
    content: String(content || '').trim(),
    isError,
  }
}

export function resolveAiRuntimeTools({
  enabledToolIds = [],
  contextBundle = {},
  supportFiles = [],
  toolRuntime = {},
} = {}) {
  const enabled = new Set(Array.isArray(enabledToolIds) ? enabledToolIds : [])
  const tools = []
  const executors = new Map()

  const register = (toolId, definition, execute) => {
    if (!enabled.has(toolId)) return
    tools.push(definition)
    executors.set(definition.name, execute)
  }

  register(
    'read-active-document',
    {
      name: 'read_active_document',
      description: 'Read the active document metadata and current text content.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    async (toolCallId) => {
      const result = await toolRuntime.readActiveDocument?.(contextBundle)
      return buildToolResult(toolCallId, JSON.stringify(result || {}, null, 2))
    }
  )

  register(
    'read-editor-selection',
    {
      name: 'read_editor_selection',
      description: 'Read the active editor selection and its source position.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    async (toolCallId) => {
      const result = await toolRuntime.readEditorSelection?.(contextBundle)
      return buildToolResult(toolCallId, JSON.stringify(result || {}, null, 2))
    }
  )

  register(
    'read-selected-reference',
    {
      name: 'read_selected_reference',
      description: 'Read the currently selected reference metadata.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    async (toolCallId) => {
      const result = await toolRuntime.readSelectedReference?.(contextBundle)
      return buildToolResult(toolCallId, JSON.stringify(result || {}, null, 2))
    }
  )

  register(
    'load-skill-support-files',
    {
      name: 'load_skill_support_files',
      description: 'Read text support files that belong to the active skill package.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    async (toolCallId) => {
      const result = await toolRuntime.readSkillSupportFiles?.(supportFiles)
      return buildToolResult(toolCallId, JSON.stringify(result || [], null, 2))
    }
  )

  return { tools, executors }
}

export async function executeAiToolCalls(toolCalls = [], executors = new Map()) {
  const results = []

  for (const toolCall of Array.isArray(toolCalls) ? toolCalls : []) {
    const execute = executors.get(toolCall.name)
    if (!execute) {
      results.push(
        buildToolResult(
          toolCall.id,
          `No local executor is registered for ${toolCall.name}.`,
          true
        )
      )
      continue
    }

    try {
      results.push(await execute(toolCall.id, toolCall.arguments || {}))
    } catch (error) {
      results.push(
        buildToolResult(
          toolCall.id,
          error instanceof Error ? error.message : String(error || 'Tool execution failed.'),
          true
        )
      )
    }
  }

  return results
}
