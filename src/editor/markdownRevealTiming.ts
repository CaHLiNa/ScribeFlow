function defaultSetTimeout(callback, delay) {
  return globalThis.setTimeout?.(callback, delay)
}

function defaultClearTimeout(handle) {
  globalThis.clearTimeout?.(handle)
}

export function createMarkdownRevealLifecycle({
  scheduler = {},
} = {}) {
  let version = 0
  let disposed = false

  function begin() {
    if (disposed) return null
    version += 1
    return { version }
  }

  function cancelPending() {
    if (disposed) return
    version += 1
  }

  function dispose() {
    if (disposed) return
    disposed = true
    version += 1
  }

  function isCurrent(token) {
    return Boolean(token && !disposed && token.version === version)
  }

  function isCancelled(token) {
    return !isCurrent(token)
  }

  function wait(delay = 16) {
    return new Promise((resolve) => {
      const handle = (scheduler.setTimeout || defaultSetTimeout)(resolve, delay)
      if (handle == null) resolve()
    })
  }

  return {
    begin,
    cancelPending,
    dispose,
    isCurrent,
    isCancelled,
    wait,
    clearTimeout(handle) {
      ;(scheduler.clearTimeout || defaultClearTimeout)(handle)
    },
    getState() {
      return {
        disposed,
        version,
      }
    },
  }
}
