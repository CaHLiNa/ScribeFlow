import { useEditorStore } from '../stores/editor'
import { useUnsavedChangesStore } from '../stores/unsavedChanges'
import { useWorkspaceStore } from '../stores/workspace'
import { t } from '../i18n'

function displayPath(path = '', workspacePath = '') {
  if (!path) return ''
  if (workspacePath && path.startsWith(`${workspacePath}/`)) {
    return path.slice(workspacePath.length + 1)
  }
  return path.split('/').pop() || path
}

export async function confirmUnsavedChanges(paths = [], options = {}) {
  const editorStore = useEditorStore()
  const workspace = useWorkspaceStore()
  const dialogStore = useUnsavedChangesStore()
  const dirtyPaths = editorStore.getDirtyFiles(paths)

  if (dirtyPaths.length === 0) {
    return { choice: 'proceed', dirtyPaths: [] }
  }

  const choice = await dialogStore.prompt({
    title: options.title || t('Save changes before closing?'),
    message: options.message || (
      dirtyPaths.length === 1
        ? t('This file has unsaved changes.')
        : t('These files have unsaved changes.')
    ),
    details: dirtyPaths.map(path => displayPath(path, workspace.path)),
    saveLabel: t('Save'),
    discardLabel: t("Don't Save"),
    cancelLabel: t('Cancel'),
  })

  if (choice === 'save') {
    const saved = await editorStore.persistPaths(dirtyPaths)
    if (!saved) {
      return { choice: 'cancel', dirtyPaths }
    }
    return { choice, dirtyPaths }
  }

  if (choice === 'discard') {
    dirtyPaths.forEach(path => editorStore.clearFileDirty(path))
  }

  return { choice, dirtyPaths }
}
