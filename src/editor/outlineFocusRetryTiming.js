function defaultSetTimeout(callback, delay) {
  return globalThis.setTimeout?.(callback, delay)
}

function defaultClearTimeout(handle) {
  globalThis.clearTimeout?.(handle)
}

export function createOutlineFocusRetryLifecycle({
  scheduler = {},
  maxAttempts = 20,
  retryDelayMs = 40,
} = {}) {
  let handle = null
  let version = 0
  let disposed = false
  const attemptLimit = Math.max(0, Number(maxAttempts) || 0)
  const delayMs = Math.max(0, Number(retryDelayMs) || 0)

  function clearScheduledRetry() {
    if (handle == null) return
    ;(scheduler.clearTimeout || defaultClearTimeout)(handle)
    handle = null
  }

  function cancelPending() {
    if (disposed) return
    version += 1
    clearScheduledRetry()
  }

  function dispose() {
    if (disposed) return
    disposed = true
    version += 1
    clearScheduledRetry()
  }

  function isCurrent(token) {
    return Boolean(token && !disposed && token.version === version)
  }

  function begin() {
    cancelPending()
    if (disposed) return null
    return { version }
  }

  function scheduleRetry(token, callback, attempts) {
    clearScheduledRetry()
    if (!isCurrent(token)) return null
    if (attempts >= attemptLimit) return null

    handle = (scheduler.setTimeout || defaultSetTimeout)(() => {
      handle = null
      if (!isCurrent(token)) return
      callback?.(attempts + 1)
    }, delayMs)

    return handle
  }

  return {
    begin,
    scheduleRetry,
    cancelPending,
    dispose,
    isCurrent,
    getState() {
      return {
        disposed,
        pending: handle != null,
        version,
      }
    },
  }
}
