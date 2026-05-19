export async function discardEditorPaths(paths = [], options = {}) {
  const {
    isDraftFile = () => false,
    clearDraftFile = () => {},
    isTransientFile = () => false,
    clearTransientFile = () => {},
    deletePath = async () => true,
    deleteFileContent = () => {},
    reloadFile = async () => null,
    clearDirtyPath = () => {},
  } = options

  const targets = Array.from(new Set(paths.filter(Boolean)))

  for (const path of targets) {
    if (isDraftFile(path)) {
      clearDraftFile(path)
      clearDirtyPath(path)
      continue
    }

    if (isTransientFile(path)) {
      await deletePath(path)
      clearTransientFile(path)
      clearDirtyPath(path)
      continue
    }

    deleteFileContent(path)
    await reloadFile(path)
    clearDirtyPath(path)
  }
}
