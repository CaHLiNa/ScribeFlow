<template>
  <div class="flex flex-col h-screen w-screen overflow-hidden">
    <!-- Header (always visible) -->
    <Header
      ref="headerRef"
      @open-settings="workspace.openSettings()"
      @open-folder="pickWorkspace"
      @open-workspace="openWorkspace"
      @close-folder="closeWorkspace"
    />

    <!-- Launcher (no workspace open) -->
    <Launcher
      v-if="!workspace.isOpen"
      @open-folder="pickWorkspace"
      @open-workspace="openWorkspace"
    />

    <!-- Main content area (workspace open) -->
    <template v-if="workspace.isOpen">
      <div class="flex flex-1 overflow-hidden">
        <!-- Left sidebar: File tree + References -->
        <div
          v-if="workspace.leftSidebarOpen"
          data-sidebar="left"
          class="shrink-0 overflow-hidden border-r"
          :style="{ width: leftSidebarWidth + 'px', borderColor: 'var(--border)' }"
        >
          <LeftSidebar
            ref="leftSidebarRef"
            @version-history="openVersionHistory"
          />
        </div>

        <!-- Left resize handle -->
        <ResizeHandle
          v-if="workspace.leftSidebarOpen"
          direction="vertical"
          @resize="onLeftResize"
        />

        <!-- Center: Editor panes + bottom panel -->
        <div class="flex-1 flex flex-col overflow-hidden" style="min-width: 200px;">
          <!-- Pane container -->
          <div class="flex-1 overflow-hidden">
            <PaneContainer
              :node="editorStore.paneTree"
              @cursor-change="onCursorChange"
              @editor-stats="onEditorStats"
            />
          </div>

          <!-- Bottom panel resize handle -->
          <ResizeHandle
            v-if="workspace.bottomPanelOpen"
            direction="horizontal"
            @resize="onBottomResize"
          />

          <!-- Bottom panel: Terminals -->
          <BottomPanel ref="bottomPanelRef" :panel-height="bottomPanelHeight" />
        </div>

        <!-- Right resize handle -->
        <ResizeHandle
          v-if="workspace.rightSidebarOpen"
          direction="vertical"
          @resize="onRightResize"
          @dblclick="onRightResizeSnap"
        />

        <!-- Right sidebar: Terminal + Tasks (v-show to preserve running terminals) -->
        <div
          v-show="workspace.rightSidebarOpen"
          class="shrink-0 overflow-hidden border-l"
          :style="{ width: rightSidebarWidth + 'px', borderColor: 'var(--border)' }"
        >
          <RightPanel ref="rightPanelRef" />
        </div>
      </div>

      <!-- Footer -->
      <Footer ref="footerRef" @open-settings="(s) => workspace.openSettings(s)" />
    </template>

    <!-- Version History Modal -->
    <VersionHistory
      :visible="versionHistoryVisible"
      :filePath="versionHistoryFile"
      @close="versionHistoryVisible = false"
    />

    <!-- Settings Modal -->
    <Settings :visible="workspace.settingsOpen" :initialSection="workspace.settingsSection" @close="workspace.closeSettings()" />

    <!-- Setup Wizard (first-time) -->
    <SetupWizard :visible="setupWizardVisible" @close="setupWizardVisible = false" />

    <!-- Toasts -->
    <ToastContainer />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { useWorkspaceStore } from './stores/workspace'
import { useFilesStore } from './stores/files'
import { useEditorStore } from './stores/editor'
import { useReviewsStore } from './stores/reviews'
import { useCommentsStore } from './stores/comments'
import { useLinksStore } from './stores/links'
import { useChatStore } from './stores/chat'
import { useReferencesStore } from './stores/references'
import { useTypstStore } from './stores/typst'
import { useLatexStore } from './stores/latex'
import { useKernelStore } from './stores/kernel'
import { useToastStore } from './stores/toast'
import { useUxStatusStore } from './stores/uxStatus'
import { gitAdd, gitCommit, gitStatus } from './services/git'
import { isMod } from './platform'
import { isChatTab, isNewTab, getViewerType } from './utils/fileTypes'
import {
  activateWorkspaceBookmark,
  captureWorkspaceBookmark,
  releaseWorkspaceBookmark,
} from './services/workspacePermissions'

