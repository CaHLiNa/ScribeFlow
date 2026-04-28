import { defineStore } from 'pinia'
import {
  applyWorkspaceFontSizes,
  createWorkspacePreferenceState,
  loadWorkspacePreferences as loadWorkspacePreferencesFromRust,
  restoreWorkspaceTheme,
  saveWorkspacePreferences as saveWorkspacePreferencesToRust,
  setWorkspaceCitationInsertAddsSpace,
  setWorkspaceEditorHighlightActiveLine,
  setWorkspaceEditorLineNumbers,
  setWorkspaceEditorSpellcheck,
  setWorkspaceEditorFontSize,
  setWorkspaceFileTreeFoldDirectories,
  setWorkspaceFileTreeShowHidden,
  setWorkspaceFileTreeSortMode,
  setWorkspaceLatexFont,
  setWorkspaceLatexCitationCommand,
  setWorkspaceMarkdownCitationFormat,
  setWorkspaceMarkdownFont,
  setWorkspaceMarkdownPreviewSync,
  setWorkspacePdfViewerLastScale,
  setWorkspacePdfViewerPageThemeMode,
  setWorkspacePdfViewerSpreadMode,
  setWorkspacePdfViewerZoomMode,
  setWorkspacePreferredLocale,
  setWorkspaceUiFont,
  setWrapColumnPreference,
} from '../services/workspacePreferences'
import { applyLocalePreference } from '../i18n'
import {
  createWorkspaceLifecycleState,
  getGlobalConfigDir,
  loadWorkspaceBootstrapData as loadWorkspaceBootstrapDataFromRust,
  loadWorkspaceLifecycleState as loadWorkspaceLifecycleStateFromRust,
  prepareWorkspaceClose,
  prepareWorkspaceOpen,
  resolveWorkspaceBootstrapPlan as resolveWorkspaceBootstrapPlanFromRust,
  saveWorkspaceLifecycleState as saveWorkspaceLifecycleStateToRust,
} from '../services/workspaceRecents'
import {
  createWorkbenchDockPageContract,
  dockPageDefinitionsForSurface,
  dockPageIdsForSurface,
  loadWorkbenchDockPageContract,
} from '../services/workbenchDockPages'

const WORKSPACE_PREFERENCE_KEYS = [
  'primarySurface',
  'leftSidebarOpen',
  'leftSidebarPanel',
  'rightSidebarOpen',
  'rightSidebarPanel',
  'documentDockOpen',
  'referenceDockOpen',
  'documentDockActivePage',
  'referenceDockActivePage',
  'autoSave',
  'wrapColumn',
  'editorFontSize',
  'uiFontSize',
  'preferredLocale',
  'markdownPreviewSync',
  'editorSpellcheck',
  'editorLineNumbers',
  'editorHighlightActiveLine',
  'fileTreeShowHidden',
  'fileTreeSortMode',
  'fileTreeFoldDirectories',
  'uiFont',
  'markdownFont',
  'latexFont',
  'pdfViewerZoomMode',
  'pdfViewerSpreadMode',
  'pdfViewerLastScale',
  'pdfViewerPageThemeMode',
  'markdownCitationFormat',
  'latexCitationCommand',
  'citationInsertAddsSpace',
  'theme',
]

function snapshotWorkspacePreferences(store) {
  return Object.fromEntries(WORKSPACE_PREFERENCE_KEYS.map((key) => [key, store[key]]))
}

function normalizeSettingsSectionValue(section = '') {
  const normalized = String(section || '').trim()
  return normalized || 'general'
}

function patchTouchesDockPreference(patch = {}) {
  return Object.prototype.hasOwnProperty.call(patch, 'rightSidebarOpen') ||
    Object.prototype.hasOwnProperty.call(patch, 'documentDockOpen') ||
    Object.prototype.hasOwnProperty.call(patch, 'referenceDockOpen') ||
    Object.prototype.hasOwnProperty.call(patch, 'leftSidebarPanel')
}

