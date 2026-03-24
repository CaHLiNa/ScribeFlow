const ACTIVE_TREE_POLL_INTERVAL_MS = 15000
const IDLE_TREE_POLL_INTERVAL_MS = 60000
const TREE_ACTIVITY_WINDOW_MS = 15000
const WATCH_DEBOUNCE_MS = 300

export function filterRelevantFileWatchPaths(paths = [], { workspacePath = '', workspaceDataDir = '' } = {}) {
  return paths.filter((path) => {
    if (workspacePath && path.startsWith(workspacePath)) {
      const relativePath = path.slice(workspacePath.length)
      return !relativePath.startsWith('/.git/')
    }
    return !!(workspaceDataDir && path.startsWith(workspaceDataDir))
  })
}

export function createFileTreeWatchRuntime({
  getWorkspaceContext,
  refreshVisibleTree,
  handleExternalFileChanges,
  listenToFsChange,
  addWindowListener = (type, handler, options) => window.addEventListener(type, handler, options),
  removeWindowListener = (type, handler, options) => window.removeEventListener(type, handler, options),
  addDocumentListener = (type, handler) => document.addEventListener(type, handler),
  removeDocumentListener = (type, handler) => document.removeEventListener(type, handler),
  getVisibilityState = () => (typeof document === 'undefined' ? 'hidden' : document.visibilityState),
  createTimer = (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearScheduledTimer = (timerId) => clearTimeout(timerId),
  now = () => Date.now(),
  onFsEvent,
} = {}) {
  let fsUnlisten = null
  let pollTimer = null
  let debounceTimer = null
  let activityHandlers = null
  let lastTreeActivityAt = 0
  let accumulatedPaths = new Set()

  function clearPollTimer() {
    if (!pollTimer) return
    clearScheduledTimer(pollTimer)
    pollTimer = null
  }

  function clearDebounceTimer() {
    if (!debounceTimer) return
    clearScheduledTimer(debounceTimer)
    debounceTimer = null
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

    fsUnlisten = await listenToFsChange?.(async (event) => {
      const workspace = getWorkspaceContext?.() || {}
      const paths = filterRelevantFileWatchPaths(event.payload?.paths || [], {
        workspacePath: workspace.path,
        workspaceDataDir: workspace.workspaceDataDir,
      })
      if (paths.length === 0) return

      onFsEvent?.(event.payload?.kind, paths)
      noteTreeActivity()

      for (const path of paths) accumulatedPaths.add(path)

      clearDebounceTimer()
      debounceTimer = createTimer(async () => {
        debounceTimer = null
        const changedPaths = [...accumulatedPaths]
        accumulatedPaths = new Set()

        const activeWorkspace = getWorkspaceContext?.() || {}
        if (activeWorkspace.path && changedPaths.some(path => path.startsWith(activeWorkspace.path))) {
          await refreshVisibleTree?.({ suppressErrors: true, reason: 'watch' })
        }

        await handleExternalFileChanges?.(changedPaths)
      }, WATCH_DEBOUNCE_MS)
    })

    scheduleNextTreePoll()
  }

  function stopWatching() {
    if (typeof fsUnlisten === 'function') {
      fsUnlisten()
      fsUnlisten = null
    }
    clearPollTimer()
    clearDebounceTimer()
    teardownActivityHooks()
    accumulatedPaths = new Set()
    lastTreeActivityAt = 0
  }

  return {
    noteTreeActivity,
    startWatching,
    stopWatching,
  }
}
