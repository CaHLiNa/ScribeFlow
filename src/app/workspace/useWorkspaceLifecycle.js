import { onMounted, onUnmounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open } from '@tauri-apps/plugin-dialog'
import { useWorkspaceStore } from '../../stores/workspace'
import { useFilesStore } from '../../stores/files'
import { useEditorStore } from '../../stores/editor'
import { useLinksStore } from '../../stores/links'
import { useLatexStore } from '../../stores/latex'
import { useReferencesStore } from '../../stores/references'
import { useToastStore } from '../../stores/toast'
import { useUxStatusStore } from '../../stores/uxStatus'
import { useI18n } from '../../i18n'
import {
  activateWorkspaceBookmark,
  captureWorkspaceBookmark,
  releaseWorkspaceBookmark,
} from '../../services/workspacePermissions'
import { confirmUnsavedChanges } from '../../services/unsavedChanges'
import { loadZoteroConfig, syncNow } from '../../services/references/zoteroSync.js'
import {
  isBrowserPreviewRuntime,
  parseBrowserPreviewPath,
  syncBrowserPreviewHistory,
} from '../browserPreview/routes.js'

export function useWorkspaceLifecycle() {
  const workspace = useWorkspaceStore()
  const filesStore = useFilesStore()
  const editorStore = useEditorStore()
  const linksStore = useLinksStore()
  const latexStore = useLatexStore()
  const referencesStore = useReferencesStore()
  const toastStore = useToastStore()
  const uxStatusStore = useUxStatusStore()
  const { t } = useI18n()

  const setupWizardVisible = ref(false)

  let backgroundWorkspaceLoadTimer = null
  let backgroundWorkspaceTaskTimers = []
  let workspaceLoadGeneration = 0
  let lastFocusRefresh = 0
  let unlistenWindowFocusChange = null

  const isTauriDesktop = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__

  function normalizeWorkspacePath(path = '') {
    const normalized = String(path || '').replace(/\/+$/, '')
    return normalized || '/'
  }

  function cancelWorkspaceBackgroundTasks() {
    if (backgroundWorkspaceLoadTimer) {
      clearTimeout(backgroundWorkspaceLoadTimer)
      backgroundWorkspaceLoadTimer = null
    }
    for (const timer of backgroundWorkspaceTaskTimers) {
      clearTimeout(timer)
    }
    backgroundWorkspaceTaskTimers = []
  }

  function scheduleWorkspaceBackgroundTask(delayMs, generation, targetPath, task, label) {
    const timer = window.setTimeout(async () => {
      backgroundWorkspaceTaskTimers = backgroundWorkspaceTaskTimers.filter((value) => value !== timer)
      if (generation !== workspaceLoadGeneration || workspace.path !== targetPath) return
      try {
        await task()
      } catch (error) {
        console.warn(`[workspace] Background task failed (${label}):`, error)
      }
    }, delayMs)
    backgroundWorkspaceTaskTimers.push(timer)
    return timer
  }

  async function setupDesktopWindowFocusRefresh() {
    if (!isTauriDesktop) return
    try {
      unlistenWindowFocusChange = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (!focused) return
        refreshWorkspaceStateAfterVisibility('window-focus')
      })
    } catch (error) {
      console.warn('[workspace] failed to listen for native focus changes:', error)
    }
  }

  function shouldSkipFocusRefresh() {
    return Date.now() - (workspace._lastAppZoomInteractionAt || 0) < 1500
  }

  function refreshWorkspaceStateAfterVisibility(reason = 'visibility') {
    if (isBrowserPreviewRuntime()) return
    if (!workspace.isOpen) return
    if (shouldSkipFocusRefresh()) return

    const now = Date.now()
    if (now - lastFocusRefresh < 2000) return
    lastFocusRefresh = now

    void filesStore.refreshVisibleTree({ suppressErrors: true, reason, announce: true })
  }

  function handleVisibilityChange() {
    if (isBrowserPreviewRuntime()) return
    if (isTauriDesktop) return
    if (document.visibilityState !== 'visible') return
    refreshWorkspaceStateAfterVisibility('visibility')
  }

  async function pickWorkspace() {
    if (isBrowserPreviewRuntime()) {
      syncBrowserPreviewHistory(parseBrowserPreviewPath('/preview/workspace/document'), 'push')
      return
    }

    const { homeDir } = await import('@tauri-apps/api/path')
    const home = await homeDir()
    const selected = await open({
      directory: true,
      multiple: false,
      title: t('Open Workspace'),
      defaultPath: home,
    })

    if (selected) {
      const bookmarkedPath = await captureWorkspaceBookmark(selected)
      await openWorkspace(bookmarkedPath, { skipBookmarkActivation: true })
    }
  }

  async function openWorkspace(path, options = {}) {
    const { skipBookmarkActivation = false } = options
    let targetPath = path
    if (!skipBookmarkActivation) {
      targetPath = await activateWorkspaceBookmark(path)
    }
    targetPath = normalizeWorkspacePath(targetPath)

    if (workspace.isOpen && normalizeWorkspacePath(workspace.path) === targetPath) {
      return
    }

    cancelWorkspaceBackgroundTasks()
    const loadGeneration = ++workspaceLoadGeneration
    const workspaceName = targetPath.split('/').pop() || targetPath
    const workspaceStatusId = uxStatusStore.show(t('Opening {name}...', { name: workspaceName }), {
      type: 'info',
      duration: 0,
    })

    if (workspace.isOpen) {
      const closed = await closeWorkspace()
      if (!closed) {
        uxStatusStore.clear(workspaceStatusId)
        return
      }
    }

    try {
      await workspace.openWorkspace(targetPath)
      await invoke('workspace_set_allowed_roots', {
        workspaceRoot: targetPath,
        dataDir: workspace.workspaceDataDir || null,
        globalConfigDir: workspace.globalConfigDir || null,
        claudeConfigDir: workspace.claudeConfigDir || null,
      })
      await referencesStore.loadWorkspaceLibrary(workspace.globalConfigDir, {
        legacyWorkspaceDataDir: workspace.workspaceDataDir,
        legacyProjectRoot: workspace.path,
      })
      scheduleWorkspaceBackgroundTask(80, loadGeneration, targetPath, async () => {
        const zoteroConfig = await loadZoteroConfig()
        if (!zoteroConfig?.userId || zoteroConfig?.autoSync === false) return
        await syncNow(workspace.globalConfigDir, referencesStore)
      }, 'references.zoteroAutoSync')
      editorStore.loadRecentFiles(targetPath)

      const hadCachedTree = filesStore.restoreCachedTree(targetPath)
      const loadTreePromise = filesStore.loadFileTree({
        suppressErrors: hadCachedTree,
        keepCurrentTreeOnError: hadCachedTree,
      })
      if (!hadCachedTree) {
        await loadTreePromise
      } else {
        loadTreePromise.catch((error) => {
          console.warn('[workspace] Background file tree refresh failed:', error)
        })
      }
      if (editorStore.allOpenFiles.size === 0) editorStore.openNewTab()

      scheduleWorkspaceBackgroundTask(hadCachedTree ? 30 : 90, loadGeneration, targetPath, async () => {
        const restored = await editorStore.restoreEditorState()
        if (loadGeneration !== workspaceLoadGeneration || workspace.path !== targetPath) return
        if (!restored && editorStore.allOpenFiles.size === 0) {
          editorStore.openNewTab()
        }
      }, 'editor.restoreEditorState')

      scheduleWorkspaceBackgroundTask(hadCachedTree ? 40 : 120, loadGeneration, targetPath, async () => {
        await loadTreePromise.catch(() => {})
        if (loadGeneration !== workspaceLoadGeneration || workspace.path !== targetPath) return
        await filesStore.restoreCachedExpandedDirs(targetPath)
      }, 'files.restoreCachedExpandedDirs')

      scheduleWorkspaceBackgroundTask(0, loadGeneration, targetPath, () => filesStore.startWatching(), 'files.startWatching')

      backgroundWorkspaceLoadTimer = window.setTimeout(() => {
        if (loadGeneration !== workspaceLoadGeneration || workspace.path !== targetPath) return
        backgroundWorkspaceLoadTimer = null
      }, 600)

      uxStatusStore.success(t('Workspace ready'), { duration: 1800 })
    } catch (error) {
      console.error('Failed to open workspace:', error)
      await closeWorkspace({ skipUnsavedCheck: true })
      uxStatusStore.error(t('Failed to open workspace'), { duration: 4000 })
      toastStore.show(t('Failed to open workspace: {error}', { error: error.message || error }), {
        type: 'error',
        duration: 8000,
      })
      return
    } finally {
      uxStatusStore.clear(workspaceStatusId)
    }

    if (!localStorage.getItem('setupComplete')) {
      setupWizardVisible.value = true
    }
  }

  async function closeWorkspace(options = {}) {
    if (isBrowserPreviewRuntime()) {
      syncBrowserPreviewHistory(parseBrowserPreviewPath('/preview/launcher'), 'push')
      return true
    }

    const { skipUnsavedCheck = false } = options
    if (!skipUnsavedCheck) {
      const result = await confirmUnsavedChanges([...editorStore.allOpenFiles])
      if (result.choice === 'cancel') return false
    }

    workspaceLoadGeneration += 1
    cancelWorkspaceBackgroundTasks()
    const closingWorkspacePath = workspace.path

    await editorStore.saveEditorStateImmediate()
    editorStore.cleanup()
    filesStore.cleanup()
    linksStore.cleanup()
    latexStore.cleanup()
    referencesStore.cleanup()
    await workspace.closeWorkspace()
    await invoke('workspace_clear_allowed_roots').catch((error) => {
      console.warn('[workspace] failed to clear allowed roots:', error)
    })
    void releaseWorkspaceBookmark(closingWorkspacePath)
    return true
  }

  onMounted(async () => {
    if (isBrowserPreviewRuntime()) {
      workspace.restoreTheme()
      workspace.applyFontSizes()
      workspace.restoreProseFont()
      await workspace.applyAppZoom()
      return
    }

    await setupDesktopWindowFocusRefresh()

    workspace.restoreTheme()
    workspace.applyFontSizes()
    workspace.restoreProseFont()
    await workspace.applyAppZoom()

    const lastWorkspace = localStorage.getItem('lastWorkspace')
    if (!lastWorkspace) return

    try {
      const restoredWorkspace = await activateWorkspaceBookmark(lastWorkspace)
      const exists = await invoke('path_exists', { path: restoredWorkspace })
      if (exists) {
        await openWorkspace(restoredWorkspace, { skipBookmarkActivation: true })
      }
    } catch {
      // Fall through to launcher when bookmark restore fails.
    }
  })

  onUnmounted(() => {
    workspaceLoadGeneration += 1
    cancelWorkspaceBackgroundTasks()
    if (unlistenWindowFocusChange) {
      unlistenWindowFocusChange()
      unlistenWindowFocusChange = null
    }
  })

  return {
    closeWorkspace,
    handleVisibilityChange,
    openWorkspace,
    pickWorkspace,
    refreshWorkspaceStateAfterVisibility,
    setupWizardVisible,
  }
}