function normalizeDockPreferenceSnapshot(previous = {}, patch = {}) {
  const next = {
    ...previous,
    ...patch,
  }

  if (
    Object.prototype.hasOwnProperty.call(patch, 'rightSidebarOpen') &&
    !Object.prototype.hasOwnProperty.call(patch, 'documentDockOpen') &&
    !Object.prototype.hasOwnProperty.call(patch, 'referenceDockOpen')
  ) {
    const isOpen = patch.rightSidebarOpen === true
    if (next.leftSidebarPanel === 'references') {
      next.referenceDockOpen = isOpen
    } else {
      next.documentDockOpen = isOpen
    }
  }

  next.documentDockOpen = next.documentDockOpen === true
  next.referenceDockOpen = next.referenceDockOpen === true
  next.rightSidebarOpen = next.documentDockOpen || next.referenceDockOpen
  return next
}

const WORKSPACE_LIFECYCLE_KEYS = [
  'recentWorkspaces',
  'lastWorkspace',
  'setupComplete',
  'reopenLastWorkspaceOnLaunch',
  'reopenLastSessionOnLaunch',
]

function snapshotWorkspaceLifecycleState(store) {
  return Object.fromEntries(WORKSPACE_LIFECYCLE_KEYS.map((key) => [key, store[key]]))
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
    _preferencesHydrated: false,
    _dockPageContractHydrated: false,
    _lifecycleHydrated: false,
    dockPageContract: createWorkbenchDockPageContract(),
    ...createWorkspaceLifecycleState(),
    ...createWorkspacePreferenceState(),
  }),

  getters: {
    isOpen: (state) => !!state.path,
    isWorkspaceSurface: (state) => state.primarySurface === 'workspace',
    isSettingsSurface: (state) => state.primarySurface === 'settings',
    scribeflowDir: (state) => state.workspaceDataDir || null,
    projectDir: (state) => (state.workspaceDataDir ? `${state.workspaceDataDir}/project` : null),
    claudeDir: (state) => state.claudeConfigDir || null,
    claudeHooksDir: (state) =>
      state.globalConfigDir ? `${state.globalConfigDir}/claude-hooks` : null,
    legacyProjectDir: (state) => (state.path ? `${state.path}/.project` : null),
    legacyClaudeDir: (state) => (state.path ? `${state.path}/.claude` : null),
    documentDockPageDefinitions: (state) =>
      dockPageDefinitionsForSurface(state.dockPageContract, 'document'),
    referenceDockPageDefinitions: (state) =>
      dockPageDefinitionsForSurface(state.dockPageContract, 'reference'),
    documentDockPageIds: (state) => dockPageIdsForSurface(state.dockPageContract, 'document'),
    referenceDockPageIds: (state) => dockPageIdsForSurface(state.dockPageContract, 'reference'),
  },

  actions: {
    applyWorkspacePreferenceState(preferences = {}) {
      const next = {
        ...snapshotWorkspacePreferences(this),
        ...preferences,
      }

      for (const key of WORKSPACE_PREFERENCE_KEYS) {
        this[key] = next[key]
      }
      this.softWrap = true

      this.settingsOpen = this.primarySurface === 'settings'
      if (!this.settingsOpen) {
        this.settingsSection = null
      } else if (!this.settingsSection) {
        this.settingsSection = normalizeSettingsSectionValue('general')
      }
    },

    applyWorkspaceLifecycleState(state = {}) {
      const next = {
        ...snapshotWorkspaceLifecycleState(this),
        ...state,
      }

      for (const key of WORKSPACE_LIFECYCLE_KEYS) {
        this[key] = next[key]
      }
    },

    async ensureGlobalConfigDir() {
      if (this.globalConfigDir) return this.globalConfigDir

      try {
        this.globalConfigDir = await getGlobalConfigDir()
      } catch {
        this.globalConfigDir = ''
      }

      return this.globalConfigDir
    },

    async hydratePreferences(force = false) {
      if (!force && this._preferencesHydrated) return snapshotWorkspacePreferences(this)

      const globalConfigDir = await this.ensureGlobalConfigDir()
      const preferences = await loadWorkspacePreferencesFromRust(globalConfigDir)
      this.applyWorkspacePreferenceState(preferences)
      this._preferencesHydrated = true
      return preferences
    },

    async hydrateDockPageContract(force = false) {
      if (!force && this._dockPageContractHydrated) return this.dockPageContract

      this.dockPageContract = await loadWorkbenchDockPageContract().catch(() =>
        createWorkbenchDockPageContract()
      )
      this._dockPageContractHydrated = true
      return this.dockPageContract
    },

    hydrateWorkspaceRuntime(force = false) {
      return Promise.all([
        this.hydratePreferences(force),
        this.hydrateDockPageContract(force),
        this.hydrateLifecycleState(force),
      ])
    },

    async hydrateLifecycleState(force = false) {
      if (!force && this._lifecycleHydrated) return snapshotWorkspaceLifecycleState(this)

      const globalConfigDir = await this.ensureGlobalConfigDir()
      const state = await loadWorkspaceLifecycleStateFromRust(globalConfigDir)
      this.applyWorkspaceLifecycleState(state)
      this._lifecycleHydrated = true
      return state
    },

    async persistWorkspacePreferencesPatch(patch = {}) {
      const globalConfigDir = await this.ensureGlobalConfigDir()
      const previous = snapshotWorkspacePreferences(this)
      const optimistic = patchTouchesDockPreference(patch)
        ? normalizeDockPreferenceSnapshot(previous, patch)
        : {
            ...previous,
            ...patch,
          }

      this.applyWorkspacePreferenceState(optimistic)
      this._preferencesHydrated = true

      try {
        const preferences = await saveWorkspacePreferencesToRust(globalConfigDir, optimistic)
        this.applyWorkspacePreferenceState(preferences)
        this._preferencesHydrated = true
        return preferences
      } catch (error) {
        this.applyWorkspacePreferenceState(previous)
        throw error
      }
    },

    persistPreferences(patch = {}) {
      return this.persistWorkspacePreferencesPatch(patch)
    },

    async persistWorkspaceLifecyclePatch(patch = {}) {
      const globalConfigDir = await this.ensureGlobalConfigDir()
      const previous = snapshotWorkspaceLifecycleState(this)
      const optimistic = {
        ...previous,
        ...patch,
      }

      this.applyWorkspaceLifecycleState(optimistic)
      this._lifecycleHydrated = true

      try {
        const state = await saveWorkspaceLifecycleStateToRust(globalConfigDir, optimistic)
        this.applyWorkspaceLifecycleState(state)
        this._lifecycleHydrated = true
        return state
      } catch (error) {
        this.applyWorkspaceLifecycleState(previous)
        throw error
      }
    },

    persistLifecycleState(patch = {}) {
      return this.persistWorkspaceLifecyclePatch(patch)
    },

    async openWorkspace(path) {
      const prepared = await prepareWorkspaceOpen(this.globalConfigDir || '', path)

      this.path = String(prepared?.path || path || '')
      this.globalConfigDir = String(prepared?.globalConfigDir || this.globalConfigDir || '')
      this.workspaceId = String(prepared?.workspaceId || '')
      this.workspaceDataDir = String(prepared?.workspaceDataDir || '')
      this.claudeConfigDir = String(prepared?.claudeConfigDir || '')
      this._workspaceBootstrapGeneration += 1
      this._workspaceBootstrapPromise = null
      this.applyWorkspaceLifecycleState(prepared || {})
      this._lifecycleHydrated = true
    },

    trackWorkspaceBootstrap(promise = null) {
      this._workspaceBootstrapPromise = promise ? Promise.resolve(promise) : null
      return this._workspaceBootstrapPromise
    },

    async resolveWorkspaceBootstrapPlan(options = {}) {
      return resolveWorkspaceBootstrapPlanFromRust(options)
    },

    async loadWorkspaceBootstrapData(options = {}) {
      return loadWorkspaceBootstrapDataFromRust({
        globalConfigDir: this.globalConfigDir || '',
        workspaceDataDir: this.workspaceDataDir || '',
        workspacePath: this.path || '',
        legacyWorkspaceDataDir: options.legacyWorkspaceDataDir || this.workspaceDataDir || '',
        legacyProjectRoot: options.legacyProjectRoot || this.path || '',
        restoreEditorSession: options.restoreEditorSession !== false,
        currentTree: Array.isArray(options.currentTree) ? options.currentTree : [],
        cachedRootExpandedDirs: Array.isArray(options.cachedRootExpandedDirs)
          ? options.cachedRootExpandedDirs
          : [],
        includeHidden: options.includeHidden !== false,
        hasCachedTree: options.hasCachedTree === true,
      })
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

    async completeSetupWizard() {
      await this.persistLifecycleState({ setupComplete: true })
    },

    async closeWorkspace() {
      this._workspaceBootstrapGeneration += 1
      this._workspaceBootstrapPromise = null
      await prepareWorkspaceClose().catch(() => {})
      await this.cleanup()
      await this.openWorkspaceSurface()
      await this.persistLifecycleState({ lastWorkspace: '' })
      this.path = null
      this.globalConfigDir = ''
      this.workspaceId = ''
      this.workspaceDataDir = ''
      this.claudeConfigDir = ''
    },

    toggleLeftSidebar() {
      return this.persistPreferences({
        leftSidebarOpen: !this.leftSidebarOpen,
      })
    },

    setLeftSidebarPanel(panel) {
      return this.persistPreferences({
        leftSidebarPanel: String(panel || ''),
      })
    },

    setRightSidebarPanel(panel) {
      return this.persistPreferences({
        rightSidebarPanel: String(panel || ''),
      })
    },

    async setPrimarySurface(surface) {
      const nextSurface = String(surface || '').trim() || 'workspace'
      const preferences = await this.persistPreferences({
        primarySurface: nextSurface,
      })
      this.settingsOpen = preferences.primarySurface === 'settings'
      if (!this.settingsOpen) {
        this.settingsSection = null
      }
    },

    openWorkspaceSurface() {
      return this.setPrimarySurface('workspace')
    },

    toggleRightSidebar() {
      if (this.leftSidebarPanel === 'references') {
        return this.toggleReferenceDock()
      }
      return this.toggleDocumentDock()
    },

    openRightSidebar() {
      if (this.leftSidebarPanel === 'references') {
        return this.openReferenceDock()
      }
      return this.openDocumentDock()
    },

    closeRightSidebar() {
      if (this.leftSidebarPanel === 'references') {
        return this.closeReferenceDock()
      }
      return this.closeDocumentDock()
    },

    toggleDocumentDock() {
      return this.persistPreferences({
        documentDockOpen: !this.documentDockOpen,
      })
    },

    openDocumentDock() {
      if (this.documentDockOpen) return
      return this.persistPreferences({
        documentDockOpen: true,
      })
    },

    closeDocumentDock() {
      if (!this.documentDockOpen) return
      return this.persistPreferences({
        documentDockOpen: false,
      })
    },

    setDocumentDockActivePage(page) {
      return this.persistPreferences({
        documentDockActivePage: String(page || ''),
      })
    },

    toggleReferenceDock() {
      return this.persistPreferences({
        referenceDockOpen: !this.referenceDockOpen,
      })
    },

    openReferenceDock() {
      if (this.referenceDockOpen) return
      return this.persistPreferences({
        referenceDockOpen: true,
      })
    },

    closeReferenceDock() {
      if (!this.referenceDockOpen) return
      return this.persistPreferences({
        referenceDockOpen: false,
      })
    },

    setReferenceDockActivePage(page) {
      return this.persistPreferences({
        referenceDockActivePage: String(page || ''),
      })
    },

    toggleAutoSave() {
      return this.persistPreferences({
        autoSave: !this.autoSave,
      })
    },

    openSettings(section = null) {
      this.settingsSection = normalizeSettingsSectionValue(
        section || this.settingsSection || 'general'
      )
      return this.setPrimarySurface('settings')
    },

    closeSettings() {
      return this.openWorkspaceSurface()
    },

    setSettingsSection(section) {
      this.settingsSection = normalizeSettingsSectionValue(section)
    },

    setWrapColumn(value) {
      return this.persistPreferences({
        wrapColumn: setWrapColumnPreference(value),
      })
    },

    setMarkdownPreviewSync(value) {
      return this.persistPreferences({
        markdownPreviewSync: setWorkspaceMarkdownPreviewSync(value),
      })
    },

    setEditorSpellcheck(value) {
      return this.persistPreferences({
        editorSpellcheck: setWorkspaceEditorSpellcheck(value),
      })
    },

    setEditorLineNumbers(value) {
      return this.persistPreferences({
        editorLineNumbers: setWorkspaceEditorLineNumbers(value),
      })
    },

    setEditorHighlightActiveLine(value) {
      return this.persistPreferences({
        editorHighlightActiveLine: setWorkspaceEditorHighlightActiveLine(value),
      })
    },

    setFileTreeShowHidden(value) {
      return this.persistPreferences({
        fileTreeShowHidden: setWorkspaceFileTreeShowHidden(value),
      })
    },

    setFileTreeSortMode(value) {
      return this.persistPreferences({
        fileTreeSortMode: setWorkspaceFileTreeSortMode(value),
      })
    },

    setFileTreeFoldDirectories(value) {
      return this.persistPreferences({
        fileTreeFoldDirectories: setWorkspaceFileTreeFoldDirectories(value),
      })
    },

    setPdfViewerZoomMode(value) {
      return this.persistPreferences({
        pdfViewerZoomMode: setWorkspacePdfViewerZoomMode(value),
      })
    },

    setPdfViewerSpreadMode(value) {
      return this.persistPreferences({
        pdfViewerSpreadMode: setWorkspacePdfViewerSpreadMode(value),
      })
    },

    setPdfViewerLastScale(value) {
      return this.persistPreferences({
        pdfViewerLastScale: setWorkspacePdfViewerLastScale(value),
      })
    },

    setPdfViewerPageThemeMode(value) {
      return this.persistPreferences({
        pdfViewerPageThemeMode: setWorkspacePdfViewerPageThemeMode(value),
      })
    },

    setMarkdownCitationFormat(value) {
      return this.persistPreferences({
        markdownCitationFormat: setWorkspaceMarkdownCitationFormat(value),
      })
    },

    setLatexCitationCommand(value) {
      return this.persistPreferences({
        latexCitationCommand: setWorkspaceLatexCitationCommand(value),
      })
    },

    setCitationInsertAddsSpace(value) {
      return this.persistPreferences({
        citationInsertAddsSpace: setWorkspaceCitationInsertAddsSpace(value),
      })
    },

    applyFontSizes() {
      applyWorkspaceFontSizes(this.editorFontSize, this.uiFontSize)
    },

    async setEditorFontSize(value) {
      await this.persistPreferences({
        editorFontSize: setWorkspaceEditorFontSize(value),
      })
      this.applyFontSizes()
    },

    async setUiFont(name) {
      await this.persistPreferences({
        uiFont: name,
      })
      this.restoreUiFont()
    },

    restoreUiFont() {
      this.uiFont = setWorkspaceUiFont(this.uiFont)
    },

    async setMarkdownFont(name) {
      await this.persistPreferences({
        markdownFont: name,
      })
      this.restoreMarkdownFont()
    },

    restoreMarkdownFont() {
      this.markdownFont = setWorkspaceMarkdownFont(this.markdownFont)
    },

    async setLatexFont(name) {
      await this.persistPreferences({
        latexFont: name,
      })
      this.restoreLatexFont()
    },

    restoreLatexFont() {
      this.latexFont = setWorkspaceLatexFont(this.latexFont)
    },

    async setPreferredLocale(value) {
      await this.persistPreferences({
        preferredLocale: setWorkspacePreferredLocale(value),
      })
      await this.restorePreferredLocale()
    },

    async restorePreferredLocale() {
      this.preferredLocale = setWorkspacePreferredLocale(this.preferredLocale)
      await applyLocalePreference(this.preferredLocale)
    },

    setReopenLastWorkspaceOnLaunch(value) {
      return this.persistLifecycleState({
        reopenLastWorkspaceOnLaunch: value !== false,
      })
    },

    setReopenLastSessionOnLaunch(value) {
      return this.persistLifecycleState({
        reopenLastSessionOnLaunch: value !== false,
      })
    },

    async setTheme(name) {
      await this.persistPreferences({
        theme: name,
      })
      this.restoreTheme()
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
