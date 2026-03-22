function getSnapshotEditorViewsForPath(editorViews = {}, filePath = '') {
  if (!editorViews || !filePath) {
    return []
  }

  return Object.entries(editorViews)
    .filter(([key]) => key.endsWith(`:${filePath}`))
    .map(([, view]) => view)
}

export function createWorkspaceSnapshotFileApplyRuntime() {
  async function applyWorkspaceSnapshotFileContent({
    filesStore,
    editorStore,
    filePath = '',
    content = '',
  } = {}) {
    if (!filePath) {
      return false
    }

    const saved = await filesStore?.saveFile?.(filePath, content)
    if (!saved) {
      return false
    }

    const openViews = getSnapshotEditorViewsForPath(editorStore?.editorViews, filePath)
    for (const view of openViews) {
      await view?.altalsApplyExternalContent?.(content)
    }

    if (openViews.length === 0 && editorStore?.allOpenFiles?.has?.(filePath)) {
      await filesStore?.reloadFile?.(filePath)
    }

    editorStore?.clearFileDirty?.(filePath)
    return true
  }

  return {
    applyWorkspaceSnapshotFileContent,
  }
}
