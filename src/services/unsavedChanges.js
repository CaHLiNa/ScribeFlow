import { useEditorStore } from '../stores/editor'
import { useFilesStore } from '../stores/files'
import { discardEditorPaths } from '../domains/editor/editorDiscardRuntime'

export async function confirmUnsavedChanges(paths = []) {
  const editorStore = useEditorStore()
  const filesStore = useFilesStore()
  const dirtyPaths = editorStore.getDirtyFiles(paths)

  if (dirtyPaths.length === 0) {
    return { choice: 'proceed', dirtyPaths: [] }
  }

  const pathsToPersist = dirtyPaths.filter(
    (path) => !filesStore.isDraftFile(path) && !filesStore.isTransientFile(path)
  )
  const pathsToDiscard = dirtyPaths.filter(
    (path) => filesStore.isDraftFile(path) || filesStore.isTransientFile(path)
  )

  if (pathsToPersist.length > 0) {
    const saved = await editorStore.persistPaths(pathsToPersist)
    if (!saved) {
      return { choice: 'cancel', dirtyPaths: pathsToPersist }
    }
  }

  if (pathsToDiscard.length > 0) {
    await discardEditorPaths(dirtyPaths, {
      isDraftFile: (path) => filesStore.isDraftFile(path),
      clearDraftFile: (path) => filesStore.clearDraftFile(path),
      isTransientFile: (path) => filesStore.isTransientFile(path),
      clearTransientFile: (path) => filesStore.clearTransientFile(path),
      deletePath: (path) => filesStore.deletePath(path),
      deleteFileContent: (path) => filesStore.clearInMemoryFileContent(path),
      reloadFile: (path) => filesStore.reloadFile(path),
      clearDirtyPath: (path) => editorStore.clearFileDirty(path),
    })
  }

  if (pathsToPersist.length > 0 && pathsToDiscard.length > 0) {
    return { choice: 'save', dirtyPaths }
  }
  if (pathsToPersist.length > 0) {
    return { choice: 'save', dirtyPaths: pathsToPersist }
  }
  return { choice: 'discard', dirtyPaths: pathsToDiscard }
}
