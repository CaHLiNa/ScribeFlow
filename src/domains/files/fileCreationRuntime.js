import { dirnamePath } from '../../utils/path'

export function createFileCreationRuntime({
  createWorkspaceFile,
  duplicateWorkspacePath,
  createWorkspaceFolder,
  copyExternalWorkspaceFile,
  syncTreeAfterMutation,
  ensureDirLoaded,
  addExpandedDir,
  cacheSnapshot,
  showCreateExistsError,
  onCreateFileError,
  onDuplicateError,
  onCreateFolderError,
  onCopyExternalFileError,
} = {}) {
  async function createFile(dirPath, name, options = {}) {
    try {
      const result = await createWorkspaceFile?.(dirPath, name, options)
      if (!result?.ok) {
        showCreateExistsError?.(result.path, name)
        return null
      }
      await syncTreeAfterMutation?.({ expandPath: dirPath })
      return result.path
    } catch (error) {
      onCreateFileError?.(dirPath, name, error)
      return null
    }
  }

  async function duplicatePath(path) {
    const dir = dirnamePath(path)
    try {
      const result = await duplicateWorkspacePath?.(path)
      if (!result?.ok) return null
      const newPath = result.path
      await syncTreeAfterMutation?.({ expandPath: dir })
      return newPath
    } catch (error) {
      onDuplicateError?.(path, error)
      return null
    }
  }

  async function createFolder(dirPath, name) {
    try {
      const result = await createWorkspaceFolder?.(dirPath, name)
      if (!result?.ok) {
        showCreateExistsError?.(result?.path, name)
        return null
      }
      const fullPath = result.path
      await syncTreeAfterMutation?.({ expandPath: dirPath })
      addExpandedDir?.(fullPath)
      await ensureDirLoaded?.(fullPath, { force: true })
      cacheSnapshot?.()
      return fullPath
    } catch (error) {
      onCreateFolderError?.(dirPath, name, error)
      return null
    }
  }

  async function copyExternalFile(srcPath, destDir) {
    try {
      const result = await copyExternalWorkspaceFile?.(srcPath, destDir)
      if (!result?.ok) return null
      await syncTreeAfterMutation?.({ expandPath: destDir })
      return result
    } catch (error) {
      onCopyExternalFileError?.(srcPath, destDir, error)
      return null
    }
  }

  return {
    createFile,
    duplicatePath,
    createFolder,
    copyExternalFile,
  }
}
