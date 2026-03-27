import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getDefaultModelsConfig } from '../services/modelCatalog'
import { events } from '../services/telemetry'
import {
  loadWorkspaceUsage,
  openWorkspaceFileInEditor,
  reloadOpenFilesAfterPull,
} from '../services/workspaceStoreEffects'
import DEFAULT_SKILL_CONTENT from './defaultSkillContent.js'
import { removeWorkspaceBookmark } from '../services/workspacePermissions'
import {
  hashWorkspacePath,
  resolveClaudeConfigDir,
  resolveWorkspaceDataDir,
} from '../services/workspacePaths'
import {
  resolveGlobalReferenceFulltextDir,
  resolveGlobalReferenceLibraryPath,
  resolveGlobalReferencePdfsDir,
  resolveGlobalReferencesDir,
  resolveWorkspaceReferenceCollectionPath,
  resolveWorkspaceReferencesDir,
} from '../services/referenceLibraryPaths'
import {
  initProjectDir as bootstrapProjectDir,
  initWorkspaceDataDir as bootstrapWorkspaceDataDir,
  installEditHooks as installWorkspaceEditHooks,
  logWorkspaceBootstrapWarning,
} from '../services/workspaceBootstrap'
import {
  loadWorkspaceInstructions,
  migrateAutoInstructionsFile as migrateWorkspaceInstructionsFile,
  resolveInstructionsFileToOpen,
} from '../services/workspaceInstructions'
import {
  loadAiRuntimeConfig,
  loadGlobalKeys as loadWorkspaceGlobalKeys,
  loadModelsConfig as loadWorkspaceModelsConfig,
  loadSystemPrompt,
  loadToolPermissions as loadWorkspaceToolPermissions,
  loadWorkspaceSkillsManifest,
  migrateWorkspaceEnvKeys,
  saveGlobalKeys as saveWorkspaceGlobalKeys,
  saveModelsConfig as saveWorkspaceModelsConfig,
  saveToolPermissions as saveWorkspaceToolPermissions,
  syncWorkspaceProviderModels,
} from '../services/workspaceSettings'
import {
  connectWorkspaceGitHub,
  createDisconnectedGitHubState,
  disconnectWorkspaceGitHub,
  fetchWorkspaceRemoteChanges,
  linkWorkspaceRepo,
  loadWorkspaceGitHubSession,
  mapWorkspaceSyncState,
  runWorkspaceAutoSync,
  runWorkspaceSyncNow,
  unlinkWorkspaceRepo,
} from '../services/workspaceGitHub'
import {
  applyWorkspaceAppZoom,
  applyWorkspaceFontSizes,
  createWorkspacePreferenceState,
  decreaseWorkspaceZoom,
  increaseWorkspaceZoom,
  normalizeAppZoomPercent,
  persistStoredString,
  resetWorkspaceZoom,
  restoreWorkspaceTheme,
  setWorkspaceTheme,
  setWorkspaceProseFont,
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
import {
  canAutoCommitWorkspace,
  runWorkspaceAutoCommit as performWorkspaceAutoCommit,
} from '../services/workspaceAutoCommit'
import { createWorkspaceAutomationRuntime } from '../domains/workspace/workspaceAutomationRuntime'
import { createWorkspaceBootstrapRuntime } from '../domains/workspace/workspaceBootstrapRuntime'
import { createWorkspaceGitHubRuntime } from '../domains/workspace/workspaceGitHubRuntime'
import { createWorkspaceSettingsRuntime } from '../domains/workspace/workspaceSettingsRuntime'

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({
    path: null,
    settings: {},
    systemPrompt: '',
    instructions: '',
    apiKey: '',
    apiKeys: {},
    modelsConfig: null,
    aiRuntime: null,
    gitAutoCommitInterval: 5 * 60 * 1000, // 5 minutes
    gitAutoCommitTimer: null,
    settingsOpen: false,
    settingsSection: null,
    ...createWorkspacePreferenceState(),
    disabledTools: [],
    globalConfigDir: '',
    workspaceId: '',
    workspaceDataDir: '',
    claudeConfigDir: '',
    // GitHub sync
    githubToken: null,   // { token, login, name, email, id, avatarUrl }
    githubUser: null,
    githubInitialized: false,
    _githubInitPromise: null,
    syncStatus: 'disconnected', // idle | syncing | synced | error | conflict | disconnected
    syncError: null,
    syncErrorType: null, // auth | network | conflict | generic
    syncConflictBranch: null,
    lastSyncTime: null,
    remoteUrl: '',
    syncTimer: null,
    // Skills
    skillsManifest: null,  // Array<{ name, description, path }> | null
    _workspaceBootstrapPromise: null,
    _workspaceBootstrapGeneration: 0,
    _lastAppZoomInteractionAt: 0,
  }),

  getters: {
    isOpen: (state) => !!state.path,
    isWorkspaceSurface: (state) => state.primarySurface === 'workspace',
    isConversionSurface: (state) => state.primarySurface === 'conversion',
    isLibrarySurface: (state) => state.primarySurface === 'library',
    isAiSurface: (state) => state.primarySurface === 'ai',
    altalsDir: (state) => state.workspaceDataDir || null,
    shouldersDir: (state) => state.workspaceDataDir || null,
    projectDir: (state) => state.workspaceDataDir ? `${state.workspaceDataDir}/project` : null,
    globalReferencesDir: (state) => resolveGlobalReferencesDir(state.globalConfigDir),
    globalReferencesLibraryPath: (state) => resolveGlobalReferenceLibraryPath(state.globalConfigDir),
    globalReferencesPdfsDir: (state) => resolveGlobalReferencePdfsDir(state.globalConfigDir),
    globalReferencesFulltextDir: (state) => resolveGlobalReferenceFulltextDir(state.globalConfigDir),
    workspaceReferencesDir() {
      return resolveWorkspaceReferencesDir(this.projectDir)
    },
    workspaceReferenceCollectionPath() {
      return resolveWorkspaceReferenceCollectionPath(this.projectDir)
    },
    researchArtifactsPath: (state) => (
      state.workspaceDataDir ? `${state.workspaceDataDir}/project/research-artifacts.json` : null
    ),
    claudeDir: (state) => state.claudeConfigDir || null,
    claudeHooksDir: (state) => state.globalConfigDir ? `${state.globalConfigDir}/claude-hooks` : null,
    legacyShouldersDir: (state) => state.path ? `${state.path}/.shoulders` : null,
    legacyProjectDir: (state) => state.path ? `${state.path}/.project` : null,
    legacyClaudeDir: (state) => state.path ? `${state.path}/.claude` : null,
    instructionsFilePath: (state) => state.path ? `${state.path}/_instructions.md` : null,
    internalInstructionsPath: (state) => state.workspaceDataDir ? `${state.workspaceDataDir}/project/instructions.md` : null,
  },

  actions: {
    _getWorkspaceBootstrapRuntime() {
      if (!this._workspaceBootstrapRuntime) {
        this._workspaceBootstrapRuntime = createWorkspaceBootstrapRuntime({
          getPath: () => this.path,
          getCurrentBootstrapGeneration: () => this._workspaceBootstrapGeneration,
          getWorkspaceDataDir: () => this.workspaceDataDir,
          getInstructionsPaths: () => ({
            rootPath: this.instructionsFilePath,
            internalPath: this.internalInstructionsPath,
          }),
          getInstructionsUnlisten: () => this._instructionsUnlisten,
          setInstructionsUnlisten: (unlisten) => {
            this._instructionsUnlisten = unlisten
          },
          initWorkspaceDataDir: () => this.initWorkspaceDataDir(),
          initProjectDir: () => this.initProjectDir(),
          installEditHooks: () => this.installEditHooks(),
          loadSettings: () => this.loadSettings(),
          loadInstructions: () => this.loadInstructions(),
          canAutoCommit: (path) => this._getWorkspaceAutomationRuntime().canAutoCommit(path),
          startAutoCommit: () => this.startAutoCommit(),
          loadWorkspaceUsage,
          watchDirectory: (payload) => invoke('watch_directory', payload),
          listenToFsChange: (handler) => listen('fs-change', handler),
          logWorkspaceBootstrapWarning,
        })
      }
      return this._workspaceBootstrapRuntime
    },

    _getWorkspaceSettingsRuntime() {
      if (!this._workspaceSettingsRuntime) {
        this._workspaceSettingsRuntime = createWorkspaceSettingsRuntime({
          getShouldersDir: () => this.shouldersDir,
          getGlobalConfigDir: () => this.globalConfigDir,
          getProjectDir: () => this.projectDir,
          getInstructionsPaths: () => ({
            rootPath: this.instructionsFilePath,
            internalPath: this.internalInstructionsPath,
          }),
          getApiKeys: () => this.apiKeys,
          getModelsConfig: () => this.modelsConfig,
          getDisabledTools: () => this.disabledTools,
          setSystemPrompt: (value) => {
            this.systemPrompt = value || ''
          },
          setInstructions: (value) => {
            this.instructions = value || ''
          },
          setApiKeys: (value) => {
            this.apiKeys = value || {}
          },
          setApiKey: (value) => {
            this.apiKey = value || ''
          },
          setModelsConfig: (value) => {
            this.modelsConfig = value
          },
          setAiRuntime: (value) => {
            this.aiRuntime = value
          },
          setDisabledTools: (value) => {
            this.disabledTools = value || []
          },
          setSkillsManifest: (value) => {
            this.skillsManifest = value
          },
          loadSystemPrompt,
          loadWorkspaceInstructions,
          migrateWorkspaceInstructionsFile,
          resolveInstructionsFileToOpen,
          loadWorkspaceGlobalKeys,
          saveWorkspaceGlobalKeys,
          loadWorkspaceModelsConfig,
          saveWorkspaceModelsConfig,
          loadAiRuntimeConfig,
          loadWorkspaceToolPermissions,
          saveWorkspaceToolPermissions,
          loadWorkspaceSkillsManifest,
          migrateWorkspaceEnvKeys,
          syncWorkspaceProviderModels,
          getDefaultModelsConfig,
          openWorkspaceFileInEditor,
          onInstructionsMigrationError: (error) => {
            console.warn('Failed to migrate auto-generated instructions file:', error)
          },
        })
      }
      return this._workspaceSettingsRuntime
    },

    _getWorkspaceGitHubRuntime() {
      if (!this._workspaceGitHubRuntime) {
        this._workspaceGitHubRuntime = createWorkspaceGitHubRuntime({
          getPath: () => this.path,
          getRemoteUrl: () => this.remoteUrl,
          getGitHubToken: () => this.githubToken,
          getGitHubInitialized: () => this.githubInitialized,
          getGitHubInitPromise: () => this._githubInitPromise,
          setGitHubInitPromise: (promise) => {
            this._githubInitPromise = promise
          },
          patchState: (patch) => {
            Object.assign(this, patch)
          },
          createDisconnectedGitHubState,
          mapWorkspaceSyncState,
          loadWorkspaceGitHubSession,
          connectWorkspaceGitHub,
          disconnectWorkspaceGitHub,
          linkWorkspaceRepo,
          unlinkWorkspaceRepo,
          startSyncTimer: () => this.startSyncTimer(),
          stopSyncTimer: () => this.stopSyncTimer(),
          startAutoCommit: () => this.startAutoCommit(),
          autoSync: () => this.autoSync(),
          onInitError: (error) => {
            console.warn('[github] Init failed:', error)
          },
        })
      }
      return this._workspaceGitHubRuntime
    },

    _getWorkspaceAutomationRuntime() {
      if (!this._workspaceAutomationRuntime) {
        this._workspaceAutomationRuntime = createWorkspaceAutomationRuntime({
          getPath: () => this.path,
          getGitAutoCommitInterval: () => this.gitAutoCommitInterval,
          getGitAutoCommitTimer: () => this.gitAutoCommitTimer,
          setGitAutoCommitTimer: (timer) => {
            this.gitAutoCommitTimer = timer
          },
          getSyncTimer: () => this.syncTimer,
          setSyncTimer: (timer) => {
            this.syncTimer = timer
          },
          canAutoCommitWorkspace,
          performWorkspaceAutoCommit,
          ensureGitHubInitialized: (options = {}) => this.ensureGitHubInitialized(options),
          getGitHubToken: () => this.githubToken,
          getRemoteUrl: () => this.remoteUrl,
          setRemoteUrl: (remoteUrl) => {
            this.remoteUrl = remoteUrl || ''
          },
          applySyncState: (syncState, remoteUrl = this.remoteUrl) => this._getWorkspaceGitHubRuntime().applySyncState(syncState, remoteUrl),
          runWorkspaceAutoSync,
          fetchWorkspaceRemoteChanges,
          runWorkspaceSyncNow,
          reloadOpenFilesAfterPull,
          onAutoCommitError: (error) => {
            console.warn('Auto-commit failed:', error)
          },
        })
      }
      return this._workspaceAutomationRuntime
    },

    async openWorkspace(path) {
      this.openWorkspaceSurface()
      this.path = path

      // Resolve Altals global storage (~/.altals/)
      try { this.globalConfigDir = await invoke('get_global_config_dir') }
      catch { this.globalConfigDir = '' }
      this.workspaceId = this.globalConfigDir ? await hashWorkspacePath(path) : ''
      this.workspaceDataDir = resolveWorkspaceDataDir(this.globalConfigDir, this.workspaceId)
      this.claudeConfigDir = resolveClaudeConfigDir(this.globalConfigDir)
      await invoke('workspace_set_allowed_roots', {
        workspaceRoot: path,
        dataDir: this.workspaceDataDir || null,
        globalConfigDir: this.globalConfigDir || null,
        claudeConfigDir: this.claudeConfigDir || null,
      })
      this._workspaceBootstrapGeneration += 1
      const bootstrapGeneration = this._workspaceBootstrapGeneration
      this._workspaceBootstrapPromise = this._bootstrapWorkspace(path, bootstrapGeneration)
      this._workspaceBootstrapPromise.catch((error) => {
        if (bootstrapGeneration !== this._workspaceBootstrapGeneration || this.path !== path) return
        console.warn('[workspace] bootstrap failed:', error)
      })

      // Persist last workspace + add to recents
      try {
        setLastWorkspace(path)
        this.addRecent(path)
      } catch (e) { /* ignore */ }

      // Telemetry
      events.workspaceOpen()
    },

    async _bootstrapWorkspace(path, generation) {
      return this._getWorkspaceBootstrapRuntime().bootstrapWorkspace(path, generation)
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

    // Recent workspaces (persisted in localStorage, max 10)
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
      this.systemPrompt = ''
      this.instructions = ''
      this.apiKey = ''
      this.apiKeys = {}
      this.modelsConfig = null
      this.aiRuntime = null
      this.skillsManifest = null
      this.workspaceId = ''
      this.workspaceDataDir = ''
      this.claudeConfigDir = ''
      this.githubToken = null
      this.githubUser = null
      this.githubInitialized = false
      this._githubInitPromise = null
      this.syncStatus = 'disconnected'
      this.syncError = null
      this.syncErrorType = null
      this.syncConflictBranch = null
      this.lastSyncTime = null
      this.remoteUrl = ''
      this._workspaceBootstrapPromise = null
      clearLastWorkspace()
    },

    async initWorkspaceDataDir() {
      await bootstrapWorkspaceDataDir({
        altalsDir: this.shouldersDir,
        legacyDir: this.legacyShouldersDir,
        globalConfigDir: this.globalConfigDir,
        workspaceId: this.workspaceId,
        workspacePath: this.path,
        defaultModelsConfig: getDefaultModelsConfig(),
      })
    },

    async initProjectDir() {
      await bootstrapProjectDir({
        projectDir: this.projectDir,
        altalsDir: this.shouldersDir,
        legacyShouldersDir: this.legacyShouldersDir,
        legacyProjectDir: this.legacyProjectDir,
        defaultSkillContent: DEFAULT_SKILL_CONTENT,
        migrateAutoInstructions: () => this.migrateAutoInstructionsFile(),
      })
    },

    async installEditHooks() {
      await installWorkspaceEditHooks({
        claudeDir: this.claudeDir,
        hooksDir: this.claudeHooksDir,
        legacyClaudeDir: this.legacyClaudeDir,
        globalConfigDir: this.globalConfigDir,
      })
    },

    async loadSettings() {
      return this._getWorkspaceSettingsRuntime().loadSettings()
    },

    async loadSkillsManifest() {
      return this._getWorkspaceSettingsRuntime().loadSkillsManifest()
    },

    async loadGlobalKeys() {
      return this._getWorkspaceSettingsRuntime().loadGlobalKeys()
    },

    async saveGlobalKeys(keys) {
      return this._getWorkspaceSettingsRuntime().saveGlobalKeys(keys)
    },

    async saveModelsConfig(config) {
      return this._getWorkspaceSettingsRuntime().saveModelsConfig(config)
    },

    async syncProviderModels({ providerIds = null } = {}) {
      return this._getWorkspaceSettingsRuntime().syncProviderModels({ providerIds })
    },

    async migrateAutoInstructionsFile() {
      return this._getWorkspaceSettingsRuntime().migrateAutoInstructionsFile()
    },

    async loadInstructions() {
      return this._getWorkspaceSettingsRuntime().loadInstructions()
    },

    async openInstructionsFile() {
      return this._getWorkspaceSettingsRuntime().openInstructionsFile()
    },

    async loadToolPermissions() {
      return this._getWorkspaceSettingsRuntime().loadToolPermissions()
    },

    async saveToolPermissions() {
      return this._getWorkspaceSettingsRuntime().saveToolPermissions()
    },

    toggleTool(name) {
      const idx = this.disabledTools.indexOf(name)
      if (idx >= 0) {
        this.disabledTools.splice(idx, 1)
      } else {
        this.disabledTools.push(name)
      }
      this.saveToolPermissions()
    },

    toggleLeftSidebar() {
      this.leftSidebarOpen = toggleStoredBoolean(this.leftSidebarOpen, 'leftSidebarOpen')
    },

    setLeftSidebarPanel(panel) {
      const next = normalizeWorkbenchSidebarPanel(this.primarySurface, panel)
      this.leftSidebarPanel = persistStoredString('leftSidebarPanel', next)
    },

    setRightSidebarPanel(panel) {
      const next = normalizeWorkbenchInspectorPanel(this.primarySurface, panel)
      this.rightSidebarPanel = persistStoredString('rightSidebarPanel', next)
    },

    setPrimarySurface(surface) {
      const next = normalizeWorkbenchSurface(surface)
      this.primarySurface = persistStoredString('primarySurface', next)
      const nextPanel = normalizeWorkbenchSidebarPanel(next, this.leftSidebarPanel)
      this.leftSidebarPanel = persistStoredString('leftSidebarPanel', nextPanel)
      const nextInspectorPanel = normalizeWorkbenchInspectorPanel(next, this.rightSidebarPanel)
      this.rightSidebarPanel = persistStoredString('rightSidebarPanel', nextInspectorPanel)
    },

    openWorkspaceSurface() {
      this.setPrimarySurface('workspace')
    },

    openConversionSurface() {
      this.setPrimarySurface('conversion')
    },

    openLibrarySurface() {
      this.setPrimarySurface('library')
    },

    openAiSurface() {
      this.setPrimarySurface('ai')
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

    toggleBottomPanel() {
      this.bottomPanelOpen = toggleStoredBoolean(this.bottomPanelOpen, 'bottomPanelOpen')
    },

    toggleAutoSave() {
      this.autoSave = toggleStoredBoolean(this.autoSave, 'autoSave')
    },

    openBottomPanel() {
      if (!this.bottomPanelOpen) {
        this.bottomPanelOpen = persistStoredString('bottomPanelOpen', true)
      }
    },

    openSettings(section = null) {
      this.settingsSection = section
      this.settingsOpen = true
    },

    closeSettings() {
      this.settingsOpen = false
      this.settingsSection = null
    },

    setSelectedModelId(id) {
      this.selectedModelId = persistStoredString('lastModelId', id)
    },

    setGhostModelId(modelId) {
      this.ghostModelId = persistStoredString('ghostModelId', modelId)
    },

    setGhostEnabled(val) {
      this.ghostEnabled = persistStoredString('ghostEnabled', val)
    },

    toggleLivePreview() {
      this.livePreviewEnabled = toggleStoredBoolean(this.livePreviewEnabled, 'livePreviewEnabled')
    },

    toggleSoftWrap() {
      this.softWrap = toggleStoredBoolean(this.softWrap, 'softWrap')
    },

    setWrapColumn(n) {
      this.wrapColumn = setWrapColumnPreference(n)
    },

    toggleSpellcheck() {
      this.spellcheck = toggleStoredBoolean(this.spellcheck, 'spellcheck')
    },

    togglePdfThemedPages() {
      this.pdfThemedPages = toggleStoredBoolean(this.pdfThemedPages, 'pdfThemedPages')
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

    async setZoomPercent(pct) {
      this._lastAppZoomInteractionAt = Date.now()
      this.appZoomPercent = setWorkspaceZoomPercent(pct)
      await this.applyAppZoom()
    },

    applyFontSizes() {
      applyWorkspaceFontSizes(this.editorFontSize, this.uiFontSize)
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

    setTheme(name) {
      this.theme = name
      setWorkspaceTheme(name)
      events.themeChange(name)
    },

    restoreTheme() {
      const fallbackTheme = restoreWorkspaceTheme(this.theme)
      if (fallbackTheme) {
        this.setTheme(fallbackTheme)
      }
    },

    async startAutoCommit() {
      return this._getWorkspaceAutomationRuntime().startAutoCommit()
    },

    stopAutoCommit() {
      return this._getWorkspaceAutomationRuntime().stopAutoCommit()
    },

    async _canAutoCommitWorkspace(path = this.path) {
      return this._getWorkspaceAutomationRuntime().canAutoCommit(path)
    },

    async autoCommit() {
      return this._getWorkspaceAutomationRuntime().autoCommit()
    },

    // ── GitHub Sync ──

    async ensureGitHubInitialized(options = {}) {
      return this._getWorkspaceGitHubRuntime().ensureGitHubInitialized(options)
    },

    async initGitHub(options = {}) {
      return this._getWorkspaceGitHubRuntime().initGitHub(options)
    },

    startSyncTimer() {
      return this._getWorkspaceAutomationRuntime().startSyncTimer()
    },

    stopSyncTimer() {
      return this._getWorkspaceAutomationRuntime().stopSyncTimer()
    },

    async autoSync() {
      return this._getWorkspaceAutomationRuntime().autoSync()
    },

    async fetchRemoteChanges() {
      return this._getWorkspaceAutomationRuntime().fetchRemoteChanges()
    },

    async syncNow() {
      return this._getWorkspaceAutomationRuntime().syncNow()
    },

    _applySyncState(syncState, remoteUrl = this.remoteUrl) {
      return this._getWorkspaceGitHubRuntime().applySyncState(syncState, remoteUrl)
    },

    async connectGitHub(tokenData) {
      return this._getWorkspaceGitHubRuntime().connectGitHub(tokenData)
    },

    async disconnectGitHub() {
      return this._getWorkspaceGitHubRuntime().disconnectGitHub()
    },

    async linkRepo(cloneUrl) {
      return this._getWorkspaceGitHubRuntime().linkRepo(cloneUrl)
    },

    async unlinkRepo() {
      return this._getWorkspaceGitHubRuntime().unlinkRepo()
    },

    async cleanup() {
      this._workspaceBootstrapGeneration += 1
      this._workspaceBootstrapPromise = null
      this._getWorkspaceAutomationRuntime().cleanup()
      this._getWorkspaceBootstrapRuntime().clearInstructionsWatcher()
      this._workspaceBootstrapRuntime = null
      this._workspaceSettingsRuntime = null
      this._workspaceAutomationRuntime = null
      this._workspaceGitHubRuntime = null
      if (this.path) {
        await invoke('unwatch_directory').catch((error) => {
          console.warn('[workspace] unwatch_directory failed:', error)
        })
      }
    },
  },
})
