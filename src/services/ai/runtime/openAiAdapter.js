import { normalizeOpenAiBaseUrl } from './urlUtils.js'

function toHistoryMessages(history = []) {
  return (Array.isArray(history) ? history : [])
    .filter((message) => message?.role && typeof message.content === 'string')
    .map((message) => ({
      role: message.role,
      content: message.content,
    }))
}

function appendContinuationMessages(messages = [], continuationMessages = []) {
  for (const message of Array.isArray(continuationMessages) ? continuationMessages : []) {
    if (message.role === 'assistant') {
      messages.push({
        role: 'assistant',
        content: message.content || null,
        tool_calls: (Array.isArray(message.toolCalls) ? message.toolCalls : []).map((toolCall) => ({
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.arguments || {}),
          },
        })),
      })
      continue
    }

    if (message.role === 'tool') {
      for (const result of Array.isArray(message.results) ? message.results : []) {
        messages.push({
          role: 'tool',
          content: result.content,
          tool_call_id: result.toolCallId,
        })
      }
    }
  }
}

function toOpenAiTools(tools = []) {
  return (Array.isArray(tools) ? tools : []).map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

function serializeToolChoice(toolChoice = null, providerType = 'openai') {
  if (!toolChoice || typeof toolChoice !== 'object') return null

  if (
    providerType === 'custom' &&
    toolChoice.type === 'function' &&
    toolChoice.function &&
    typeof toolChoice.function === 'object'
  ) {
    return {
      type: 'function',
      name: String(toolChoice.function.name || '').trim(),
    }
  }

  return toolChoice
}

export class OpenAIAdapter {
  constructor(providerType = 'openai') {
    this.providerType = providerType
  }

  buildStreamRequest(input = {}) {
    const messages = toHistoryMessages(input.history)

    if (input.systemMessage) {
      messages.unshift({
        role: 'system',
        content: input.systemMessage,
      })
    }

    messages.push({
      role: 'user',
      content: input.userMessage || '',
    })

    appendContinuationMessages(messages, input.continuationMessages)

    const body = {
      model: input.modelId,
      messages,
      stream: true,
      temperature: Number.isFinite(Number(input.temperature)) ? Number(input.temperature) : 0.2,
    }

    if (Array.isArray(input.tools) && input.tools.length > 0) {
      body.tools = toOpenAiTools(input.tools)
    }

    if (input.toolChoice && typeof input.toolChoice === 'object') {
      body.tool_choice = serializeToolChoice(input.toolChoice, this.providerType)
    } else if (typeof input.toolChoice === 'string' && input.toolChoice.trim()) {
      body.tool_choice = input.toolChoice.trim()
    }

    return {
      method: 'POST',
      url: `${normalizeOpenAiBaseUrl(input.baseUrl)}/chat/completions`,
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  }

  parseSSELine(jsonLine = '') {
    try {
      const parsed = JSON.parse(jsonLine)
      const delta = parsed?.choices?.[0]?.delta || {}
      const finishReason = parsed?.choices?.[0]?.finish_reason || null
      const events = []

      if (typeof delta.content === 'string' && delta.content) {
        events.push({ type: 'chunk', delta: delta.content })
      }

      if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
        events.push({ type: 'reasoning', delta: delta.reasoning_content })
      }

      for (const toolCall of Array.isArray(delta.tool_calls) ? delta.tool_calls : []) {
        if (toolCall?.function?.name) {
          events.push({
            type: 'tool_call_start',
            toolCallId: toolCall.id || `tool-${toolCall.index || 0}`,
            toolName: toolCall.function.name,
          })
        }

        if (toolCall?.function?.arguments) {
          events.push({
            type: 'tool_call_delta',
            toolCallId: toolCall.id || '',
            argumentsDelta: toolCall.function.arguments,
          })
        }
      }

      if (finishReason === 'tool_calls') {
        events.push({ type: 'done', stopReason: 'tool_use' })
      }

      return events
    } catch {
      return []
    }
  }
}
