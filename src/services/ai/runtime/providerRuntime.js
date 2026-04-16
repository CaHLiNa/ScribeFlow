import { getAiProviderAdapter } from './providerRegistry.js'
import {
  runAnthropicAgentSdkRuntime,
  shouldFallbackFromAnthropicSdk,
} from './anthropicSdkRuntime.js'
import { streamSSE } from './sseReader.js'
import { executeAiToolCalls, resolveAiRuntimeTools } from './toolLoop.js'

const MAX_TOOL_ROUNDS = 6

function mergeToolMetadata(toolCalls = [], toolResults = []) {
  return (Array.isArray(toolCalls) ? toolCalls : []).map((toolCall) => ({
    ...toolCall,
    result: (Array.isArray(toolResults) ? toolResults : []).find(
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
} = {}) {
  if (providerId === 'anthropic' && String(config?.sdk?.runtimeMode || 'sdk') === 'sdk') {
    try {
      return await runAnthropicAgentSdkRuntime({
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
  const { tools, executors } = resolveAiRuntimeTools({
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
      continuationMessages,
    })

    const streamResult = await streamSSE({
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

    const toolResults = await executeAiToolCalls(streamResult.toolCalls, executors)
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
