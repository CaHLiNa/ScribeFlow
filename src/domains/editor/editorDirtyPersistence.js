import { getAnyRegisteredEditorView } from './editorViewRegistry'
import {
  getNativeEditorDocumentState,
  nativeEditorBridgeAvailable,
} from '../../services/editorRuntime/nativeBridge'

export function markDirtyPath(dirtyFiles, path) {
  if (!(dirtyFiles instanceof Set) || !path || dirtyFiles.has(path)) return false
  dirtyFiles.add(path)
  return true
}

export function clearDirtyPath(dirtyFiles, path) {
  if (!(dirtyFiles instanceof Set) || !path || !dirtyFiles.has(path)) return false
  dirtyFiles.delete(path)
  return true
}

export function hasDirtyPath(dirtyFiles, path) {
  return !!path && dirtyFiles instanceof Set && dirtyFiles.has(path)
}

export function collectDirtyPaths(dirtyFiles, paths = null) {
  const dirty = dirtyFiles instanceof Set ? [...dirtyFiles] : []
  if (!Array.isArray(paths) || paths.length === 0) return dirty
  const allowed = new Set(paths)
  return dirty.filter((path) => allowed.has(path))
}

export async function persistEditorPath({
  path,
  editorViews,
  filesStore,
  onPersisted,
} = {}) {
  if (!path || !filesStore) return false

  const editorRuntime = getAnyRegisteredEditorView(editorViews, path)
  let nativeDocumentState = null

  if (nativeEditorBridgeAvailable()) {
    nativeDocumentState = await getNativeEditorDocumentState({ path }).catch(() => null)
  }

  if (editorRuntime?.altalsPersist) {
    return (await editorRuntime.altalsPersist()) !== false
  }

  if (filesStore.isDraftFile?.(path)) {
    const content =
      typeof nativeDocumentState?.text === 'string' && nativeDocumentState.text
        ? nativeDocumentState.text
        : filesStore.fileContents[path]
    if (typeof content !== 'string') return false
    const savedPath = await filesStore.promptAndSaveDraft(path, content)
    if (savedPath) {
      filesStore.setInMemoryFileContent(savedPath, content)
      onPersisted?.(savedPath, path)
    }
    return !!savedPath
  }

  if (editorRuntime?.altalsGetContent) {
    const saved = await filesStore.saveFile(path, editorRuntime.altalsGetContent())
    if (saved) {
      onPersisted?.(path)
    }
    return saved
  }

  if (typeof nativeDocumentState?.text === 'string' && nativeDocumentState.text.length >= 0) {
    const saved = await filesStore.saveFile(path, nativeDocumentState.text)
    if (saved) {
      filesStore.setInMemoryFileContent(path, nativeDocumentState.text)
      onPersisted?.(path)
    }
    return saved
  }

  if (editorRuntime?.state?.doc) {
    const saved = await filesStore.saveFile(path, editorRuntime.state.doc.toString())
    if (saved) {
      onPersisted?.(path)
    }
    return saved
  }

  const content = filesStore.fileContents[path]
  if (typeof content !== 'string') return false

  const saved = await filesStore.saveFile(path, content)
  if (saved) {
    onPersisted?.(path)
  }
  return saved
}

export async function persistEditorPaths(paths = [], persistPath) {
  const targets = Array.from(new Set(paths.filter(Boolean)))
  let success = true

  for (const path of targets) {
    const saved = await persistPath(path)
    if (!saved) success = false
  }

  return success
}
