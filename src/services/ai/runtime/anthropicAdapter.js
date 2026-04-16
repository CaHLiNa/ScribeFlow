import { normalizeAnthropicBaseUrl } from './urlUtils.js'

function toAnthropicHistory(history = []) {
  return (Array.isArray(history) ? history : [])
    .filter((message) => message?.role && message.role !== 'system' && typeof message.content === 'string')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    }))
}

function appendContinuationMessages(messages = [], continuationMessages = []) {
  for (const message of Array.isArray(continuationMessages) ? continuationMessages : []) {
    if (message.role === 'assistant') {
      const content = []
      if (message.content) {
        content.push({ type: 'text', text: message.content })
      }
      for (const toolCall of Array.isArray(message.toolCalls) ? message.toolCalls : []) {
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.arguments || {},
        })
      }
      messages.push({
        role: 'assistant',
        content,
      })
      continue
    }

    if (message.role === 'tool') {
      messages.push({
        role: 'user',
        content: (Array.isArray(message.results) ? message.results : []).map((result) => ({
          type: 'tool_result',
          tool_use_id: result.toolCallId,
          content: result.content,
          is_error: result.isError === true,
        })),
      })
    }
  }
}

function toAnthropicTools(tools = []) {
  return (Array.isArray(tools) ? tools : []).map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }))
}

export class AnthropicAdapter {
  constructor() {
    this.providerType = 'anthropic'
  }

  buildStreamRequest(input = {}) {
    const messages = toAnthropicHistory(input.history)
    messages.push({
      role: 'user',
      content: input.userMessage || '',
    })
    appendContinuationMessages(messages, input.continuationMessages)

    const body = {
      model: input.modelId,
      max_tokens: Number.isFinite(Number(input.maxTokens)) ? Number(input.maxTokens) : 4096,
      messages,
      stream: true,
    }

    if (input.systemMessage) {
      body.system = input.systemMessage
    }

    if (Array.isArray(input.tools) && input.tools.length > 0) {
      body.tools = toAnthropicTools(input.tools)
    }

    return {
      method: 'POST',
      url: `${normalizeAnthropicBaseUrl(input.baseUrl)}/messages`,
      headers: {
        'x-api-key': input.apiKey,
        authorization: `Bearer ${input.apiKey}`,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  }

  parseSSELine(jsonLine = '') {
    try {
      const event = JSON.parse(jsonLine)
      const events = []

      if (event?.type === 'content_block_start' && event?.content_block?.type === 'tool_use') {
        events.push({
          type: 'tool_call_start',
          toolCallId: event.content_block.id,
          toolName: event.content_block.name,
        })
      }

      if (event?.delta?.type === 'text_delta' && event.delta.text) {
        events.push({ type: 'chunk', delta: event.delta.text })
      }

      if (event?.delta?.type === 'thinking_delta' && event.delta.thinking) {
        events.push({ type: 'reasoning', delta: event.delta.thinking })
      }

      if (event?.delta?.type === 'input_json_delta' && event.delta.partial_json) {
        events.push({
          type: 'tool_call_delta',
          toolCallId: '',
          argumentsDelta: event.delta.partial_json,
        })
      }

      if (event?.type === 'message_delta' && event?.delta?.stop_reason === 'tool_use') {
        events.push({ type: 'done', stopReason: 'tool_use' })
      }

      return events
    } catch {
      return []
    }
  }
}
