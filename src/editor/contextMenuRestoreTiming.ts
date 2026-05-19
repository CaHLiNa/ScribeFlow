function defaultRequestAnimationFrame(callback) {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    return globalThis.requestAnimationFrame(callback)
  }
  return globalThis.setTimeout?.(() => callback(Date.now()), 16)
}

function defaultCancelAnimationFrame(handle) {
  if (typeof globalThis.cancelAnimationFrame === 'function') {
    globalThis.cancelAnimationFrame(handle)
    return
  }
  globalThis.clearTimeout?.(handle)
}

function defaultSetTimeout(callback, delay) {
  return globalThis.setTimeout?.(callback, delay)
}

function defaultClearTimeout(handle) {
  globalThis.clearTimeout?.(handle)
}

export function createEditorContextMenuRestoreController({
  scheduler = {},
} = {}) {
  let version = 0
  let disposed = false
  let frameHandle = null
  let timeoutHandle = null

  function clearFrame() {
    if (frameHandle == null) return
    ;(scheduler.cancelAnimationFrame || defaultCancelAnimationFrame)(frameHandle)
    frameHandle = null
  }

  function clearTimeoutHandle() {
    if (timeoutHandle == null) return
    ;(scheduler.clearTimeout || defaultClearTimeout)(timeoutHandle)
    timeoutHandle = null
  }

  function cancelPending() {
    version += 1
    clearFrame()
    clearTimeoutHandle()
  }

  function dispose() {
    if (disposed) return
    disposed = true
    cancelPending()
  }

  function isCurrent(token) {
    return Boolean(token && !disposed && token.version === version)
  }

  function scheduleRestore(callback) {
    cancelPending()
    if (disposed) return null

    const token = { version }
    frameHandle = (scheduler.requestAnimationFrame || defaultRequestAnimationFrame)(() => {
      frameHandle = null
      if (!isCurrent(token)) return
      callback?.()
      if (!isCurrent(token)) return

      timeoutHandle = (scheduler.setTimeout || defaultSetTimeout)(() => {
        timeoutHandle = null
        if (!isCurrent(token)) return
        callback?.()
      }, 0)
    })
    return token
  }

  return {
    scheduleRestore,
    cancelPending,
    dispose,
    isCurrent,
    getPendingState() {
      return {
        disposed,
        frame: frameHandle != null,
        timeout: timeoutHandle != null,
        version,
      }
    },
  }
}
