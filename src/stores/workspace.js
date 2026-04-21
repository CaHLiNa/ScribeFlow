import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { removeWorkspaceBookmark } from '../services/workspacePermissions'
import {
  hashWorkspacePath,
  resolveClaudeConfigDir,
  resolveWorkspaceDataDir,
} from '../services/workspacePaths'
import {
  applyWorkspaceAppZoom,
  applyWorkspaceFontSizes,
  createWorkspacePreferenceState,
  decreaseWorkspaceZoom,
  increaseWorkspaceZoom,
  normalizeAppZoomPercent,
  normalizeEditorFontSize,
  persistStoredString,
  resetWorkspaceZoom,
  restoreWorkspaceTheme,
  setWorkspaceEditorFontSize,
  setWorkspacePdfCustomPageBackground,
  setWorkspacePdfPageBackgroundFollowsTheme,
  setWorkspaceProseFont,
  setWorkspaceTheme,
  setWorkspaceZoomPercent,
  setWrapColumnPreference,
  toggleStoredBoolean,
} from '../services/workspacePreferences'
import {
  normalizeWorkbenchSidebarPanel,
  normalizeWorkbenchSurface,
} from '../shared/workbenchSidebarPanels'
import { normalizeWorkbenchInspectorPanel } from '../shared/workbenchInspectorPanels.js'
import {
  addRecentWorkspace,
  clearLastWorkspace,
  getRecentWorkspaces as readRecentWorkspaces,
  removeRecentWorkspace,
  setLastWorkspace,
} from '../services/workspaceRecents'
import { basenamePath } from '../utils/path'

async function ensureDir(path) {
  if (!path) return
  await invoke('create_dir', { path }).catch(() => {})
}

async function bootstrapWorkspaceDirs(store) {
  await ensureDir(store.workspaceDataDir)
  await ensureDir(store.projectDir)

  await invoke('write_file', {
    path: `${store.workspaceDataDir}/workspace.json`,
    content: JSON.stringify(
        {
          id: store.workspaceId,
          path: store.path,
          name: basenamePath(store.path) || '',
          lastOpenedAt: new Date().toISOString(),
        },
      null,
      2
    ),
  }).catch(() => {})
}