import Header from './components/layout/Header.vue'
import Footer from './components/layout/Footer.vue'
import ResizeHandle from './components/layout/ResizeHandle.vue'
import PaneContainer from './components/editor/PaneContainer.vue'
import Launcher from './components/Launcher.vue'
import ToastContainer from './components/layout/ToastContainer.vue'
import { useI18n } from './i18n'
import { events } from './services/telemetry'
import { useAppShellLayout } from './composables/useAppShellLayout'
import {
  reconcileCriticalWorkspaceState,
  resetCriticalWorkspaceState,
} from './services/criticalWorkspaceState'

const LeftSidebar = defineAsyncComponent(() => import('./components/sidebar/LeftSidebar.vue'))
const RightPanel = defineAsyncComponent(() => import('./components/panel/RightPanel.vue'))
const BottomPanel = defineAsyncComponent(() => import('./components/layout/BottomPanel.vue'))
const VersionHistory = defineAsyncComponent(() => import('./components/VersionHistory.vue'))
const Settings = defineAsyncComponent(() => import('./components/settings/Settings.vue'))
const SetupWizard = defineAsyncComponent(() => import('./components/SetupWizard.vue'))

const workspace = useWorkspaceStore()
const filesStore = useFilesStore()
const editorStore = useEditorStore()
const reviews = useReviewsStore()
const commentsStore = useCommentsStore()
const linksStore = useLinksStore()
const chatStore = useChatStore()
const referencesStore = useReferencesStore()
const typstStore = useTypstStore()
const latexStore = useLatexStore()
const kernelStore = useKernelStore()
const toastStore = useToastStore()
const uxStatusStore = useUxStatusStore()
const { t } = useI18n()

const footerRef = ref(null)
const headerRef = ref(null)
const leftSidebarRef = ref(null)
const rightPanelRef = ref(null)
const bottomPanelRef = ref(null)
const setupWizardVisible = ref(false)
const versionHistoryVisible = ref(false)
const versionHistoryFile = ref('')
let backgroundWorkspaceLoadTimer = null
let backgroundWorkspaceTaskTimers = []
let workspaceLoadGeneration = 0
const {
  leftSidebarWidth,
  rightSidebarWidth,
  bottomPanelHeight,
  onLeftResize,
  onBottomResize,
  onRightResize,
  onRightResizeSnap,
  cleanupAppShellLayout,
} = useAppShellLayout()

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
    backgroundWorkspaceTaskTimers = backgroundWorkspaceTaskTimers.filter(value => value !== timer)
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

// Startup
onMounted(async () => {
  // Telemetry: app launched
  events.appOpen()

  // Restore saved theme + font sizes + prose font
  workspace.restoreTheme()
  workspace.applyFontSizes()
  workspace.restoreProseFont()

  // Try to restore last workspace
  const lastWorkspace = localStorage.getItem('lastWorkspace')
  if (lastWorkspace) {
    try {
      const restoredWorkspace = await activateWorkspaceBookmark(lastWorkspace)
      const exists = await invoke('path_exists', { path: restoredWorkspace })
      if (exists) {
        await openWorkspace(restoredWorkspace, { skipBookmarkActivation: true })
        return
      }
    } catch (e) {
      // Fall through to launcher
    }
  }
  // No workspace to restore — launcher will show automatically (workspace.isOpen is false)
})

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

  // Close any currently open workspace first
  if (workspace.isOpen) {
    await closeWorkspace()
  }

  try {
    await workspace.openWorkspace(targetPath)
    await invoke('workspace_set_allowed_roots', {
      workspaceRoot: targetPath,
      dataDir: workspace.workspaceDataDir || null,
    })
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

    // Background: don't block the editor opening
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
    scheduleWorkspaceBackgroundTask(40, loadGeneration, targetPath, async () => {
      await workspace.ensureWorkspaceBootstrapReady(targetPath)
      if (loadGeneration !== workspaceLoadGeneration || workspace.path !== targetPath) return
      await reviews.startWatching()
    }, 'reviews.startWatching')
    scheduleWorkspaceBackgroundTask(100, loadGeneration, targetPath, async () => {
      await workspace.ensureWorkspaceBootstrapReady(targetPath)
      if (loadGeneration !== workspaceLoadGeneration || workspace.path !== targetPath) return
      await commentsStore.loadComments()
    }, 'comments.loadComments')
    scheduleWorkspaceBackgroundTask(180, loadGeneration, targetPath, async () => {
      await workspace.ensureWorkspaceBootstrapReady(targetPath)
      if (loadGeneration !== workspaceLoadGeneration || workspace.path !== targetPath) return
      await chatStore.loadSessions()
    }, 'chat.loadSessions')
    scheduleWorkspaceBackgroundTask(280, loadGeneration, targetPath, async () => {
      await workspace.ensureWorkspaceBootstrapReady(targetPath)
      if (loadGeneration !== workspaceLoadGeneration || workspace.path !== targetPath) return
      await referencesStore.loadLibrary()
    }, 'references.loadLibrary')
    scheduleWorkspaceBackgroundTask(380, loadGeneration, targetPath, async () => {
      await workspace.ensureWorkspaceBootstrapReady(targetPath)
      if (loadGeneration !== workspaceLoadGeneration || workspace.path !== targetPath) return
      await typstStore.loadSettings()
    }, 'typst.loadSettings')
    scheduleWorkspaceBackgroundTask(620, loadGeneration, targetPath, async () => {
      await workspace.ensureWorkspaceBootstrapReady(targetPath)
      if (loadGeneration !== workspaceLoadGeneration || workspace.path !== targetPath) return
      await typstStore.checkCompiler()
    }, 'typst.checkCompiler')
    backgroundWorkspaceLoadTimer = window.setTimeout(() => {
      if (loadGeneration !== workspaceLoadGeneration || workspace.path !== targetPath) return
      backgroundWorkspaceLoadTimer = null
    }, 600)
    uxStatusStore.success(t('Workspace ready'), { duration: 1800 })
  } catch (e) {
    console.error('Failed to open workspace:', e)
    await closeWorkspace()
    uxStatusStore.error(t('Failed to open workspace'), { duration: 4000 })
    toastStore.show(t('Failed to open workspace: {error}', { error: e.message || e }), { type: 'error', duration: 8000 })
    return
  } finally {
    uxStatusStore.clear(workspaceStatusId)
  }

  // Show setup wizard on first launch
  if (!localStorage.getItem('setupComplete')) {
    setupWizardVisible.value = true
  }
}

