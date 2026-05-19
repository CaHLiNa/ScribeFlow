export function createFileContentRuntime({
  readTextFile,
  saveTextFile,
  isBinaryPath,
  setFileContent,
  clearFileLoadError,
  setFileLoadError,
  syncSavedMarkdownLinks,
  onSaveError,
} = {}) {
  async function readFile(path, options = {}) {
    const { maxBytes } = options

    if (isBinaryPath?.(path)) return null

    try {
      const content = await readTextFile?.(path, maxBytes)
      setFileContent?.(path, content)
      clearFileLoadError?.(path)
      return content
    } catch (error) {
      setFileLoadError?.(path, error)
      return null
    }
  }

  async function reloadFile(path, options = {}) {
    return readFile(path, options)
  }

  async function saveFile(path, content) {
    try {
      await saveTextFile?.(path, content)
      setFileContent?.(path, content)
      clearFileLoadError?.(path)
      syncSavedMarkdownLinks?.(path)
      return true
    } catch (error) {
      onSaveError?.(path, error)
      return false
    }
  }

  function setInMemoryFileContent(path, content) {
    if (!path || typeof content !== 'string') return
    setFileContent?.(path, content)
    clearFileLoadError?.(path)
  }

  function reset() {}

  return {
    readFile,
    reloadFile,
    saveFile,
    setInMemoryFileContent,
    reset,
  }
}