function normalizeSettingsSectionValue(section = '') {
  const normalized = String(section || '').trim()
  return normalized || 'theme'
}

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({
    path: null,
    settingsOpen: false,
    settingsSection: null,
    globalConfigDir: '',
    workspaceId: '',
    workspaceDataDir: '',
    claudeConfigDir: '',
    _workspaceBootstrapPromise: null,
    _workspaceBootstrapGeneration: 0,
    _lastAppZoomInteractionAt: 0,
    ...createWorkspacePreferenceState(),
  }),

  getters: {
    isOpen: (state) => !!state.path,
    isWorkspaceSurface: (state) => normalizeWorkbenchSurface(state.primarySurface) === 'workspace',
    isSettingsSurface: (state) => normalizeWorkbenchSurface(state.primarySurface) === 'settings',
    scribeflowDir: (state) => state.workspaceDataDir || null,
    projectDir: (state) => (state.workspaceDataDir ? `${state.workspaceDataDir}/project` : null),
    claudeDir: (state) => state.claudeConfigDir || null,
    claudeHooksDir: (state) =>
      state.globalConfigDir ? `${state.globalConfigDir}/claude-hooks` : null,
    legacyProjectDir: (state) => (state.path ? `${state.path}/.project` : null),
    legacyClaudeDir: (state) => (state.path ? `${state.path}/.claude` : null),
  },

  actions: {
    async openWorkspace(path) {
      this.path = path
      this.settingsOpen = false
      this.settingsSection = null
      this.primarySurface = 'workspace'

      try {
        this.globalConfigDir = await invoke('get_global_config_dir')
      } catch {
        this.globalConfigDir = ''
      }

      this.workspaceId = this.globalConfigDir ? await hashWorkspacePath(path) : ''
      this.workspaceDataDir = resolveWorkspaceDataDir(this.globalConfigDir, this.workspaceId)
      this.claudeConfigDir = resolveClaudeConfigDir(this.globalConfigDir)

      this._workspaceBootstrapGeneration += 1
      const generation = this._workspaceBootstrapGeneration
      this._workspaceBootstrapPromise = bootstrapWorkspaceDirs(this).catch((error) => {
        if (generation !== this._workspaceBootstrapGeneration) return
        console.warn('[workspace] bootstrap failed:', error)
      })

      try {
        setLastWorkspace(path)
        this.addRecent(path)
      } catch {
        // Ignore local storage failures.
      }
    },

    async ensureWorkspaceBootstrapReady(path = this.path) {
      if (!path) return
      const promise = this._workspaceBootstrapPromise
      if (!promise) return
      await promise
      if (path !== this.path) {
        throw new Error('Workspace changed during bootstrap')
      }
    },

    getRecentWorkspaces() {
      return readRecentWorkspaces()
    },

    addRecent(path) {
      addRecentWorkspace(path)
    },

    removeRecent(path) {
      removeRecentWorkspace(path)
      removeWorkspaceBookmark(path)
    },

    async closeWorkspace() {
      this._workspaceBootstrapGeneration += 1
      this._workspaceBootstrapPromise = null
      await this.cleanup()
      this.openWorkspaceSurface()
      this.path = null
      this.globalConfigDir = ''
      this.workspaceId = ''
      this.workspaceDataDir = ''
      this.claudeConfigDir = ''
      clearLastWorkspace()
    },

    applyBrowserPreviewState(options = {}) {
      const isOpen = options.isOpen !== false
      this._workspaceBootstrapGeneration += 1
      this._workspaceBootstrapPromise = null

      this.path = isOpen ? String(options.path || this.path || '') : null
      this.globalConfigDir = isOpen ? String(options.globalConfigDir || this.globalConfigDir || '') : ''
      this.workspaceId = isOpen ? String(options.workspaceId || this.workspaceId || '') : ''
      this.workspaceDataDir = isOpen
        ? String(options.workspaceDataDir || this.workspaceDataDir || '')
        : ''
      this.claudeConfigDir = isOpen ? String(options.claudeConfigDir || this.claudeConfigDir || '') : ''

      const primarySurface = normalizeWorkbenchSurface(options.primarySurface || this.primarySurface || 'workspace')
      this.primarySurface = primarySurface
      this.settingsOpen = primarySurface === 'settings'
      this.settingsSection =
        primarySurface === 'settings'
          ? normalizeSettingsSectionValue(options.settingsSection || this.settingsSection || 'theme')
          : null

      this.leftSidebarOpen = isOpen ? options.leftSidebarOpen !== false : false
      this.leftSidebarPanel = normalizeWorkbenchSidebarPanel(
        primarySurface,
        options.leftSidebarPanel || this.leftSidebarPanel || 'files'
      )
      this.rightSidebarOpen = isOpen ? options.rightSidebarOpen === true : false
      this.rightSidebarPanel = normalizeWorkbenchInspectorPanel(
        primarySurface,
        options.rightSidebarPanel || this.rightSidebarPanel || 'outline'
      )
    },

    toggleLeftSidebar() {
      this.leftSidebarOpen = toggleStoredBoolean(this.leftSidebarOpen, 'leftSidebarOpen')
    },

    setLeftSidebarPanel(panel) {
      this.leftSidebarPanel = persistStoredString(
        'leftSidebarPanel',
        normalizeWorkbenchSidebarPanel(this.primarySurface, panel)
      )
    },

    setRightSidebarPanel(panel) {
      this.rightSidebarPanel = persistStoredString(
        'rightSidebarPanel',
        normalizeWorkbenchInspectorPanel(this.primarySurface, panel)
      )
    },

    setPrimarySurface(surface) {
      const normalizedSurface = normalizeWorkbenchSurface(surface)
      this.primarySurface = persistStoredString('primarySurface', normalizedSurface)
      this.leftSidebarPanel = persistStoredString(
        'leftSidebarPanel',
        normalizeWorkbenchSidebarPanel(normalizedSurface, this.leftSidebarPanel)
      )
      this.rightSidebarPanel = persistStoredString(
        'rightSidebarPanel',
        normalizeWorkbenchInspectorPanel(normalizedSurface, this.rightSidebarPanel)
      )
      this.settingsOpen = normalizedSurface === 'settings'
      if (normalizedSurface !== 'settings') {
        this.settingsSection = null
      }
    },

    openWorkspaceSurface() {
      this.setPrimarySurface('workspace')
    },

    toggleRightSidebar() {
      this.rightSidebarOpen = toggleStoredBoolean(this.rightSidebarOpen, 'rightSidebarOpen')
    },

    openRightSidebar() {
      if (this.rightSidebarOpen) return
      this.rightSidebarOpen = persistStoredString('rightSidebarOpen', true)
    },

    closeRightSidebar() {
      if (!this.rightSidebarOpen) return
      this.rightSidebarOpen = persistStoredString('rightSidebarOpen', false)
    },

    toggleAutoSave() {
      this.autoSave = toggleStoredBoolean(this.autoSave, 'autoSave')
    },

    openSettings(section = null) {
      this.settingsSection = normalizeSettingsSectionValue(
        section || this.settingsSection || 'theme'
      )
      this.setPrimarySurface('settings')
    },

    closeSettings() {
      this.openWorkspaceSurface()
    },

    setSettingsSection(section) {
      this.settingsSection = normalizeSettingsSectionValue(section)
    },

    toggleSoftWrap() {
      this.softWrap = toggleStoredBoolean(this.softWrap, 'softWrap')
    },

    setWrapColumn(value) {
      this.wrapColumn = setWrapColumnPreference(value)
    },

    setPdfCustomPageBackground(value) {
      this.pdfCustomPageBackground = setWorkspacePdfCustomPageBackground(value)
    },

    setPdfPageBackgroundFollowsTheme(value) {
      this.pdfPageBackgroundFollowsTheme = setWorkspacePdfPageBackgroundFollowsTheme(value)
    },

    async zoomIn() {
      this._lastAppZoomInteractionAt = Date.now()
      this.appZoomPercent = increaseWorkspaceZoom(this.appZoomPercent)
      await this.applyAppZoom()
    },

    async zoomOut() {
      this._lastAppZoomInteractionAt = Date.now()
      this.appZoomPercent = decreaseWorkspaceZoom(this.appZoomPercent)
      await this.applyAppZoom()
    },

    async resetZoom() {
      this._lastAppZoomInteractionAt = Date.now()
      this.appZoomPercent = resetWorkspaceZoom()
      await this.applyAppZoom()
    },

    async setZoomPercent(percent) {
      this._lastAppZoomInteractionAt = Date.now()
      this.appZoomPercent = setWorkspaceZoomPercent(percent)
      await this.applyAppZoom()
    },

    applyFontSizes() {
      applyWorkspaceFontSizes(this.editorFontSize, this.uiFontSize)
    },

    setEditorFontSize(value) {
      this.editorFontSize = setWorkspaceEditorFontSize(value)
    },

    async applyAppZoom() {
      this.appZoomPercent = normalizeAppZoomPercent(this.appZoomPercent)
      await applyWorkspaceAppZoom(this.appZoomPercent)
    },

    setProseFont(name) {
      this.proseFont = name
      setWorkspaceProseFont(name)
    },

    restoreProseFont() {
      this.setProseFont(this.proseFont)
    },

    normalizeEditorFontSize() {
      this.editorFontSize = normalizeEditorFontSize(this.editorFontSize)
    },

    setTheme(name) {
      this.theme = setWorkspaceTheme(name)
    },

    restoreTheme() {
      this.theme = restoreWorkspaceTheme(this.theme)
    },

    async cleanup() {
      this._workspaceBootstrapGeneration += 1
      this._workspaceBootstrapPromise = null
    },
  },
})
