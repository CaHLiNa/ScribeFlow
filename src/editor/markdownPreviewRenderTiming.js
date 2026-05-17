function defaultSetTimeout(callback, delay) {
  return globalThis.setTimeout?.(callback, delay)
}

function defaultClearTimeout(handle) {
  globalThis.clearTimeout?.(handle)
}

export function createMarkdownPreviewRenderLifecycle({
  scheduler = {},
} = {}) {
  let handle = null
  let version = 0
  let disposed = false

  function clearScheduledRender() {
    if (handle == null) return
    ;(scheduler.clearTimeout || defaultClearTimeout)(handle)
    handle = null
  }

  function invalidate() {
    version += 1
    clearScheduledRender()
    return { version }
  }

  function isCurrent(token) {
    return Boolean(token && !disposed && token.version === version)
  }

  function startRender() {
    if (disposed) return null
    return invalidate()
  }

  function scheduleRender(callback, delay = 300) {
    if (disposed) return null
    const token = invalidate()
    handle = (scheduler.setTimeout || defaultSetTimeout)(() => {
      if (!isCurrent(token)) return
      handle = null
      callback?.(token)
    }, delay)
    return handle
  }

  function cancelPending() {
    if (disposed) return
    invalidate()
  }

  function dispose() {
    if (disposed) return
    disposed = true
    invalidate()
  }

  return {
    startRender,
    scheduleRender,
    cancelPending,
    dispose,
    isCurrent,
    getPendingState() {
      return {
        disposed,
        render: handle != null,
      }
    },
  }
}
