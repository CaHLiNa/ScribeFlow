export function createFlatFilesIndexRuntime({
  getWorkspacePath,
  getFlatFilesReady,
  getFlatFilesCache,
  setFlatFiles,
  readWorkspaceSnapshot,
  applyWorkspaceSnapshot,
  markFlatFilesNotReady,
  listFilesRecursive,
  createTimer = (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearScheduledTimer = (timerId) => globalThis.clearTimeout(timerId),
} = {}) {
  let flatFilesTimer = null
  let flatFilesGeneration = 0
  let flatFilesPromise = null
  let flatFilesWorkspace = null

  function clearTimer() {
    if (!flatFilesTimer) return
    clearScheduledTimer(flatFilesTimer)
    flatFilesTimer = null
  }

  async function indexWorkspaceFiles(options = {}) {
    const workspacePath = getWorkspacePath?.()
    if (!workspacePath) return []

    const {
      delayMs = 0,
      force = false,
    } = options

    if (!force && getFlatFilesReady?.() && flatFilesWorkspace === workspacePath) {
      return getFlatFilesCache?.() ?? []
    }

    if (!force && flatFilesPromise && flatFilesWorkspace === workspacePath) {
      return flatFilesPromise
    }

    clearTimer()

    const generation = flatFilesGeneration + 1
    flatFilesGeneration = generation
    flatFilesWorkspace = workspacePath

    flatFilesPromise = new Promise((resolve, reject) => {
      flatFilesTimer = createTimer(async () => {
        flatFilesTimer = null
        try {
          let flatFiles = []
          if (readWorkspaceSnapshot && applyWorkspaceSnapshot) {
            const snapshot = await readWorkspaceSnapshot(workspacePath, [])
            flatFiles = snapshot?.flatFiles ?? []
            if (flatFilesGeneration === generation && getWorkspacePath?.() === workspacePath) {
              applyWorkspaceSnapshot(snapshot, workspacePath)
            }
          } else {
            flatFiles = await listFilesRecursive?.(workspacePath)
          }
          if (flatFilesGeneration !== generation || getWorkspacePath?.() !== workspacePath) {
            resolve([])
            return
          }
          if (!(readWorkspaceSnapshot && applyWorkspaceSnapshot)) {
            setFlatFiles?.(flatFiles, workspacePath)
          }
          resolve(flatFiles)
        } catch (error) {
          if (flatFilesGeneration === generation) {
            markFlatFilesNotReady?.()
          }
          reject(error)
        } finally {
          if (flatFilesGeneration === generation) {
            flatFilesPromise = null
          }
        }
      }, delayMs)
    })

    return flatFilesPromise
  }

  async function ensureFlatFilesReady(options = {}) {
    return indexWorkspaceFiles({
      delayMs: 0,
      ...options,
    })
  }

  function reset() {
    clearTimer()
    flatFilesGeneration += 1
    flatFilesPromise = null
    flatFilesWorkspace = null
  }

  return {
    indexWorkspaceFiles,
    ensureFlatFilesReady,
    reset,
  }
}
