import { nextTick, reactive } from 'vue'
import { DOCUMENT_DOCK_FILE_PAGE } from '../../domains/editor/documentDockPages.ts'
import {
  appendTypedFileExtension,
  buildFileTreeRenameState,
  buildTypedFileNameCandidate,
  deriveTypedFileNameCandidates,
  resetFileTreeRenameState,
} from '../../domains/files/fileTreePresentation.ts'
import { listWorkspaceFlatFileEntries } from '../../domains/files/workspaceSnapshotFlatFilesRuntime.ts'
import { useI18n } from '../../i18n'
import { revealPathInFileManager } from '../../services/fileTreeSystem'
import { askNativeDialog } from '../../services/nativeDialog.ts'
import { workspacePathExists } from '../../services/pathStatus.ts'
import { useEditorStore } from '../../stores/editor'
import { useFilesStore } from '../../stores/files'
import { useWorkspaceStore } from '../../stores/workspace'
import { basenamePath, dirnamePath } from '../../utils/path'

function listSelectedPaths(selectedPaths) {
  return selectedPaths && typeof selectedPaths[Symbol.iterator] === 'function'
    ? [...selectedPaths]
    : []
}

export function useFileTreeActions({
  selectedPaths,
  findEntry = () => null,
  getActivePath = () => null,
  getContextEntry = () => null,
  selectRootRenameInput = () => {},
} = {}) {
  const files = useFilesStore()
  const editor = useEditorStore()
  const workspace = useWorkspaceStore()
  const { t } = useI18n()
  const renaming = reactive(resetFileTreeRenameState())
  let isFinishing = false

  function getWorkspaceFlatFiles() {
    return listWorkspaceFlatFileEntries(
      files.lastWorkspaceSnapshot || { flatFiles: files.flatFiles }
    )
  }

  function openFile(path) {
    workspace.openWorkspaceSurface()
    editor.openFile(path)
  }

  function openInDocumentDock(entry) {
    if (!entry?.path || entry.is_dir) return
    workspace.openWorkspaceSurface()
    workspace.openDocumentDock()
    workspace.setDocumentDockActivePage(DOCUMENT_DOCK_FILE_PAGE)
    editor.openDocumentDockFile(entry.path)
  }

  function handleRename(entry) {
    Object.assign(renaming, buildFileTreeRenameState({ entry }))
  }

  function cancelRename() {
    Object.assign(renaming, resetFileTreeRenameState())
  }

  function startInlineCreate(dir, isDir) {
    if (!dir) return
    if (dir !== workspace.path) {
      files.expandedDirs.add(dir)
    }

    Object.assign(
      renaming,
      buildFileTreeRenameState({
        isNew: true,
        isDir,
        parentDir: dir,
        value: isDir ? t('new-folder') : '',
      })
    )

    nextTick(() => {
      if (dir === workspace.path) {
        selectRootRenameInput()
      }
    })
  }

  function startInlineTypedFileCreate(dir, ext = '.md') {
    startInlineCreate(dir, false)
    renaming.autoExtension = ext
  }

  async function createTypedFile(dir, ext, options = {}) {
    if (!dir) return

    if (dir !== workspace.path) {
      files.expandedDirs.add(dir)
    }

    const fileNameParams = {
      suggestedName: options.suggestedName,
      extension: ext,
      fallbackBaseName: t('Untitled'),
    }

    let name = ''
    let candidateIndex = 0
    for (const [index, candidate] of deriveTypedFileNameCandidates(fileNameParams).entries()) {
      candidateIndex = index
      name = candidate
      if (
        !getWorkspaceFlatFiles().some((file) => file.name === name) &&
        !(await workspacePathExists(`${dir}/${name}`))
      ) {
        break
      }
    }

    while (
      getWorkspaceFlatFiles().some((file) => file.name === name) ||
      (await workspacePathExists(`${dir}/${name}`))
    ) {
      candidateIndex += 1
      name = buildTypedFileNameCandidate({
        ...fileNameParams,
        index: candidateIndex,
      })
    }

    const path = await files.createFile(dir, name, {
      initialContent: typeof options.initialContent === 'string' ? options.initialContent : '',
    })
    if (path) {
      files.markTransientFile(path)
      workspace.openWorkspaceSurface()
      editor.openFile(path)
      await nextTick()
      handleRename({ name, path })
      renaming.autoExtension = ext
    }
  }

  function handleNewMenuCreate({ ext, isDir, suggestedName = '', initialContent = '' } = {}) {
    const dir = workspace.path
    if (!dir) return

    if (isDir) {
      startInlineCreate(dir, true)
    } else if (!ext) {
      startInlineCreate(dir, false)
    } else {
      void createTypedFile(dir, ext, { suggestedName, initialContent })
    }
  }

  function handleContextCreate({ ext, isDir, suggestedName = '', initialContent = '' } = {}) {
    const contextEntry = getContextEntry()
    const dir = contextEntry?.is_dir ? contextEntry.path : workspace.path
    if (!dir) return

    if (isDir) {
      startInlineCreate(dir, true)
    } else if (!ext) {
      startInlineCreate(dir, false)
    } else {
      void createTypedFile(dir, ext, { suggestedName, initialContent })
    }
  }

  async function handleDuplicate(entry) {
    if (!entry?.path) return
    const newPath = await files.duplicatePath(entry.path)
    if (newPath) {
      const newName = basenamePath(newPath)
      if (!entry.is_dir) {
        workspace.openWorkspaceSurface()
        editor.openFile(newPath)
      }
      handleRename({ name: newName, path: newPath })
    }
  }

  async function finishRename() {
    if (!renaming.active || isFinishing) return
    isFinishing = true

    try {
      let name = renaming.value.trim()
      if (!name) return

      if (renaming.isNew) {
        name = appendTypedFileExtension(name, renaming.autoExtension)

        if (renaming.isDir) {
          await files.createFolder(renaming.parentDir, name)
        } else {
          const path = await files.createFile(renaming.parentDir, name)
          if (path) {
            files.markTransientFile(path)
            workspace.openWorkspaceSurface()
            editor.openFile(path)
          }
        }
      } else if (renaming.originalPath) {
        name = appendTypedFileExtension(name, renaming.autoExtension)
        const dir = dirnamePath(renaming.originalPath)
        const newPath = `${dir}/${name}`
        if (newPath !== renaming.originalPath) {
          await files.renamePath(renaming.originalPath, newPath)
        }
      }
    } catch (error) {
      console.error('Rename failed:', error)
    } finally {
      cancelRename()
      isFinishing = false
    }
  }

  async function handleDelete(entry) {
    if (!entry?.path) return
    const name = entry.name || basenamePath(entry.path)
    const confirmed = await askNativeDialog(t('Delete "{name}"?', { name }), {
      title: t('Confirm Delete'),
      kind: 'warning',
    })
    if (confirmed) {
      await files.deletePath(entry.path)
    }
  }

  async function handleDeleteSelected() {
    const paths = listSelectedPaths(selectedPaths)
    if (paths.length === 0) return
    const message =
      paths.length === 1
        ? t('Delete "{name}"?', { name: basenamePath(paths[0]) })
        : t('Delete {count} items?', { count: paths.length })
    const confirmed = await askNativeDialog(message, { title: t('Confirm Delete'), kind: 'warning' })
    if (confirmed) {
      for (const path of paths) {
        await files.deletePath(path)
      }
      selectedPaths?.clear?.()
    }
  }

  async function revealInFinder(entry) {
    try {
      await revealPathInFileManager(entry)
    } catch (error) {
      console.error('Failed to reveal in file manager:', error)
    }
  }

  function resolveSelectedTargetDir() {
    let targetDir = workspace.path
    if (selectedPaths?.size > 0) {
      const selectedPath = getActivePath()
      const entry = findEntry(selectedPath)
      if (entry) {
        if (entry.is_dir) {
          targetDir = entry.path
          files.expandedDirs.add(targetDir)
        } else {
          targetDir = dirnamePath(selectedPath)
        }
      }
    }
    return targetDir
  }

  async function beginNewFile(ext = '.md') {
    startInlineTypedFileCreate(resolveSelectedTargetDir(), ext)
  }

  async function createNewFile(ext = '.md') {
    await createTypedFile(resolveSelectedTargetDir(), ext)
  }

  return {
    beginNewFile,
    cancelRename,
    createNewFile,
    finishRename,
    handleContextCreate,
    handleDelete,
    handleDeleteSelected,
    handleDuplicate,
    handleNewMenuCreate,
    handleRename,
    openFile,
    openInDocumentDock,
    renaming,
    revealInFinder,
  }
}
