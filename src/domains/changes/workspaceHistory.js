import { gitAdd, gitCommit, gitStatus } from '../../services/git'
import { ensureWorkspaceHistoryRepo } from '../../services/workspaceHistoryRepo.js'
import {
  canAutoCommitWorkspace,
  enableWorkspaceAutoCommit,
} from '../../services/workspaceAutoCommit'
import { isAiLauncher, isLibraryPath, isPreviewPath } from '../../utils/fileTypes'

async function ensureHistoryRepo({ workspace, options = {}, onUnavailable, onAutoCommitEnabled }) {
  const result = await ensureWorkspaceHistoryRepo(workspace.path, options)
  if (!result.ok) {
    onUnavailable?.()
    return null
  }

  let autoCommitEnabled = await canAutoCommitWorkspace(workspace.path).catch(() => false)
  if (options.enableAutoCommit && !autoCommitEnabled) {
    autoCommitEnabled = await enableWorkspaceAutoCommit(workspace.path).catch(() => false)
  }
  if (autoCommitEnabled) {
    onAutoCommitEnabled?.()
  }
  return {
    ...result,
    autoCommitEnabled,
  }
}

export async function saveWorkspaceHistoryCommit({
  workspace,
  filesStore,
  editorStore,
  requestCommitMessage,
  showNoChanges,
  showCommitFailure,
  onUnavailable,
  onAutoCommitEnabled,
  t,
}) {
  if (!workspace.path) return

  try {
    const historyRepo = await ensureHistoryRepo({
      workspace,
      onUnavailable,
      onAutoCommitEnabled,
    })
    if (!historyRepo) return

    const dirtyPaths = editorStore.getDirtyFiles([...editorStore.allOpenFiles])
    if (dirtyPaths.length > 0) {
      const saved = await editorStore.persistPaths(dirtyPaths)
      if (!saved) return
    }

    for (const filePath of editorStore.allOpenFiles) {
      if (
        filePath.startsWith('ref:@')
        || filePath.startsWith('chat:')
        || isPreviewPath(filePath)
        || filePath.startsWith('newtab:')
        || isAiLauncher(filePath)
        || isLibraryPath(filePath)
      ) {
        continue
      }
      const content = filesStore.fileContents[filePath]
      if (content !== undefined) {
        const saved = await filesStore.saveFile(filePath, content)
        if (!saved) return
      }
    }

    await gitAdd(workspace.path)

    const status = await gitStatus(workspace.path)
    const hasChanges = status && status.trim().length > 0
    if (!hasChanges) {
      showNoChanges?.()
      return
    }

    const name = await requestCommitMessage?.()
    const commitMessage = name && name.trim()
      ? name.trim()
      : t('Save: {ts}', { ts: new Date().toISOString().replace('T', ' ').slice(0, 16) })

    await gitCommit(workspace.path, commitMessage)
  } catch (error) {
    const errStr = String(error)
    if (errStr.includes('nothing to commit')) {
      showNoChanges?.()
    } else {
      console.error('Save+commit error:', error)
      showCommitFailure?.(error)
    }
  }
}

export async function openWorkspaceHistoryEntry({
  workspace,
  entry,
  onUnavailable,
  onAutoCommitEnabled,
  onReady,
  options = {},
}) {
  if (!workspace.path) return

  const result = await ensureHistoryRepo({
    workspace,
    options,
    onUnavailable,
    onAutoCommitEnabled,
  })
  if (!result) return
  onReady?.(entry.path)
}
