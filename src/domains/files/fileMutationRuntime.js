import { basenamePath, dirnamePath } from '../../utils/path'

function moveCachedValue(oldPath, newPath, { hasValue, getValue, setValue, deleteValue } = {}) {
  if (!hasValue?.(oldPath)) return
  setValue?.(newPath, getValue?.(oldPath))
  deleteValue?.(oldPath)
}

export function createFileMutationRuntime({
  renameWorkspaceEntry,
  relocateWorkspacePath,
  removeWorkspacePath,
  syncTreeAfterMutation,
  handleRenamedPathEffects,
  handleMovedPathEffects,
  handleDeletedPathEffects,
  hasFileContent,
  getFileContent,
  setFileContent,
  deleteFileContent,
  hasFileLoadError,
  getFileLoadError,
  setFileLoadError,
  deleteFileLoadError,
  hasExpandedDir,
  addExpandedDir,
  removeExpandedDir,
  addDeletingPath,
  removeDeletingPath,
  showRenameExistsError,
  onRenameError,
  onMoveError,
  onDeleteError,
} = {}) {
  async function renamePath(oldPath, newPath) {
    try {
      const result = await renameWorkspaceEntry?.(oldPath, newPath)
      if (!result?.ok) {
        showRenameExistsError?.(newPath)
        return false
      }

      const targetDir = dirnamePath(newPath)
      await syncTreeAfterMutation?.({ expandPath: targetDir })

      moveCachedValue(oldPath, newPath, {
        hasValue: hasFileContent,
        getValue: getFileContent,
        setValue: setFileContent,
        deleteValue: deleteFileContent,
      })
      moveCachedValue(oldPath, newPath, {
        hasValue: hasFileLoadError,
        getValue: getFileLoadError,
        setValue: setFileLoadError,
        deleteValue: deleteFileLoadError,
      })

      await handleRenamedPathEffects?.(oldPath, newPath)

      if (hasExpandedDir?.(oldPath)) {
        removeExpandedDir?.(oldPath)
        addExpandedDir?.(newPath)
      }

      return true
    } catch (error) {
      onRenameError?.(oldPath, newPath, error)
      return false
    }
  }

  async function movePath(srcPath, destDir) {
    const name = basenamePath(srcPath)
    let destPath = `${destDir}/${name}`
    if (srcPath === destPath) return true

    try {
      const result = await relocateWorkspacePath?.(srcPath, destDir)
      destPath = result?.destPath || destPath
      await syncTreeAfterMutation?.({ expandPath: destDir })

      await handleMovedPathEffects?.(srcPath, destPath)
      return true
    } catch (error) {
      onMoveError?.(srcPath, destDir, error)
      return false
    }
  }

  async function deletePath(path) {
    addDeletingPath?.(path)
    try {
      const result = await removeWorkspacePath?.(path)
      if (result && result.ok === false) return false
      await syncTreeAfterMutation?.()
      deleteFileContent?.(path)
      deleteFileLoadError?.(path)
      handleDeletedPathEffects?.(path)
      return true
    } catch (error) {
      onDeleteError?.(path, error)
      return false
    } finally {
      removeDeletingPath?.(path)
    }
  }

  return {
    renamePath,
    movePath,
    deletePath,
  }
}
