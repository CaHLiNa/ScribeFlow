export function createFileToolSyncRuntime({
  setInMemoryFileContent,
  openFile,
} = {}) {
  function syncTextFile(path, content, options = {}) {
    if (!path || typeof content !== 'string') return false

    setInMemoryFileContent?.(path, content)

    if (options.openInEditor) {
      openFile?.(path)
    }

    return true
  }

  return {
    syncTextFile,
  }
}
