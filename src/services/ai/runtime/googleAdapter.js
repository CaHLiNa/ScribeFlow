import { normalizeGoogleBaseUrl } from './urlUtils.js'

function toGoogleHistory(history = []) {
  return (Array.isArray(history) ? history : [])
    .filter((message) => message?.role && message.role !== 'system' && typeof message.content === 'string')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }))
}

function appendContinuationMessages(contents = [], continuationMessages = []) {
  for (const message of Array.isArray(continuationMessages) ? continuationMessages : []) {
    if (message.role === 'assistant') {
      const parts = []
      if (message.content) {
        parts.push({ text: message.content })
      }
      for (const toolCall of Array.isArray(message.toolCalls) ? message.toolCalls : []) {
        const part = {
          functionCall: {
            name: toolCall.name,
            args: toolCall.arguments || {},
          },
        }
        if (toolCall.metadata?.thoughtSignature) {
          part.thoughtSignature = toolCall.metadata.thoughtSignature
        }
        parts.push(part)
      }
      contents.push({ role: 'model', parts })
      continue
    }

    if (message.role === 'tool') {
      contents.push({
        role: 'user',
        parts: (Array.isArray(message.results) ? message.results : []).map((result) => ({
          functionResponse: {
            name: result.toolCallId,
            response: { content: result.content },
          },
        })),
      })
    }
  }
}

function toGoogleTools(tools = []) {
  return [{
    functionDeclarations: (Array.isArray(tools) ? tools : []).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    })),
  }]
}

export class GoogleAdapter {
  constructor() {
    this.providerType = 'google'
  }

  buildStreamRequest(input = {}) {
    const contents = toGoogleHistory(input.history)
    contents.push({
      role: 'user',
      parts: [{ text: input.userMessage || '' }],
    })
    appendContinuationMessages(contents, input.continuationMessages)

    const body = { contents }

    if (input.systemMessage) {
      body.systemInstruction = {
        parts: [{ text: input.systemMessage }],
      }
    }

    if (Array.isArray(input.tools) && input.tools.length > 0) {
      body.tools = toGoogleTools(input.tools)
    }

    if (input.thinkingEnabled) {
      body.generationConfig = {
        thinkingConfig: {
          includeThoughts: true,
          thinkingBudget: 8192,
        },
      }
    }

    return {
      method: 'POST',
      url: `${normalizeGoogleBaseUrl(input.baseUrl)}/v1beta/models/${input.modelId}:streamGenerateContent?alt=sse&key=${encodeURIComponent(input.apiKey)}`,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  }

  parseSSELine(jsonLine = '') {
    try {
      const parsed = JSON.parse(jsonLine)
      const parts = parsed?.candidates?.[0]?.content?.parts || []
      const finishReason = parsed?.candidates?.[0]?.finishReason || null
      const events = []

      for (const part of parts) {
        if (part?.functionCall?.name) {
          events.push({
            type: 'tool_call_start',
            toolCallId: part.functionCall.name,
            toolName: part.functionCall.name,
            metadata: part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : undefined,
          })
          events.push({
            type: 'tool_call_delta',
            toolCallId: part.functionCall.name,
            argumentsDelta: JSON.stringify(part.functionCall.args || {}),
          })
        }

        if (typeof part?.text === 'string' && part.text) {
          if (part.thought) {
            events.push({ type: 'reasoning', delta: part.text })
          } else {
            events.push({ type: 'chunk', delta: part.text })
          }
        }
      }

      if (finishReason === 'TOOL_CALL' || finishReason === 'STOP_REASON_TOOL_CALL') {
        events.push({ type: 'done', stopReason: 'tool_use' })
      }

      return events
    } catch {
      return []
    }
  }
}