async function closeWorkspace() {
  workspaceLoadGeneration += 1
  cancelWorkspaceBackgroundTasks()
  const closingWorkspacePath = workspace.path

  // Save editor state before cleanup resets the pane tree
  await editorStore.saveEditorStateImmediate()
  editorStore.cleanup()
  filesStore.cleanup()
  reviews.cleanup()
  linksStore.cleanup()
  chatStore.cleanup()
  commentsStore.cleanup()
  referencesStore.cleanup()
  void kernelStore.shutdownAll().catch((error) => {
    console.warn('[workspace] kernel shutdown failed:', error)
  })
  latexStore.cleanup()
  typstStore.cleanup()
  await workspace.closeWorkspace()
  resetCriticalWorkspaceState(closingWorkspacePath)
  await invoke('workspace_clear_allowed_roots').catch((error) => {
    console.warn('[workspace] failed to clear allowed roots:', error)
  })
  void releaseWorkspaceBookmark(closingWorkspacePath)
}


// Keyboard shortcuts
function handleKeydown(e) {
  // Cmd+S: Force save + commit
  if (isMod(e) && e.key === 's') {
    e.preventDefault()
    forceSaveAndCommit()
    return
  }

  // Cmd+O: Open folder
  if (isMod(e) && e.key === 'o') {
    e.preventDefault()
    pickWorkspace()
    return
  }

  // Cmd+N: Context-aware — new instance of whatever you're currently doing
  if (isMod(e) && e.key === 'n') {
    e.preventDefault()
    const tab = editorStore.activeTab
    if (tab && isChatTab(tab)) {
      // In a chat → new chat
      editorStore.openChat({ paneId: editorStore.activePaneId })
    } else if (tab && !isNewTab(tab)) {
      // In a file → new file of same type
      const dot = tab.lastIndexOf('.')
      const ext = dot > 0 ? tab.substring(dot) : '.md'
      leftSidebarRef.value?.createNewFile(ext)
    } else {
      // NewTab or no tab → new markdown
      leftSidebarRef.value?.createNewFile('.md')
    }
    return
  }

  // Cmd+B: Toggle left sidebar (but not for DOCX/MD — they use Cmd+B for bold)
  if (isMod(e) && e.key === 'b') {
    const tab = editorStore.activeTab
    if (tab?.endsWith('.docx') || tab?.endsWith('.md')) return // let editor handle bold
    e.preventDefault()
    workspace.toggleLeftSidebar()
    return
  }

  // Cmd+T: New tab page in current pane
  if (isMod(e) && e.key === 't') {
    e.preventDefault()
    editorStore.openNewTab()
    return
  }

  // Cmd+J: Split pane and open NewTab in the new pane
  if (isMod(e) && e.key === 'j') {
    e.preventDefault()
    editorStore.openNewTabBeside()
    return
  }

  // Cmd+,: Settings
  if (isMod(e) && e.key === ',') {
    e.preventDefault()
    workspace.settingsOpen ? workspace.closeSettings() : workspace.openSettings()
    return
  }

  // Cmd+P: Focus header search
  if (isMod(e) && e.key === 'p') {
    e.preventDefault()
    headerRef.value?.focusSearch()
    return
  }

  // Cmd+Option+Left/Right: Switch tabs
  if (isMod(e) && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault()
    editorStore.switchTab(e.key === 'ArrowLeft' ? -1 : 1)
    return
  }

  // Cmd+W: Close tab, or close empty pane
  if (isMod(e) && e.key === 'w') {
    e.preventDefault()
    const pane = editorStore.activePane
    if (!pane) return
    if (pane.activeTab) {
      editorStore.closeTab(pane.id, pane.activeTab)
    } else {
      // No tabs — collapse pane if it's not the root
      const parent = editorStore.findParent(editorStore.paneTree, pane.id)
      if (parent) editorStore.collapsePane(pane.id)
    }
    return
  }

  // Cmd+Shift+L: Add comment on selection
  if (isMod(e) && e.shiftKey && (e.key === 'L' || e.key === 'l' || e.code === 'KeyL')) {
    e.preventDefault()

    const pane = editorStore.activePane
    if (!pane || !pane.activeTab) return

    // Only for text files
    const vt = getViewerType(pane.activeTab)
    if (vt !== 'text') return

    // Get the editor view and check for selection
    const view = editorStore.getEditorView(pane.id, pane.activeTab)
    if (!view) return
    const sel = view.state.selection.main
    if (sel.from === sel.to) return // no selection

    // Auto-show margin
    if (!commentsStore.isMarginVisible(pane.activeTab)) {
      commentsStore.toggleMargin(pane.activeTab)
    }

    // Dispatch event for EditorPane to handle
    window.dispatchEvent(new CustomEvent('comment-create', {
      detail: { paneId: pane.id }
    }))
    return
  }

  // Cmd+= / Cmd+-: Zoom in/out (CSS vars — DOCX page zoom is in its own toolbar)
  if (isMod(e) && (e.key === '=' || e.key === '+')) {
    e.preventDefault()
    workspace.zoomIn()
    return
  }
  if (isMod(e) && e.key === '-') {
    e.preventDefault()
    workspace.zoomOut()
    return
  }
  if (isMod(e) && e.key === '0') {
    e.preventDefault()
    workspace.resetZoom()
    return
  }

  // Cmd+F: Route to file tree filter when sidebar is focused
  if (isMod(e) && e.key === 'f') {
    const sidebarEl = document.querySelector('[data-sidebar="left"]')
    if (sidebarEl && sidebarEl.contains(document.activeElement)) {
      e.preventDefault()
      leftSidebarRef.value?.activateFilter()
      return
    }
    // Otherwise fall through to CodeMirror's built-in search
  }

  // Escape: Close modals
  if (e.key === 'Escape') {
    if (workspace.settingsOpen) {
      workspace.closeSettings()
      e.preventDefault()
      return
    }
    if (versionHistoryVisible.value) {
      versionHistoryVisible.value = false
      e.preventDefault()
      return
    }
  }
}

