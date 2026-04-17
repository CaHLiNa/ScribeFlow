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
    'list-workspace-directory',
    {
      name: 'list_workspace_directory',
      description: 'List immediate files and folders inside a workspace directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Workspace-relative or absolute directory path.' },
          maxResults: { type: 'number', description: 'Maximum number of entries to return.' },
        },
        required: [],
      },
    },
    async (toolCallId, args = {}) => {
      const result = await toolRuntime.listWorkspaceDirectory?.({
        path: args.path || '',
        maxResults: args.maxResults,
      })
      return buildToolResult(toolCallId, JSON.stringify(result || {}, null, 2))
    }
  )

  register(
    'search-workspace-files',
    {
      name: 'search_workspace_files',
      description: 'Search workspace files by path or filename.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query for file paths or filenames.' },
          directoryPath: {
            type: 'string',
            description: 'Optional directory path to scope the search.',
          },
          maxResults: { type: 'number', description: 'Maximum number of matches to return.' },
        },
        required: ['query'],
      },
    },
    async (toolCallId, args = {}) => {
      const result = await toolRuntime.searchWorkspaceFiles?.({
        query: args.query || '',
        directoryPath: args.directoryPath || '',
        maxResults: args.maxResults,
      })
      return buildToolResult(toolCallId, JSON.stringify(result || {}, null, 2))
    }
  )

  register(
    'read-workspace-file',
    {
      name: 'read_workspace_file',
      description: 'Read any text file from the current workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Workspace-relative or absolute file path.' },
          maxBytes: { type: 'number', description: 'Maximum number of bytes to read.' },
        },
        required: ['path'],
      },
    },
    async (toolCallId, args = {}) => {
      const result = await toolRuntime.readWorkspaceFile?.({
        path: args.path || '',
        maxBytes: args.maxBytes,
      })
      return buildToolResult(toolCallId, JSON.stringify(result || {}, null, 2))
    }
  )

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
    'create-workspace-file',
    {
      name: 'create_workspace_file',
      description: 'Create a new text file inside the workspace and open it in the editor.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Workspace-relative or absolute file path.' },
          content: { type: 'string', description: 'Initial text content for the file.' },
        },
        required: ['path'],
      },
    },
    async (toolCallId, args = {}) => {
      const result = await toolRuntime.createWorkspaceFile?.({
        path: args.path || '',
        content: args.content || '',
      })
      return buildToolResult(toolCallId, JSON.stringify(result || {}, null, 2))
    }
  )

  register(
    'write-workspace-file',
    {
      name: 'write_workspace_file',
      description: 'Write text content to an existing workspace file and optionally open it.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Workspace-relative or absolute file path.' },
          content: { type: 'string', description: 'The full text content to write.' },
          openAfterWrite: {
            type: 'boolean',
            description: 'Open the file in the editor after writing.',
          },
        },
        required: ['path', 'content'],
      },
    },
    async (toolCallId, args = {}) => {
      const result = await toolRuntime.writeWorkspaceFile?.({
        path: args.path || '',
        content: args.content || '',
        openAfterWrite: args.openAfterWrite,
      })
      return buildToolResult(toolCallId, JSON.stringify(result || {}, null, 2))
    }
  )

  register(
    'open-workspace-file',
    {
      name: 'open_workspace_file',
      description: 'Open an existing workspace file in the editor.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Workspace-relative or absolute file path.' },
        },
        required: ['path'],
      },
    },
    async (toolCallId, args = {}) => {
      const result = await toolRuntime.openWorkspaceFile?.({
        path: args.path || '',
      })
      return buildToolResult(toolCallId, JSON.stringify(result || {}, null, 2))
    }
  )

  register(
    'delete-workspace-path',
    {
      name: 'delete_workspace_path',
      description: 'Delete a file or folder inside the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Workspace-relative or absolute file or folder path.' },
        },
        required: ['path'],
      },
    },
    async (toolCallId, args = {}) => {
      const result = await toolRuntime.deleteWorkspacePath?.({
        path: args.path || '',
      })
      return buildToolResult(toolCallId, JSON.stringify(result || {}, null, 2))
    }
  )

  register(
    'load-skill-support-files',
    {
      name: 'load_skill_support_files',
      description: 'Read text support files that belong to the active instruction-pack directory.',
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
        buildToolResult(toolCall.id, `No local executor is registered for ${toolCall.name}.`, true)
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
