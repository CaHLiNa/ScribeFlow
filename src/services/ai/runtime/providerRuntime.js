import { getAiProviderAdapter } from './providerRegistry.js'
import {
  runAnthropicAgentSdkRuntime,
  shouldFallbackFromAnthropicSdk,
} from './anthropicSdkRuntime.js'
import { streamSSE } from './sseReader.js'
import { executeAiToolCalls, resolveAiRuntimeTools } from './toolLoop.js'

const MAX_TOOL_ROUNDS = 6

function isOpenAiCompatibleProvider(providerId = '') {
  return ['openai', 'deepseek', 'glm', 'kimi', 'minimax', 'custom'].includes(
    String(providerId || '').trim()
  )
}

function buildForcedToolChoice(userMessage = '', tools = []) {
  const sourceMessage = String(userMessage || '')
  const normalizedMessage = sourceMessage.trim().toLowerCase()
  if (!normalizedMessage) return null

  const availableToolNames = new Set(
    (Array.isArray(tools) ? tools : []).map((tool) => String(tool?.name || '').trim()).filter(Boolean)
  )

  const mentionsFilePath = /[^\s"'`]+\.[a-z0-9]+/iu.test(sourceMessage)
  const wantsDelete = /(删除|删掉|移除|delete|remove|trash)/iu.test(sourceMessage)
  const wantsCreate = /(创建|新建|create|make)/iu.test(sourceMessage)
  const wantsWrite = /(写入|写到|保存|覆盖|write|save|overwrite)/iu.test(sourceMessage)
  const wantsOpen = /(打开|open)/iu.test(sourceMessage)

  if (availableToolNames.has('delete_workspace_path') && wantsDelete) {
    return {
      type: 'function',
      function: {
        name: 'delete_workspace_path',
      },
    }
  }

  if (
    availableToolNames.has('create_workspace_file') &&
    !wantsDelete &&
    (wantsCreate || (mentionsFilePath && (wantsWrite || wantsOpen)))
  ) {
    return {
      type: 'function',
      function: {
        name: 'create_workspace_file',
      },
    }
  }

  if (availableToolNames.has('write_workspace_file') && wantsWrite && !wantsDelete) {
    return {
      type: 'function',
      function: {
        name: 'write_workspace_file',
      },
    }
  }

  if (availableToolNames.has('open_workspace_file') && wantsOpen && !wantsDelete) {
    return {
      type: 'function',
      function: {
        name: 'open_workspace_file',
      },
    }
  }

  return null
}

function mergeToolMetadata(toolCalls = [], toolResults = []) {
  return (Array.isArray(toolCalls) ? toolCalls : []).map((toolCall) => ({
    ...toolCall,
    result:
      (Array.isArray(toolResults) ? toolResults : []).find(
        (result) => result.toolCallId === toolCall.id
      ) || null,
  }))
}

export async function runAiProviderRuntime({
  providerId = 'openai',
  config = {},
  apiKey = '',
  history = [],
  userMessage = '',
  systemMessage = '',
  contextBundle = {},
  supportFiles = [],
  enabledToolIds = [],
  toolRuntime = {},
  onEvent,
  signal,
  anthropicSdkRunner = runAnthropicAgentSdkRuntime,
  sseRunner = streamSSE,
  resolveRuntimeTools = resolveAiRuntimeTools,
  executeToolCalls = executeAiToolCalls,
} = {}) {
  if (providerId === 'anthropic' && String(config?.sdk?.runtimeMode || 'sdk') === 'sdk') {
    try {
      return await anthropicSdkRunner({
        config,
        apiKey,
        userMessage,
        systemMessage,
        contextBundle,
        onEvent,
        signal,
      })
    } catch (error) {
      if (!shouldFallbackFromAnthropicSdk(error)) {
        throw error
      }
    }
  }

  const adapter = getAiProviderAdapter(providerId)
  const { tools, executors } = resolveRuntimeTools({
    enabledToolIds,
    contextBundle,
    supportFiles,
    toolRuntime,
  })
  const toolRounds = []
  const continuationMessages = []
  let finalContent = ''
  let finalReasoning = ''
  let finalStopReason = ''

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const forcedToolChoice =
      round === 0 && isOpenAiCompatibleProvider(providerId)
        ? buildForcedToolChoice(userMessage, tools)
        : null

    const request = adapter.buildStreamRequest({
      baseUrl: config.baseUrl,
      apiKey,
      modelId: config.model,
      history,
      userMessage,
      systemMessage,
      temperature: config.temperature,
      thinkingEnabled: providerId === 'anthropic' || providerId === 'google',
      tools,
      toolChoice: forcedToolChoice,
      continuationMessages,
    })

    const streamResult = await sseRunner({
      request,
      adapter,
      onEvent,
      signal,
    })

    finalContent = streamResult.content || finalContent
    finalReasoning = streamResult.reasoning || finalReasoning
    finalStopReason = streamResult.stopReason || finalStopReason

    if (!streamResult.toolCalls.length || streamResult.stopReason !== 'tool_use') {
      break
    }

    const toolResults = await executeToolCalls(streamResult.toolCalls, executors)
    toolRounds.push({
      toolCalls: mergeToolMetadata(streamResult.toolCalls, toolResults),
      toolResults,
    })

    continuationMessages.push(
      {
        role: 'assistant',
        content: streamResult.content,
        toolCalls: streamResult.toolCalls,
      },
      {
        role: 'tool',
        results: toolResults,
      }
    )
  }

  return {
    content: finalContent,
    reasoning: finalReasoning,
    stopReason: finalStopReason,
    toolRounds,
  }
}
