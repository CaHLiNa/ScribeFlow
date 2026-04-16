import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

const AI_PROVIDER_STREAM_EVENT = 'ai-provider-stream'

function createStreamId() {
  if (globalThis.crypto?.randomUUID) {
    return `ai-stream:${globalThis.crypto.randomUUID()}`
  }
  return `ai-stream:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`
}

export async function streamAiProviderRequest(request = {}, { onChunk, signal } = {}) {
  const streamId = createStreamId()
  let unlisten = null
  let abortListener = null

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
      let started = false
      let settled = false

      const settleReject = (error) => {
        if (settled) return
        settled = true
        reject(error)
      }

      const settleResolve = (value) => {
        if (settled) return
        settled = true
        resolve(value)
      }

      void (async () => {
        try {
          unlisten = await listen(AI_PROVIDER_STREAM_EVENT, (event) => {
            const payload = event?.payload || {}
            if (payload.stream_id !== streamId) return

            if (payload.kind === 'start') {
              started = true
              return
            }

            if (payload.kind === 'chunk') {
              onChunk?.(String(payload.chunk || ''))
              return
            }

            if (payload.kind === 'error') {
              const error = new Error(String(payload.error || 'AI stream failed.'))
              error.status = Number(payload.status || 0)
              settleReject(error)
              return
            }

            if (payload.kind === 'done') {
              settleResolve({
                status: Number(payload.status || 0),
                started,
              })
            }
          })

          if (signal) {
            abortListener = () => {
              void invoke('abort_ai_provider_stream', { streamId }).catch(() => {})
              settleReject(new DOMException('The AI stream was aborted.', 'AbortError'))
            }
            signal.addEventListener('abort', abortListener, { once: true })
          }

          await invoke('start_ai_provider_stream', {
            request: {
              stream_id: streamId,
              url: request.url,
              method: request.method,
              headers: request.headers,
              body: request.body,
            },
          })
        } catch (error) {
          settleReject(
            error instanceof Error
              ? error
              : new Error(String(error || 'Failed to start AI provider stream.'))
          )
        }
      })()
    })
  } finally {
    await cleanup()
  }
}
