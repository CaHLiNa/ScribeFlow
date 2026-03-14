import { invoke } from '@tauri-apps/api/core'

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000
const DEFAULT_POLL_INTERVAL_MS = 300

export async function createGitHubAuthLoopbackWaiter(options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS
  const pollIntervalMs = options.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS
  const session = await invoke('github_oauth_start_loopback')

  let settled = false
  let polling = false
  let timeoutId = null
  let intervalId = null
  let resolveWaiter
  let rejectWaiter

  const promise = new Promise((resolve, reject) => {
    resolveWaiter = resolve
    rejectWaiter = reject
  })

  function cleanup() {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  function finishWithResult(result) {
    if (settled) return
    settled = true
    cleanup()
    resolveWaiter(result)
  }

  function finishWithError(error) {
    if (settled) return
    settled = true
    cleanup()
    rejectWaiter(error instanceof Error ? error : new Error(String(error || 'GitHub loopback failed')))
  }

  async function pollOnce() {
    if (settled || polling) return
    polling = true
    try {
      const result = await invoke('github_oauth_poll_loopback', { sessionId: session.sessionId })
      if (result?.pending) return
      if (result?.error) {
        finishWithError(new Error(result.error))
        return
      }
      if (result?.token) {
        finishWithResult({ token: result.token })
        return
      }
      finishWithError(new Error('GitHub loopback returned no token'))
    } catch (error) {
      finishWithError(error)
    } finally {
      polling = false
    }
  }

  intervalId = setInterval(() => {
    pollOnce()
  }, pollIntervalMs)

  timeoutId = setTimeout(() => {
    finishWithError(new Error('GitHub loopback timed out'))
  }, timeoutMs)

  await pollOnce()

  return {
    sessionId: session.sessionId,
    returnTo: session.returnTo,
    promise,
    cancel() {
      if (settled) return
      settled = true
      cleanup()
    },
  }
}
