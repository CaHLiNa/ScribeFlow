function defaultSetTimeout(callback, delay) {
  return globalThis.setTimeout?.(callback, delay)
}

function defaultClearTimeout(handle) {
  globalThis.clearTimeout?.(handle)
}

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

function createScheduledChannel({ schedule, cancel }) {
  let handle = null
  let version = 0

  function cancelPending() {
    version += 1
    if (handle == null) return
    cancel?.(handle)
    handle = null
  }

  function schedulePending(callback, delay = undefined) {
    cancelPending()
    const requestVersion = version
    handle = schedule?.(() => {
      if (requestVersion !== version) return
      handle = null
      callback?.()
    }, delay)
    return handle
  }

  return {
    cancelPending,
    schedulePending,
    hasPending: () => handle != null,
  }
}

export function createEditorMarkdownSyncTimingController({
  scheduler = {},
} = {}) {
  const timeoutChannel = createScheduledChannel({
    schedule: (callback, delay) =>
      (scheduler.setTimeout || defaultSetTimeout)(callback, delay),
    cancel: (handle) =>
      (scheduler.clearTimeout || defaultClearTimeout)(handle),
  })
  const frameChannel = createScheduledChannel({
    schedule: (callback) =>
      (scheduler.requestAnimationFrame || defaultRequestAnimationFrame)(callback),
    cancel: (handle) =>
      (scheduler.cancelAnimationFrame || defaultCancelAnimationFrame)(handle),
  })

  function cancelAll() {
    timeoutChannel.cancelPending()
    frameChannel.cancelPending()
  }

  return {
    scheduleSelection(callback, delay = 90) {
      return timeoutChannel.schedulePending(callback, delay)
    },
    cancelSelection() {
      timeoutChannel.cancelPending()
    },
    scheduleViewport(callback) {
      return frameChannel.schedulePending(callback)
    },
    cancelViewport() {
      frameChannel.cancelPending()
    },
    cancelAll,
    getPendingState() {
      return {
        selection: timeoutChannel.hasPending(),
        viewport: frameChannel.hasPending(),
      }
    },
  }
}
