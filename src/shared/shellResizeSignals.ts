import {
  __resetWorkbenchMotionRuntimeForTests,
  WORKBENCH_MOTION_PHASE_EVENT,
  resolveWorkbenchMotionSourceKey,
  setWorkbenchMotionSourceActive,
} from '../domains/workbench/workbenchMotionRuntime.ts'

export const SHELL_RESIZE_BODY_CLASS = 'scribeflow-shell-resizing'
export const SHELL_RESIZE_START_EVENT = 'scribeflow-shell-resize-start'
export const SHELL_RESIZE_END_EVENT = 'scribeflow-shell-resize-end'
export const SHELL_RESIZE_PHASE_EVENT = WORKBENCH_MOTION_PHASE_EVENT

const activeShellResizeSources = new Set()

function resolveBodyClassList() {
  return globalThis?.document?.body?.classList || null
}

function toggleBodyClass(active) {
  const classList = resolveBodyClassList()
  if (!classList) return
  if (typeof classList.toggle === 'function') {
    classList.toggle(SHELL_RESIZE_BODY_CLASS, !!active)
    return
  }
  if (active && typeof classList.add === 'function') {
    classList.add(SHELL_RESIZE_BODY_CLASS)
    return
  }
  if (!active && typeof classList.remove === 'function') {
    classList.remove(SHELL_RESIZE_BODY_CLASS)
  }
}

function dispatchResizeEvent(type, detail) {
  const targetWindow = globalThis?.window
  if (!targetWindow || typeof targetWindow.dispatchEvent !== 'function') return

  const EventCtor = globalThis?.CustomEvent
  if (typeof EventCtor === 'function') {
    targetWindow.dispatchEvent(new EventCtor(type, { detail }))
    return
  }

  targetWindow.dispatchEvent({ type, detail })
}

export function setShellResizeActive(active, detail = {}) {
  const sourceKey = resolveWorkbenchMotionSourceKey(detail)
  const wasActive = activeShellResizeSources.size > 0
  const hasSource = activeShellResizeSources.has(sourceKey)

  if (active) {
    if (hasSource) return
    activeShellResizeSources.add(sourceKey)
    setWorkbenchMotionSourceActive(true, {
      ...detail,
      sourceKey,
    })
  } else {
    if (!hasSource) return
    activeShellResizeSources.delete(sourceKey)
    setWorkbenchMotionSourceActive(false, {
      ...detail,
      sourceKey,
    })
  }

  const nextActive = activeShellResizeSources.size > 0
  toggleBodyClass(nextActive)

  if (wasActive === nextActive) return
  dispatchResizeEvent(nextActive ? SHELL_RESIZE_START_EVENT : SHELL_RESIZE_END_EVENT, detail)
}

export function isShellResizeActive() {
  const classList = resolveBodyClassList()
  return !!classList?.contains?.(SHELL_RESIZE_BODY_CLASS)
}

export function __resetShellResizeSignalsForTests() {
  activeShellResizeSources.clear()
  toggleBodyClass(false)
  __resetWorkbenchMotionRuntimeForTests()
}
