import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

const AI_AGENT_SDK_STREAM_EVENT = 'ai-agent-sdk-stream'

function createStreamId() {
  if (globalThis.crypto?.randomUUID) {
    return `ai-sdk-stream:${globalThis.crypto.randomUUID()}`
  }
  return `ai-sdk-stream:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`
}

function normalizeAgentSdkLine(line = '') {
  try {
    return JSON.parse(String(line || '').trim())
  } catch {
    return null
  }
}

export async function respondAnthropicAgentSdkPermission({
  streamId = '',
  requestId = '',
  behavior = 'deny',
  persist = false,
  message = '',
} = {}) {
  await invoke('respond_ai_anthropic_sdk_permission', {
    response: {
      stream_id: streamId,
      request_id: requestId,
      behavior,
      persist,
      message,
    },
  })
}

export async function respondAnthropicAgentSdkAskUser({
  streamId = '',
  requestId = '',
  answers = {},
} = {}) {
  await invoke('respond_ai_anthropic_sdk_ask_user', {
    response: {
      stream_id: streamId,
      request_id: requestId,
      answers,
    },
  })
}

export async function respondAnthropicAgentSdkExitPlan({
  streamId = '',
  requestId = '',
  action = 'deny',
  feedback = '',
} = {}) {
  await invoke('respond_ai_anthropic_sdk_exit_plan', {
    response: {
      stream_id: streamId,
      request_id: requestId,
      action,
      feedback,
    },
  })
}

export async function runAnthropicAgentSdkBridge(request = {}, { onEvent, signal } = {}) {
  const streamId = createStreamId()
  let unlisten = null
  let abortListener = null
  let buffer = ''

  const cleanup = async () => {
    if (abortListener && signal) {
      signal.removeEventListener('abort', abortListener)
    }
    abortListener = null
    if (typeof unlisten === 'function') {
      await unlisten()
    }
    unlisten = null
  }

  try {
    return await new Promise((resolve, reject) => {
      let resolved = false

      const settleResolve = (value) => {
        if (resolved) return
        resolved = true
        resolve(value)
      }

      const settleReject = (error) => {
        if (resolved) return
        resolved = true
        reject(error)
      }

      const consumeChunk = (chunk = '') => {
        buffer += String(chunk || '')
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const rawLine of lines) {
          const line = rawLine.trim()
          if (!line) continue
          const payload = normalizeAgentSdkLine(line)
          if (!payload) continue

          if (payload.kind === 'event' && payload.event) {
            onEvent?.({
              ...payload.event,
              streamId,
            })
            continue
          }

          if (payload.kind === 'done') {
            settleResolve({
              content: String(payload.content || ''),
              reasoning: String(payload.reasoning || ''),
              stopReason: String(payload.stopReason || ''),
            })
            return
          }

          if (payload.kind === 'error') {
            settleReject(new Error(String(payload.error || 'Anthropic Agent SDK run failed.')))
            return
          }
        }
      }

      void (async () => {
        try {
          unlisten = await listen(AI_AGENT_SDK_STREAM_EVENT, (event) => {
            const payload = event?.payload || {}
            if (payload.stream_id !== streamId) return

            if (payload.kind === 'chunk') {
              consumeChunk(String(payload.chunk || ''))
              return
            }

            if (payload.kind === 'error') {
              settleReject(new Error(String(payload.error || 'Anthropic Agent SDK run failed.')))
              return
            }

            if (payload.kind === 'done') {
              if (buffer.trim()) {
                consumeChunk('\n')
              }
              if (!resolved) {
                settleResolve({
                  content: '',
                  reasoning: '',
                  stopReason: '',
                })
              }
            }
          })

          if (signal) {
            abortListener = () => {
              void invoke('abort_ai_anthropic_sdk_stream', { streamId }).catch(() => {})
              settleReject(new DOMException('The AI stream was aborted.', 'AbortError'))
            }
            signal.addEventListener('abort', abortListener, { once: true })
          }

          await invoke('start_ai_anthropic_sdk_stream', {
            request: {
              stream_id: streamId,
              api_key: request.apiKey,
              model: request.model,
              prompt: request.prompt,
              base_url: request.baseUrl,
              system_prompt: request.systemPrompt,
              cwd: request.cwd,
              tools: request.tools,
              allowed_tools: request.allowedTools,
              approval_mode: request.approvalMode,
              permission_mode: request.permissionMode,
              tool_policies: request.toolPolicies,
              max_turns: request.maxTurns,
            },
          })
        } catch (error) {
          settleReject(
            error instanceof Error
              ? error
              : new Error(String(error || 'Failed to start Anthropic Agent SDK stream.'))
          )
        }
      })()
    })
  } finally {
    await cleanup()
  }
}
