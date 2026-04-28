import { onMounted, onUnmounted, ref } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open } from '@tauri-apps/plugin-dialog'
import { useWorkspaceStore } from '../../stores/workspace'
import { useFilesStore } from '../../stores/files'
import { useEditorStore } from '../../stores/editor'
import { useLinksStore } from '../../stores/links'
import { useLatexStore } from '../../stores/latex'
import { useReferencesStore } from '../../stores/references'
import { useDocumentWorkflowStore } from '../../stores/documentWorkflow'
import { useToastStore } from '../../stores/toast'
import { useUxStatusStore } from '../../stores/uxStatus'
import { useI18n } from '../../i18n'
import {
  activateWorkspaceBookmark,
  captureWorkspaceBookmark,
  releaseWorkspaceBookmark,
} from '../../services/workspacePermissions'
import { confirmUnsavedChanges } from '../../services/unsavedChanges'
import { syncNow } from '../../services/references/zoteroSync.js'
import { pathExists } from '../../services/pathExists.js'
import { basenamePath } from '../../utils/path'
import { isTauriDesktopRuntime } from '../../platform'

export function useWorkspaceLifecycle() {
  const workspace = useWorkspaceStore()
  const filesStore = useFilesStore()
  const editorStore = useEditorStore()
  const linksStore = useLinksStore()
  const latexStore = useLatexStore()
  const referencesStore = useReferencesStore()
  const workflowStore = useDocumentWorkflowStore()
  const toastStore = useToastStore()
  const uxStatusStore = useUxStatusStore()
  const { t } = useI18n()

  const setupWizardVisible = ref(false)

  let backgroundWorkspaceTaskTimers = []
  let workspaceLoadGeneration = 0
  let lastFocusRefresh = 0
  let unlistenWindowFocusChange = null

  const isTauriDesktop = isTauriDesktopRuntime

  function normalizeWorkspacePath(path = '') {
    const normalized = String(path || '').replace(/\/+$/, '')
    return normalized || '/'
  }

  function cancelWorkspaceBackgroundTasks() {
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

  function refreshWorkspaceStateAfterVisibility(reason = 'visibility') {
    if (!workspace.isOpen) return

    const now = Date.now()
    if (now - lastFocusRefresh < 2000) return
    lastFocusRefresh = now

    void filesStore.refreshVisibleTree({ suppressErrors: true, reason, announce: true })
  }

  function handleVisibilityChange() {
    if (isTauriDesktop) return
    if (document.visibilityState !== 'visible') return
    refreshWorkspaceStateAfterVisibility('visibility')
  }

  async function pickWorkspace() {
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
    const { skipBookmarkActivation = false, restoreEditorSession = true } = options
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
    const workspaceName = basenamePath(targetPath) || targetPath
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
      const hadCachedTree = filesStore.restoreCachedTree(targetPath)

      const bootstrapPlan = await workspace.resolveWorkspaceBootstrapPlan({
        hasCachedTree: hadCachedTree,
        restoreEditorSession,
      })

      let bootstrapData = null
      const cachedRootExpandedDirs = Array.isArray(filesStore.treeCacheByWorkspace?.[targetPath]?.rootExpandedDirs)
        ? filesStore.treeCacheByWorkspace[targetPath].rootExpandedDirs
        : []

      const runBootstrapTask = async (task) => {
        switch (task?.key) {
          case 'workspace.loadBootstrapData':
            bootstrapData = await workspace.loadWorkspaceBootstrapData({
              legacyWorkspaceDataDir: workspace.workspaceDataDir,
              legacyProjectRoot: workspace.path,
              restoreEditorSession,
              currentTree: filesStore.tree || [],
              cachedRootExpandedDirs,
              includeHidden: workspace.fileTreeShowHidden !== false,
              hasCachedTree: hadCachedTree,
            })
            await referencesStore.applyWorkspaceLibraryBootstrap(
              bootstrapData?.referencesSnapshot || {},
              bootstrapData?.referenceStyles || [],
            )
            await workflowStore.applyHydratedPersistentState(
              bootstrapData?.documentWorkflowState || {},
            )
            editorStore.applyRecentFilesSnapshot(bootstrapData?.recentFiles || [])
            if (bootstrapData?.fileTreeState) {
              filesStore.applyBootstrapTreeState(bootstrapData.fileTreeState, targetPath)
            }
            if (restoreEditorSession) {
              const restored = editorStore.applyEditorSessionState(bootstrapData?.editorSessionState)
              if (!restored && editorStore.allOpenFiles.size === 0) {
                editorStore.openNewTab()
              }
            }
            return
          case 'references.zoteroAutoSync': {
            const zoteroConfig = bootstrapData?.zoteroConfig || null
            if (!zoteroConfig?.userId || zoteroConfig?.autoSync === false) return
            await syncNow(workspace.globalConfigDir, referencesStore)
            return
          }
          case 'files.startWatching':
            await filesStore.startWatching()
            return
          default:
            console.warn('[workspace] Unknown bootstrap task:', task?.key)
        }
      }

      const bootstrapPromise = (async () => {
        for (const task of bootstrapPlan?.tasks || []) {
          if (Number(task?.delayMs || 0) > 0 || task?.awaitCompletion !== true) {
            scheduleWorkspaceBackgroundTask(
              Number(task?.delayMs || 0),
              loadGeneration,
              targetPath,
              () => runBootstrapTask(task),
              task?.key || 'workspace.bootstrapTask',
            )
            continue
          }

          await runBootstrapTask(task)
        }

        if (editorStore.allOpenFiles.size === 0) editorStore.openNewTab()

        const backgroundWindowMs = Number(bootstrapPlan?.backgroundWindowMs || 0)
        if (backgroundWindowMs > 0) {
          scheduleWorkspaceBackgroundTask(
            backgroundWindowMs,
            loadGeneration,
            targetPath,
            async () => {},
            'workspace.bootstrapWindow',
          )
        }
      })()

      workspace.trackWorkspaceBootstrap(bootstrapPromise)
      await bootstrapPromise

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

    if (!workspace.setupComplete) {
      setupWizardVisible.value = true
    }
  }

  async function closeWorkspace(options = {}) {
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
    workflowStore.cleanup()
    await workspace.closeWorkspace()
    void releaseWorkspaceBookmark(closingWorkspacePath)
    return true
  }

  onMounted(async () => {
    try {
      await Promise.all([
        workspace.hydrateWorkspaceRuntime(),
        latexStore.hydratePreferences(),
      ])
    } catch (error) {
      console.warn('[workspace] failed to hydrate preferences from Rust runtime:', error)
    }

    await setupDesktopWindowFocusRefresh()

    workspace.restoreTheme()
    workspace.applyFontSizes()
    await workspace.restorePreferredLocale()
    workspace.restoreUiFont()
    workspace.restoreMarkdownFont()
    workspace.restoreLatexFont()

    if (!workspace.reopenLastWorkspaceOnLaunch) return
    const lastWorkspace = workspace.lastWorkspace
    if (!lastWorkspace) return

    try {
      const restoredWorkspace = await activateWorkspaceBookmark(lastWorkspace)
      const exists = await pathExists(restoredWorkspace)
      if (exists) {
        await openWorkspace(restoredWorkspace, {
          skipBookmarkActivation: true,
          restoreEditorSession: workspace.reopenLastSessionOnLaunch,
        })
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
