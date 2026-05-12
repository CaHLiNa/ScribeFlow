import { defineStore } from 'pinia'
import {
  createWorkspacePreferenceState,
} from '../domains/settings/workspacePreferencePresentation.js'
import {
  applyWorkspaceFontSizes,
  setWorkspaceEditorFontSize,
  setWorkspaceLatexFont,
  setWorkspaceMarkdownFont,
  setWorkspaceUiFont,
} from '../services/workspaceFonts.js'
import {
  loadWorkspacePreferences as loadWorkspacePreferencesFromRust,
  normalizeWorkspacePreferences as normalizeWorkspacePreferencesWithRust,
  saveWorkspacePreferences as saveWorkspacePreferencesToRust,
} from '../services/workspacePreferences'
import { restoreWorkspaceTheme } from '../services/workspaceTheme.js'
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
  dockDefaultPageForSurface,
  dockPageDefinitionsForSurface,
  dockPageIdsForSurface,
  loadWorkbenchDockPageContract,
} from '../services/workbenchDockPages'

const WORKSPACE_PREFERENCE_KEYS = [
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

function normalizeSettingsSectionValue(section = '') {
  const normalized = String(section || '').trim()
  return normalized || 'general'
}

function normalizeActivePrimarySurface(surface = '') {
  return String(surface || '').trim() === 'settings' ? 'settings' : 'workspace'
}

function normalizeLeftSidebarPanel(panel = '') {
  const normalized = String(panel || '').trim()
  return normalized === 'references' ? 'references' : 'files'
}

function restoreTransientSettingsSurface(store, section = null) {
  store.primarySurface = 'settings'
  store.settingsOpen = true
  store.settingsSection = normalizeSettingsSectionValue(section || store.settingsSection || 'general')
}

function snapshotWorkspacePreferences(store) {
  return Object.fromEntries(WORKSPACE_PREFERENCE_KEYS.map((key) => [key, store[key]]))
}

const WORKSPACE_LIFECYCLE_KEYS = [
  'recentWorkspaces',
  'lastWorkspace',
  'setupComplete',
  'reopenLastWorkspaceOnLaunch',
  'reopenLastSessionOnLaunch',
]

async function normalizeWorkspacePreferenceSnapshot(preferences = {}) {
  return normalizeWorkspacePreferencesWithRust(preferences)
}

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
    documentDockPageDefinitions: (state) =>
      dockPageDefinitionsForSurface(state.dockPageContract, 'document'),
    referenceDockPageDefinitions: (state) =>
      dockPageDefinitionsForSurface(state.dockPageContract, 'reference'),
    documentDockPageIds: (state) => dockPageIdsForSurface(state.dockPageContract, 'document'),
    referenceDockPageIds: (state) => dockPageIdsForSurface(state.dockPageContract, 'reference'),
    documentDockDefaultPage: (state) => dockDefaultPageForSurface(state.dockPageContract, 'document'),
    referenceDockDefaultPage: (state) => dockDefaultPageForSurface(state.dockPageContract, 'reference'),
  },

  actions: {
    applyWorkspacePreferenceState(preferences = {}) {
      const next = {
        ...snapshotWorkspacePreferences(this),
        ...preferences,
      }
      next.leftSidebarPanel = normalizeLeftSidebarPanel(next.leftSidebarPanel)

      for (const key of WORKSPACE_PREFERENCE_KEYS) {
        this[key] = next[key]
      }
      this.softWrap = true
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
      const previousSettingsSurface = this.settingsOpen
        ? {
            open: true,
            section: this.settingsSection,
          }
        : {
            open: false,
            section: null,
          }
      const optimistic = {
        ...previous,
        ...patch,
      }
      const normalizedOptimistic = await normalizeWorkspacePreferenceSnapshot(optimistic)

      this.applyWorkspacePreferenceState(normalizedOptimistic)
      if (previousSettingsSurface.open) {
        restoreTransientSettingsSurface(this, previousSettingsSurface.section)
      }
      this._preferencesHydrated = true

      try {
        const preferences = await saveWorkspacePreferencesToRust(globalConfigDir, normalizedOptimistic)
        this.applyWorkspacePreferenceState(preferences)
        if (previousSettingsSurface.open) {
          restoreTransientSettingsSurface(this, previousSettingsSurface.section)
        }
        this._preferencesHydrated = true
        return preferences
      } catch (error) {
        this.applyWorkspacePreferenceState(previous)
        if (previousSettingsSurface.open) {
          restoreTransientSettingsSurface(this, previousSettingsSurface.section)
        }
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
        restoreEditorSession: options.restoreEditorSession !== false,
        currentTree: Array.isArray(options.currentTree) ? options.currentTree : [],
        cachedRootExpandedDirs: Array.isArray(options.cachedRootExpandedDirs)
          ? options.cachedRootExpandedDirs
          : [],
        includeHidden: options.includeHidden !== false,
        hasCachedTree: options.hasCachedTree === true,
        displayPreferences: {
          showHidden: this.fileTreeShowHidden !== false,
          sortMode: this.fileTreeSortMode || 'name',
          foldDirectories: this.fileTreeFoldDirectories === true,
        },
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
        leftSidebarPanel: normalizeLeftSidebarPanel(panel),
      })
    },

    setRightSidebarPanel(panel) {
      return this.persistPreferences({
        rightSidebarPanel: String(panel || ''),
      })
    },

    async setPrimarySurface(surface) {
      const nextSurface = normalizeActivePrimarySurface(surface)
      this.primarySurface = nextSurface
      this.settingsOpen = nextSurface === 'settings'
      if (this.settingsOpen) {
        this.settingsSection = normalizeSettingsSectionValue(this.settingsSection || 'general')
      } else {
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
      restoreTransientSettingsSurface(this, section)
    },

    closeSettings() {
      this.primarySurface = 'workspace'
      this.settingsOpen = false
      this.settingsSection = null
    },

    setSettingsSection(section) {
      this.settingsSection = normalizeSettingsSectionValue(section)
    },

    setWrapColumn(value) {
      return this.persistPreferences({
        wrapColumn: value,
      })
    },

    setMarkdownPreviewSync(value) {
      return this.persistPreferences({
        markdownPreviewSync: value,
      })
    },

    setEditorSpellcheck(value) {
      return this.persistPreferences({
        editorSpellcheck: value,
      })
    },

    setEditorLineNumbers(value) {
      return this.persistPreferences({
        editorLineNumbers: value,
      })
    },

    setEditorHighlightActiveLine(value) {
      return this.persistPreferences({
        editorHighlightActiveLine: value,
      })
    },

    setFileTreeShowHidden(value) {
      return this.persistPreferences({
        fileTreeShowHidden: value,
      })
    },

    setFileTreeSortMode(value) {
      return this.persistPreferences({
        fileTreeSortMode: value,
      })
    },

    setFileTreeFoldDirectories(value) {
      return this.persistPreferences({
        fileTreeFoldDirectories: value,
      })
    },

    setPdfViewerZoomMode(value) {
      return this.persistPreferences({
        pdfViewerZoomMode: value,
      })
    },

    setPdfViewerSpreadMode(value) {
      return this.persistPreferences({
        pdfViewerSpreadMode: value,
      })
    },

    setPdfViewerLastScale(value) {
      return this.persistPreferences({
        pdfViewerLastScale: value,
      })
    },

    setPdfViewerPageThemeMode(value) {
      return this.persistPreferences({
        pdfViewerPageThemeMode: value,
      })
    },

    setMarkdownCitationFormat(value) {
      return this.persistPreferences({
        markdownCitationFormat: value,
      })
    },

    setLatexCitationCommand(value) {
      return this.persistPreferences({
        latexCitationCommand: value,
      })
    },

    setCitationInsertAddsSpace(value) {
      return this.persistPreferences({
        citationInsertAddsSpace: value,
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
        preferredLocale: value,
      })
      await this.restorePreferredLocale()
    },

    async restorePreferredLocale() {
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