function handleChatPrefill(e) {
  const { message } = e.detail || {}
  if (!message) return
  editorStore.openChatBeside({ prefill: message })
}

// Alt+Z: capture phase so it fires before CodeMirror consumes the event
// (Option+Z produces Ω on macOS, which CM would insert as text)
// Alt+Z: capture phase so it fires before CodeMirror consumes the event
// (Option+Z produces Ω on macOS, which CM would insert as text)
// e.code is physical-position-based: QWERTY='KeyZ', QWERTZ='KeyY'
function handleAltZ(e) {
  if (e.altKey && !e.metaKey && !e.ctrlKey
      && (e.code === 'KeyZ' || e.code === 'KeyY' || e.key.toLowerCase() === 'z')) {
    e.preventDefault()
    workspace.toggleSoftWrap()
  }
}

function handleFocusSearch() { headerRef.value?.focusSearch() }
function handleNewFile() {
  if (!workspace.isOpen) return
  leftSidebarRef.value?.createNewFile('.md')
}
function handleOpenFolder() { pickWorkspace() }
async function handleCloseFolder() {
  if (!workspace.isOpen) return
  await closeWorkspace()
}
function handleOpenSettings(e) {
  const section = e?.detail?.section ?? null
  workspace.openSettings(section)
}
function handleToggleLeftSidebar() {
  if (!workspace.isOpen) return
  workspace.toggleLeftSidebar()
}
function handleToggleTerminal() {
  if (!workspace.isOpen) return
  workspace.toggleBottomPanel()
}

