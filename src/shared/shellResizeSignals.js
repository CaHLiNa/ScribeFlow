export const SHELL_RESIZE_BODY_CLASS = 'altals-shell-resizing'
export const SHELL_RESIZE_START_EVENT = 'altals-shell-resize-start'
export const SHELL_RESIZE_END_EVENT = 'altals-shell-resize-end'

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
  toggleBodyClass(active)
  dispatchResizeEvent(active ? SHELL_RESIZE_START_EVENT : SHELL_RESIZE_END_EVENT, detail)
}

export function isShellResizeActive() {
  const classList = resolveBodyClassList()
  return !!classList?.contains?.(SHELL_RESIZE_BODY_CLASS)
}
