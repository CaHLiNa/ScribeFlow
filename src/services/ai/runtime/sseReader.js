import { streamAiProviderRequest } from './streamBridge.js'

export async function streamSSE({
  request = {},
  adapter = null,
  onEvent = () => {},
  signal,
} = {}) {
  if (!adapter) {
    throw new Error('AI provider adapter is required.')
  }

  let content = ''
  let reasoning = ''
  let stopReason = ''
  let buffer = ''
  const pendingToolCalls = new Map()
  let currentToolCallId = ''

  await streamAiProviderRequest(request, {
    signal,
    onChunk: (chunk) => {
      buffer += String(chunk || '')
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        let data = ''
        if (line.startsWith('data: ')) {
          data = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          data = line.slice(5).trim()
        } else {
          continue
        }

        if (!data || data === '[DONE]') {
          continue
        }

        const events = adapter.parseSSELine(data)
        for (const event of events) {
          if (event.type === 'chunk') {
            content += event.delta
          } else if (event.type === 'reasoning') {
            reasoning += event.delta
          } else if (event.type === 'tool_call_start') {
            currentToolCallId = event.toolCallId
            pendingToolCalls.set(event.toolCallId, {
              id: event.toolCallId,
              name: event.toolName,
              args: '',
              metadata: event.metadata,
            })
          } else if (event.type === 'tool_call_delta') {
            const toolCallId = event.toolCallId || currentToolCallId
            const pending = toolCallId ? pendingToolCalls.get(toolCallId) : null
            if (pending) {
              pending.args += event.argumentsDelta
            }
          } else if (event.type === 'done' && event.stopReason) {
            stopReason = event.stopReason
          }

          onEvent(event)
        }
      }
    },
  })

  const toolCalls = []
  for (const [, pending] of pendingToolCalls) {
    try {
      toolCalls.push({
        id: pending.id,
        name: pending.name,
        arguments: pending.args ? JSON.parse(pending.args) : {},
        metadata: pending.metadata,
      })
    } catch {
      toolCalls.push({
        id: pending.id,
        name: pending.name,
        arguments: {},
        metadata: pending.metadata,
      })
    }
  }

  if (toolCalls.length > 0 && !stopReason) {
    stopReason = 'tool_use'
  }

  onEvent({ type: 'done', stopReason })

  return {
    content,
    reasoning,
    toolCalls,
    stopReason,
  }
}