// Refresh file tree when window regains focus (catches files added via Finder etc.)
let lastFocusRefresh = 0
function handleVisibilityChange() {
  if (document.visibilityState === 'visible' && workspace.isOpen) {
    const now = Date.now()
    if (now - lastFocusRefresh < 2000) return
    lastFocusRefresh = now
    filesStore.refreshVisibleTree({ suppressErrors: true, reason: 'visibility', announce: true })
      .then(() => reconcileCriticalWorkspaceState({ announce: true }))
      .catch(() => {})
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('keydown', handleAltZ, true)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('chat-prefill', handleChatPrefill)
  window.addEventListener('app:focus-search', handleFocusSearch)
  window.addEventListener('app:new-file', handleNewFile)
  window.addEventListener('app:open-folder', handleOpenFolder)
  window.addEventListener('app:close-folder', handleCloseFolder)
  window.addEventListener('app:open-settings', handleOpenSettings)
  window.addEventListener('app:toggle-left-sidebar', handleToggleLeftSidebar)
  window.addEventListener('app:toggle-terminal', handleToggleTerminal)
})

onUnmounted(() => {
  workspaceLoadGeneration += 1
  cancelWorkspaceBackgroundTasks()
  cleanupAppShellLayout()
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('keydown', handleAltZ, true)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('chat-prefill', handleChatPrefill)
  window.removeEventListener('app:focus-search', handleFocusSearch)
  window.removeEventListener('app:new-file', handleNewFile)
  window.removeEventListener('app:open-folder', handleOpenFolder)
  window.removeEventListener('app:close-folder', handleCloseFolder)
  window.removeEventListener('app:open-settings', handleOpenSettings)
  window.removeEventListener('app:toggle-left-sidebar', handleToggleLeftSidebar)
  window.removeEventListener('app:toggle-terminal', handleToggleTerminal)
  workspace.cleanup()
  filesStore.cleanup()
  reviews.cleanup()
  linksStore.cleanup()
  chatStore.cleanup()
  commentsStore.cleanup()
  referencesStore.cleanup()
})

// Force save + commit
async function forceSaveAndCommit() {
  if (!workspace.path) return

  try {
    // Save all open files by triggering a flush on every editor view
    const openFiles = editorStore.allOpenFiles
    for (const filePath of openFiles) {
      // Skip virtual paths (reference tabs, chat tabs, preview tabs, new tabs)
      if (filePath.startsWith('ref:@') || filePath.startsWith('chat:') || filePath.startsWith('preview:') || filePath.startsWith('newtab:')) continue
      // DOCX files: trigger binary save via custom event
      if (filePath.endsWith('.docx')) {
        window.dispatchEvent(new CustomEvent('docx-save-now', { detail: { path: filePath } }))
        continue
      }
      const content = filesStore.fileContents[filePath]
      if (content !== undefined) {
        await filesStore.saveFile(filePath, content)
      }
    }

    // Stage all changes (freezes the snapshot)
    await gitAdd(workspace.path)

    // Check if there are actually changes to commit
    const status = await gitStatus(workspace.path)
    const hasChanges = status && status.trim().length > 0

    if (!hasChanges) {
      footerRef.value?.showCenterMessage(t('All saved (no changes)'))
      return
    }

    // Changes exist — show save confirmation in footer center
    const name = await footerRef.value?.beginSaveConfirmation()

    // Determine commit message
    let commitMessage
    if (name && name.trim()) {
      commitMessage = name.trim()
    } else {
      const now = new Date()
      const ts = now.toISOString().replace('T', ' ').slice(0, 16)
      commitMessage = t('Save: {ts}', { ts })
    }

    await gitCommit(workspace.path, commitMessage)
  } catch (e) {
    const errStr = String(e)
    if (errStr.includes('nothing to commit')) {
      footerRef.value?.showCenterMessage(t('All saved (no changes)'))
    } else {
      console.error('Save+commit error:', e)
      footerRef.value?.showSaveMessage(t('Saved (commit failed)'))
    }
  }
}

// Footer updates
function onCursorChange(pos) {
  footerRef.value?.setCursorPos(pos)
  if (pos.offset != null) editorStore.cursorOffset = pos.offset
}

function onEditorStats(stats) {
  footerRef.value?.setEditorStats(stats)
}

// Version history
function openVersionHistory(entry) {
  versionHistoryFile.value = entry.path
  versionHistoryVisible.value = true
}


</script>
