import { onMounted, onUnmounted, watch } from 'vue'
import { normalizeSettingsSectionId } from '../../components/settings/settingsSections.js'
import { isNewTab } from '../../utils/fileTypes'
import {
  BROWSER_PREVIEW_CLAUDE_DIR,
  BROWSER_PREVIEW_GLOBAL_CONFIG_DIR,
  BROWSER_PREVIEW_PRIMARY_DOCUMENT,
  BROWSER_PREVIEW_WORKSPACE_DATA_DIR,
  BROWSER_PREVIEW_WORKSPACE_ID,
  BROWSER_PREVIEW_WORKSPACE_PATH,
  listBrowserPreviewExpandedDirs,
  readBrowserPreviewFileContents,
  readBrowserPreviewReferenceSnapshot,
  readBrowserPreviewWorkspaceSnapshot,
} from './state.js'
import {
  buildBrowserPreviewPath,
  isBrowserPreviewRuntime,
  parseBrowserPreviewPath,
  syncBrowserPreviewHistory,
} from './routes.js'

function buildRouteFromStores(workspace, editorStore) {
  if (!workspace.isOpen) {
    return { surface: 'launcher' }
  }

  if (workspace.isSettingsSurface) {
    return {
      surface: 'settings',
      section: normalizeSettingsSectionId(workspace.settingsSection),
    }
  }

  if (workspace.leftSidebarPanel === 'references') {
    return { surface: 'references' }
  }

  return {
    surface: 'workspace',
    variant:
      editorStore.activeTab && !isNewTab(editorStore.activeTab)
        ? 'document'
        : 'newtab',
  }
}

export function useBrowserPreviewRuntime({
  workspace,
  filesStore,
  editorStore,
  referencesStore,
  latexStore,
}) {
  if (!isBrowserPreviewRuntime()) {
    return
  }

  let isApplyingRoute = false

  function ensurePreviewWorkspaceSeeded() {
    const snapshot = readBrowserPreviewWorkspaceSnapshot(BROWSER_PREVIEW_WORKSPACE_PATH)
    if (!snapshot) return

    if (workspace.path !== BROWSER_PREVIEW_WORKSPACE_PATH) {
      workspace.applyBrowserPreviewState({
        isOpen: true,
        path: BROWSER_PREVIEW_WORKSPACE_PATH,
        globalConfigDir: BROWSER_PREVIEW_GLOBAL_CONFIG_DIR,
        workspaceId: BROWSER_PREVIEW_WORKSPACE_ID,
        workspaceDataDir: BROWSER_PREVIEW_WORKSPACE_DATA_DIR,
        claudeConfigDir: BROWSER_PREVIEW_CLAUDE_DIR,
      })
    }

    if (!filesStore.lastWorkspaceSnapshot) {
      filesStore.applyBrowserPreviewSnapshot({
        snapshot,
        fileContents: readBrowserPreviewFileContents(),
        expandedDirs: listBrowserPreviewExpandedDirs(),
      })
    }

    if (!referencesStore.references.length) {
      referencesStore.applyLibrarySnapshot(readBrowserPreviewReferenceSnapshot())
    }

    latexStore.applyBrowserPreviewDiagnostics()
  }

  function applyRoute(route = {}) {
    isApplyingRoute = true

    try {
      if (route.surface === 'launcher') {
        editorStore.cleanup()
        filesStore.cleanup()
        referencesStore.cleanup()
        workspace.applyBrowserPreviewState({ isOpen: false })
        return
      }

      ensurePreviewWorkspaceSeeded()
      workspace.applyBrowserPreviewState({
        isOpen: true,
        path: BROWSER_PREVIEW_WORKSPACE_PATH,
        globalConfigDir: BROWSER_PREVIEW_GLOBAL_CONFIG_DIR,
        workspaceId: BROWSER_PREVIEW_WORKSPACE_ID,
        workspaceDataDir: BROWSER_PREVIEW_WORKSPACE_DATA_DIR,
        claudeConfigDir: BROWSER_PREVIEW_CLAUDE_DIR,
        primarySurface: route.surface === 'settings' ? 'settings' : 'workspace',
        settingsSection: route.surface === 'settings' ? route.section : null,
        leftSidebarOpen: true,
        leftSidebarPanel: route.surface === 'references' ? 'references' : 'files',
        rightSidebarOpen: false,
        rightSidebarPanel: 'outline',
      })

      if (route.surface !== 'workspace') return

      if (route.variant === 'document') {
        editorStore.applyBrowserPreviewTabs([BROWSER_PREVIEW_PRIMARY_DOCUMENT], BROWSER_PREVIEW_PRIMARY_DOCUMENT)
        return
      }

      editorStore.applyBrowserPreviewTabs([], null)
      editorStore.openNewTab()
    } finally {
      isApplyingRoute = false
    }
  }

  function handlePopState() {
    applyRoute(parseBrowserPreviewPath(window.location.pathname))
  }

  onMounted(() => {
    const initialRoute = parseBrowserPreviewPath(window.location.pathname)
    const normalizedPath = buildBrowserPreviewPath(initialRoute)
    if (window.location.pathname !== normalizedPath) {
      syncBrowserPreviewHistory(initialRoute, 'replace')
    }

    applyRoute(initialRoute)
    window.addEventListener('popstate', handlePopState)
  })

  onUnmounted(() => {
    window.removeEventListener('popstate', handlePopState)
  })

  watch(
    () => [
      workspace.path,
      workspace.primarySurface,
      workspace.leftSidebarPanel,
      workspace.settingsSection,
      editorStore.activeTab,
    ],
    () => {
      if (isApplyingRoute) return
      const nextRoute = buildRouteFromStores(workspace, editorStore)
      const nextPath = buildBrowserPreviewPath(nextRoute)
      if (window.location.pathname !== nextPath) {
        syncBrowserPreviewHistory(nextRoute, 'push')
      }
    }
  )
}
