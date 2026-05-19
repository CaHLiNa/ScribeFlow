export const WORKBENCH_MOTION_PHASE_EVENT = 'scribeflow-shell-resize-phase'

const MOTION_PHASE_IDLE = 'idle'
const MOTION_PHASE_LIVE_RESIZE = 'live-resize'
const MOTION_PHASE_SETTLING = 'settling'

function fallbackRequestFrame(callback) {
  return globalThis?.setTimeout?.(() => callback(Date.now()), 16) || 0
}

function fallbackCancelFrame(handle) {
  globalThis?.clearTimeout?.(handle)
}

function resolveRequestFrame() {
  return typeof globalThis?.requestAnimationFrame === 'function'
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : fallbackRequestFrame
}

function resolveCancelFrame() {
  return typeof globalThis?.cancelAnimationFrame === 'function'
    ? globalThis.cancelAnimationFrame.bind(globalThis)
    : fallbackCancelFrame
}

function dispatchWorkbenchMotionPhase(detail = {}) {
  const targetWindow = globalThis?.window
  if (!targetWindow || typeof targetWindow.dispatchEvent !== 'function') return

  const payload = {
    phase: String(detail?.phase || MOTION_PHASE_IDLE),
    kind: String(detail?.kind || ''),
    activeKinds: Array.isArray(detail?.activeKinds) ? detail.activeKinds : [],
    source: String(detail?.source || ''),
    direction: String(detail?.direction || ''),
    side: String(detail?.side || ''),
    sourceKey: String(detail?.sourceKey || ''),
  }

  const EventCtor = globalThis?.CustomEvent
  if (typeof EventCtor === 'function') {
    targetWindow.dispatchEvent(new EventCtor(WORKBENCH_MOTION_PHASE_EVENT, { detail: payload }))
    return
  }

  targetWindow.dispatchEvent({ type: WORKBENCH_MOTION_PHASE_EVENT, detail: payload })
}

export function resolveWorkbenchMotionSourceKey(detail = {}) {
  const source = String(detail?.source || 'default').trim() || 'default'
  const direction = String(detail?.direction || '').trim()
  const side = String(detail?.side || '').trim()
  return [source, direction, side].filter(Boolean).join(':')
}

export function createWorkbenchMotionRuntime(options = {}) {
  const requestFrame = options.requestFrame || resolveRequestFrame()
  const cancelFrame = options.cancelFrame || resolveCancelFrame()
  const activeSources = new Set()
  const pendingCommits = new Map()
  let phase = MOTION_PHASE_IDLE
  let settleFrame = null

  function setPhase(nextPhase, detail = {}) {
    if (phase === nextPhase) return
    phase = nextPhase
    const payload = {
      ...detail,
      phase: nextPhase,
      activeKinds: [...activeSources],
    }
    options.onPhaseChange?.(nextPhase, payload)
    options.dispatchPhaseChange?.(payload)
  }

  function cancelSettlingFrame() {
    if (settleFrame === null) return
    cancelFrame(settleFrame)
    settleFrame = null
  }

  function flushPendingCommit(key) {
    const normalizedKey = String(key || '')
    const pending = pendingCommits.get(normalizedKey)
    if (!pending) return false

    if (pending.frame !== null) {
      cancelFrame(pending.frame)
    }
    pendingCommits.delete(normalizedKey)
    pending.commit?.(pending.value)
    return true
  }

  return {
    getPhase() {
      return phase
    },

    hasActiveSources() {
      return activeSources.size > 0
    },

    pendingCommitCount() {
      return pendingCommits.size
    },

    begin(sourceKey, detail = {}) {
      const normalizedSourceKey = String(sourceKey || '').trim()
      if (!normalizedSourceKey) return
      cancelSettlingFrame()
      activeSources.add(normalizedSourceKey)
      setPhase(MOTION_PHASE_LIVE_RESIZE, {
        ...detail,
        kind: normalizedSourceKey,
        sourceKey: normalizedSourceKey,
      })
    },

    end(sourceKey, detail = {}) {
      const normalizedSourceKey = String(sourceKey || '').trim()
      if (!normalizedSourceKey) return
      if (!activeSources.delete(normalizedSourceKey)) return
      if (activeSources.size > 0) return

      setPhase(MOTION_PHASE_SETTLING, {
        ...detail,
        kind: normalizedSourceKey,
        sourceKey: normalizedSourceKey,
      })

      cancelSettlingFrame()
      settleFrame = requestFrame(() => {
        settleFrame = null
        if (activeSources.size > 0) return
        setPhase(MOTION_PHASE_IDLE, {
          ...detail,
          kind: normalizedSourceKey,
          sourceKey: normalizedSourceKey,
        })
      })
    },

    schedule(key, value, commit) {
      const normalizedKey = String(key || '').trim()
      if (!normalizedKey || typeof commit !== 'function') return false

      let pending = pendingCommits.get(normalizedKey) || null
      if (!pending) {
        pending = {
          value,
          commit,
          frame: null,
        }
        pendingCommits.set(normalizedKey, pending)
      }

      pending.value = value
      pending.commit = commit

      if (pending.frame !== null) return true

      pending.frame = requestFrame(() => {
        pending.frame = null
        flushPendingCommit(normalizedKey)
      })
      return true
    },

    flush(key) {
      return flushPendingCommit(key)
    },

    reset() {
      cancelSettlingFrame()
      for (const pending of pendingCommits.values()) {
        if (pending.frame !== null) {
          cancelFrame(pending.frame)
        }
      }
      pendingCommits.clear()
      activeSources.clear()
      phase = MOTION_PHASE_IDLE
    },
  }
}

const workbenchMotionRuntime = createWorkbenchMotionRuntime({
  dispatchPhaseChange: dispatchWorkbenchMotionPhase,
})

export function setWorkbenchMotionSourceActive(active, detail = {}) {
  const sourceKey = String(detail?.sourceKey || resolveWorkbenchMotionSourceKey(detail)).trim()
  if (!sourceKey) return ''

  if (active) {
    workbenchMotionRuntime.begin(sourceKey, detail)
  } else {
    workbenchMotionRuntime.end(sourceKey, detail)
  }

  return sourceKey
}

export function scheduleWorkbenchMotionCommit(key, value, commit) {
  return workbenchMotionRuntime.schedule(key, value, commit)
}

export function flushWorkbenchMotionCommit(key) {
  return workbenchMotionRuntime.flush(key)
}

export function getWorkbenchMotionPhase() {
  return workbenchMotionRuntime.getPhase()
}

export function __resetWorkbenchMotionRuntimeForTests() {
  workbenchMotionRuntime.reset()
}
