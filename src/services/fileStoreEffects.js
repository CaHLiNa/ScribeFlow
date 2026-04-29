import { useDocumentWorkflowStore } from '../stores/documentWorkflow.js'
import { useEditorStore } from '../stores/editor.js'
import { useLinksStore } from '../stores/links.js'

export function getWorkflowSourcePathForPreview(previewPath) {
  return useDocumentWorkflowStore().getSourcePathForPreview(previewPath)
}

export async function handleExternalFileChanges(filesStore, changedPaths) {
  const editorStore = useEditorStore()
  const openFiles = editorStore.allOpenFiles

  for (const changedPath of changedPaths) {
    if (openFiles.has(changedPath)) {
      const wasDirty = editorStore.isFileDirty?.(changedPath) === true
      if (wasDirty) {
        continue
      }
      const content = await filesStore.reloadFile(changedPath)
      if (typeof content === 'string') {
        const views = editorStore.getEditorViewsForPath?.(changedPath) || []
        for (const view of views) {
          if (typeof view?.altalsApplyExternalContent === 'function') {
            await view.altalsApplyExternalContent(content)
          }
        }
        editorStore.clearFileDirty?.(changedPath)
      }
    }

    if (changedPath.endsWith('.md')) {
      useLinksStore().updateFile(changedPath)
    }
  }
}

export function syncSavedMarkdownLinks(path) {
  if (path.endsWith('.md')) {
    useLinksStore().updateFile(path)
  }
}

export async function handleRenamedPathEffects(oldPath, newPath) {
  useEditorStore().updateFilePath(oldPath, newPath)
  await useLinksStore().handleRename(oldPath, newPath)
}

export async function handleMovedPathEffects(srcPath, destPath) {
  await useLinksStore().handleRename(srcPath, destPath)
  useEditorStore().updateFilePath(srcPath, destPath)
}

export function handleDeletedPathEffects(path) {
  useEditorStore().closeFileFromAllPanes(path)
  useLinksStore().handleDelete(path)
}
