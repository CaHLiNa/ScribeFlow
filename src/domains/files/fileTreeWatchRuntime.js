const ACTIVE_TREE_POLL_INTERVAL_MS = 15000
const IDLE_TREE_POLL_INTERVAL_MS = 60000
const TREE_ACTIVITY_WINDOW_MS = 15000

export function createFileTreeWatchRuntime({
  getWorkspaceContext,
  refreshVisibleTree,
  addWindowListener = (type, handler, options) => window.addEventListener(type, handler, options),
  removeWindowListener = (type, handler, options) => window.removeEventListener(type, handler, options),
  addDocumentListener = (type, handler) => document.addEventListener(type, handler),
  removeDocumentListener = (type, handler) => document.removeEventListener(type, handler),
  getVisibilityState = () => (typeof document === 'undefined' ? 'hidden' : document.visibilityState),
  createTimer = (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearScheduledTimer = (timerId) => clearTimeout(timerId),
  now = () => Date.now(),
} = {}) {
  let pollTimer = null
  let activityHandlers = null
  let lastTreeActivityAt = 0

  function clearPollTimer() {
    if (!pollTimer) return
    clearScheduledTimer(pollTimer)
    pollTimer = null
  }

  function teardownActivityHooks() {
    if (!activityHandlers) return
    const { focusHandler, visibilityHandler } = activityHandlers
    removeWindowListener('focus', focusHandler)
    removeDocumentListener('visibilitychange', visibilityHandler)
    activityHandlers = null
  }

  function scheduleNextTreePoll() {
    clearPollTimer()

    const workspace = getWorkspaceContext?.() || {}
    if (!workspace.path) return
    if (getVisibilityState() !== 'visible') return

    const isActive = now() - lastTreeActivityAt <= TREE_ACTIVITY_WINDOW_MS
    const delayMs = isActive ? ACTIVE_TREE_POLL_INTERVAL_MS : IDLE_TREE_POLL_INTERVAL_MS

    pollTimer = createTimer(async () => {
      pollTimer = null
      const activeWorkspace = getWorkspaceContext?.() || {}
      if (!activeWorkspace.path || getVisibilityState() !== 'visible') {
        scheduleNextTreePoll()
        return
      }

      try {
        await refreshVisibleTree?.({ suppressErrors: true, reason: 'poll' })
      } catch {
        // Workspace may have closed between scheduling and execution.
      } finally {
        scheduleNextTreePoll()
      }
    }, delayMs)
  }

  function noteTreeActivity() {
    lastTreeActivityAt = now()
    if (getWorkspaceContext?.()?.path) {
      scheduleNextTreePoll()
    }
  }

  function setupActivityHooks() {
    teardownActivityHooks()
    const focusHandler = () => noteTreeActivity()
    const visibilityHandler = () => scheduleNextTreePoll()
    activityHandlers = { focusHandler, visibilityHandler }
    addWindowListener('focus', focusHandler)
    addDocumentListener('visibilitychange', visibilityHandler)
  }

  async function startWatching() {
    stopWatching()
    setupActivityHooks()
    noteTreeActivity()

    scheduleNextTreePoll()
  }

  function stopWatching() {
    clearPollTimer()
    teardownActivityHooks()
    lastTreeActivityAt = 0
  }

  return {
    noteTreeActivity,
    startWatching,
    stopWatching,
  }
}
