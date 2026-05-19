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

export function createPdfForwardSyncLifecycle({
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

  function waitFrame() {
    return new Promise((resolve) => {
      const handle = (scheduler.requestAnimationFrame || defaultRequestAnimationFrame)(resolve)
      if (handle == null) resolve()
    })
  }

  return {
    begin,
    cancelPending,
    dispose,
    isCurrent,
    isCancelled,
    waitFrame,
    cancelAnimationFrame(handle) {
      ;(scheduler.cancelAnimationFrame || defaultCancelAnimationFrame)(handle)
    },
    getState() {
      return {
        disposed,
        version,
      }
    },
  }
}

export async function waitForPdfForwardSyncFrames(lifecycle, token, frameCount = 2) {
  const totalFrames = Math.max(0, Number(frameCount || 0))
  for (let index = 0; index < totalFrames; index += 1) {
    if (lifecycle?.isCancelled?.(token)) return false
    if (lifecycle?.waitFrame) {
      await lifecycle.waitFrame()
    } else if (typeof globalThis.requestAnimationFrame === 'function') {
      await new Promise((resolve) => globalThis.requestAnimationFrame(resolve))
    } else {
      await new Promise((resolve) => {
        const handle = globalThis.setTimeout?.(resolve, 16)
        if (handle == null) resolve()
      })
    }
    if (lifecycle?.isCancelled?.(token)) return false
  }
  return !lifecycle?.isCancelled?.(token)
}
