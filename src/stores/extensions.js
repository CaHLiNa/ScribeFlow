import { defineStore } from 'pinia'
import { useWorkspaceStore } from './workspace'
import { useEditorStore } from './editor'
import { useReferencesStore } from './references'
import { useExtensionWindowUiStore } from './extensionWindowUi'
import {
  listExtensions,
  loadExtensionSettings,
  saveExtensionSettings,
} from '../services/extensions/extensionRegistry'
import {
  executeExtensionCommand,
  invokeExtensionCapability,
} from '../services/extensions/extensionCommands'
import {
  cancelExtensionTask as cancelExtensionTaskWithBackend,
  cancelExtensionTasksForExtension as cancelExtensionTasksForExtensionWithBackend,
  getExtensionTask,
  listExtensionTasks,
} from '../services/extensions/extensionTasks'
import {
  openExtensionArtifact as openExtensionArtifactWithBackend,
  revealExtensionArtifact as revealExtensionArtifactWithBackend,
} from '../services/extensions/extensionArtifacts'
import { writeNativeClipboardText } from '../services/nativeClipboard'
import {
  resolveExtensionView,
  notifyExtensionViewSelection,
} from '../services/extensions/extensionViews'
import {
  activateExtensionHost,
  cancelExtensionWindowInputs,
  deactivateExtensionHost,
  loadExtensionHostStatus,
  updateExtensionHostSettings,
} from '../services/extensions/extensionHost'
import {
  listenExtensionTaskChanged,
  listenExtensionViewChanged,
  listenExtensionViewRevealRequested,
  listenExtensionViewStateChanged,
} from '../services/extensions/extensionHostEvents'
import { buildExtensionContext } from '../domains/extensions/extensionContext.js'
import { buildExtensionHostDiagnostics } from '../domains/extensions/extensionHostDiagnostics.js'
import {
  buildExtensionCommandBlockedError,
} from '../domains/extensions/extensionCommandHostState.js'
import {
  buildCommandPaletteCommandsForContext,
  buildTaskTimeline,
  commandHostStateFor,
  contributedViewForId,
  deferredViewRequestKey,
  buildExtensionViewState,
  buildKeybindingsForContext,
  buildMenuActionsForSurface,
  buildSidebarViewContainers,
  buildViewItemActionsForItem,
  buildViewsForContainer,
  buildViewTitleActionsForView,
  isPromptIsolationError,
  mergeResolvedViewState,
  normalizeCapability,
  normalizeExtension,
  normalizeExtensionId,
  normalizeHostSummary,
  normalizeResultEntry,
  normalizeRuntimeEntry,
  normalizeTarget,
  normalizeTask,
  normalizeWorkspaceRoot,
  panelIdMatchesExtension,
  recentTasksForExtensionList,
  runtimeBlockDescriptorFor,
  runtimeCapabilityIds,
  runtimeCommandIds,
  targetHasValue,
  viewKeyMatchesExtension,
} from '../domains/extensions/extensionStoreState.js'

export const useExtensionsStore = defineStore('extensions', {
  state: () => ({
    registry: [],
    tasks: [],
    enabledExtensionIds: [],
    extensionConfig: {},
    resolvedViews: {},
    viewState: {},
    viewControllerState: {},
    runtimeRegistry: {},
    hostSummary: normalizeHostSummary(),
    sidebarTargets: {},
    changedViewTicks: {},
    deferredViewRequests: {},
    _flushingDeferredViewRequests: false,
    loadingRegistry: false,
    loadingTasks: false,
    settingsHydrated: false,
    settingsFileExists: false,
    lastError: '',
    taskError: '',
  }),

  getters: {
    enabledExtensions(state) {
      const enabled = new Set(state.enabledExtensionIds.map(normalizeExtensionId))
      return state.registry.filter((extension) => enabled.has(extension.id))
    },
    actionsForSurface() {
      return (surface = '', context = {}) => this.menuActionsForSurface(surface, context)
    },
    menuActionsForSurface: (state) => (surface = '', context = {}) =>
      buildMenuActionsForSurface({
        registry: state.registry,
        enabledExtensionIds: state.enabledExtensionIds,
        runtimeRegistry: state.runtimeRegistry,
        surface,
        context,
      }),
    keybindingsForContext: (state) => (context = {}) =>
      buildKeybindingsForContext({
        registry: state.registry,
        enabledExtensionIds: state.enabledExtensionIds,
        context,
      }),
    commandPaletteCommandsForContext: (state) => (context = {}) =>
      buildCommandPaletteCommandsForContext({
        registry: state.registry,
        enabledExtensionIds: state.enabledExtensionIds,
        runtimeRegistry: state.runtimeRegistry,
        context,
      }),
    sidebarViewContainers(state) {
      return buildSidebarViewContainers({
        registry: state.registry,
        enabledExtensionIds: state.enabledExtensionIds,
      })
    },
    viewsForContainer: (state) => (containerId = '', context = {}) =>
      buildViewsForContainer({
        registry: state.registry,
        enabledExtensionIds: state.enabledExtensionIds,
        runtimeRegistry: state.runtimeRegistry,
        containerId,
        context,
      }),
    viewTitleActionsForView: (state) => (view = {}, context = {}) =>
      buildViewTitleActionsForView({
        registry: state.registry,
        enabledExtensionIds: state.enabledExtensionIds,
        runtimeRegistry: state.runtimeRegistry,
        view,
        context,
      }),
    viewItemActionsForItem: (state) => (view = {}, item = {}, context = {}) =>
      buildViewItemActionsForItem({
        registry: state.registry,
        enabledExtensionIds: state.enabledExtensionIds,
        runtimeRegistry: state.runtimeRegistry,
        view,
        item,
        context,
      }),
    resolvedViewFor: (state) => (viewKey = '') => state.resolvedViews[String(viewKey || '').trim()] || null,
    viewStateFor: (state) => (viewKey = '') => state.viewState[String(viewKey || '').trim()] || null,
    viewControllerStateFor: (state) => (viewKey = '') => state.viewControllerState[String(viewKey || '').trim()] || null,
    resolvedViewChildrenFor: (state) => (viewKey = '', parentItemId = '') => {
      const record = state.resolvedViews[String(viewKey || '').trim()]
      const parentItems = record?.parentItems && typeof record.parentItems === 'object'
        ? record.parentItems
        : {}
      const items = parentItems[String(parentItemId || '').trim()]
      return Array.isArray(items) ? items : []
    },
    viewRefreshTickFor: (state) => (viewKey = '') => state.changedViewTicks[String(viewKey || '').trim()] || 0,
    recentTasks(state) {
      return [...state.tasks].slice(0, 8)
    },
    recentTasksForExtension(state) {
      return (extensionId = '', workspaceRoot = useWorkspaceStore().path || '') => {
        return recentTasksForExtensionList(state.tasks, extensionId, workspaceRoot)
      }
    },
    taskTimelineForExtension(state) {
      return (extensionId = '', workspaceRoot = useWorkspaceStore().path || '') => {
        return buildTaskTimeline(recentTasksForExtensionList(state.tasks, extensionId, workspaceRoot))
      }
    },
    defaultConfigForExtension: () => (extension = {}) => {
      const defaults = {}
      const schema = extension.settingsSchema || {}
      for (const [key, definition] of Object.entries(schema)) {
        if (definition && Object.prototype.hasOwnProperty.call(definition, 'default')) {
          defaults[key] = definition.default
        }
      }
      return defaults
    },
    configForExtension: (state) => (extension = {}) => {
      const defaults = {}
      const schema = extension.settingsSchema || {}
      for (const [key, definition] of Object.entries(schema)) {
        if (definition && Object.prototype.hasOwnProperty.call(definition, 'default')) {
          defaults[key] = definition.default
        }
      }
      const saved = state.extensionConfig?.[normalizeExtensionId(extension.id)]
      return {
        ...defaults,
        ...(saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}),
      }
    },
    runtimeEntryFor: (state) => (extensionId = '') =>
      normalizeRuntimeEntry(state.runtimeRegistry?.[normalizeExtensionId(extensionId)]),
    hostStatus(state) {
      return normalizeHostSummary(state.hostSummary)
    },
    hostDiagnosticsFor(state) {
      return (extensionId = '', workspaceRoot = useWorkspaceStore().path || '') =>
        buildExtensionHostDiagnostics({
          extensionId,
          workspaceRoot,
          hostStatus: normalizeHostSummary(state.hostSummary),
          runtimeEntry: normalizeRuntimeEntry(state.runtimeRegistry?.[normalizeExtensionId(extensionId)]),
        })
    },
    sidebarTargetForPanel: (state) => (panelId = '', fallbackTarget = {}) => {
      const normalizedPanelId = String(panelId || '').trim()
      const storedTarget = state.sidebarTargets?.[normalizedPanelId]
      return targetHasValue(storedTarget)
        ? normalizeTarget(storedTarget)
        : normalizeTarget(fallbackTarget)
    },
    containerForPanelId() {
      return (panelId = '') => {
        const normalizedPanelId = String(panelId || '').trim()
        if (!normalizedPanelId) return null
        return this.sidebarViewContainers.find((container) => container.panelId === normalizedPanelId) || null
      }
    },
  },

  actions: {
    isExtensionEnabled(extensionId = '') {
      const id = normalizeExtensionId(extensionId)
      if (!id) return false
      return this.enabledExtensionIds.map(normalizeExtensionId).includes(id)
    },

    pruneExtensionRuntimeState(extensionId = '') {
      const id = normalizeExtensionId(extensionId)
      if (!id) return
      delete this.runtimeRegistry[id]
      for (const requestKey of Object.keys(this.deferredViewRequests || {})) {
        const request = this.deferredViewRequests[requestKey]
        if (normalizeExtensionId(request?.extensionId) === id) {
          delete this.deferredViewRequests[requestKey]
        }
      }

      for (const viewKey of Object.keys(this.resolvedViews)) {
        if (viewKeyMatchesExtension(viewKey, id)) {
          delete this.resolvedViews[viewKey]
        }
      }
      for (const viewKey of Object.keys(this.viewState)) {
        if (viewKeyMatchesExtension(viewKey, id)) {
          delete this.viewState[viewKey]
        }
      }
      for (const viewKey of Object.keys(this.viewControllerState)) {
        if (viewKeyMatchesExtension(viewKey, id)) {
          delete this.viewControllerState[viewKey]
        }
      }
      for (const viewKey of Object.keys(this.changedViewTicks)) {
        if (viewKeyMatchesExtension(viewKey, id)) {
          delete this.changedViewTicks[viewKey]
        }
      }
      for (const [panelId, target] of Object.entries(this.sidebarTargets)) {
        if (panelIdMatchesExtension(this.registry, panelId, id)) {
          delete this.sidebarTargets[panelId]
        } else if (String(target?.extensionId || '').trim().toLowerCase() === id) {
          delete this.sidebarTargets[panelId]
        }
      }
    },

    resetWorkspaceSessionState() {
      this.resolvedViews = {}
      this.viewState = {}
      this.viewControllerState = {}
      this.runtimeRegistry = {}
      this.hostSummary = normalizeHostSummary()
      this.sidebarTargets = {}
      this.changedViewTicks = {}
      this.deferredViewRequests = {}
      this._flushingDeferredViewRequests = false
      this.loadingTasks = false
      this.tasks = []
      this.lastError = ''
      this.taskError = ''
    },

    snapshotSettings() {
      return {
        enabledExtensionIds: [...this.enabledExtensionIds],
        extensionConfig: { ...this.extensionConfig },
      }
    },

    setSidebarTarget(panelId = '', target = {}) {
      const normalizedPanelId = String(panelId || '').trim()
      const normalizedTarget = normalizeTarget(target)
      if (!normalizedPanelId || !targetHasValue(normalizedTarget)) return null
      this.sidebarTargets = {
        ...this.sidebarTargets,
        [normalizedPanelId]: normalizedTarget,
      }
      return normalizedTarget
    },

    resolveContainerForViewId(extensionId = '', viewId = '') {
      const normalizedExtensionId = normalizeExtensionId(extensionId)
      const normalizedViewId = String(viewId || '').trim()
      if (!normalizedExtensionId || !normalizedViewId) return null
      const extension = this.registry.find((entry) => entry.id === normalizedExtensionId)
      if (!extension) return null
      const contributedView = contributedViewForId(extension, normalizedViewId)
      if (!contributedView?.containerId) return null
      return this.sidebarViewContainers.find((container) =>
        container.extensionId === normalizedExtensionId &&
        container.id === String(contributedView.containerId || '').trim()
      ) || null
    },

    resolveContainerForAction(action = {}, target = {}) {
      const extensionId = normalizeExtensionId(action.extensionId)
      if (!extensionId) return null

      const explicitPanelId = String(action.panelId || '').trim()
      if (explicitPanelId) {
        return this.containerForPanelId(explicitPanelId)
      }

      const explicitContainerId = String(action.containerId || '').trim()
      if (explicitContainerId) {
        return this.sidebarViewContainers.find((container) =>
          container.extensionId === extensionId && container.id === explicitContainerId
        ) || null
      }

      const resolvedFromView = this.resolveContainerForViewId(extensionId, action.viewId)
      if (resolvedFromView) return resolvedFromView

      const candidateContainers = this.sidebarViewContainers.filter(
        (container) => container.extensionId === extensionId,
      )
      if (candidateContainers.length <= 1) {
        return candidateContainers[0] || null
      }

      const workspace = useWorkspaceStore()
      for (const container of candidateContainers) {
        const context = buildExtensionContext(normalizeTarget(target), {
          workbench: {
            surface: workspace.isSettingsSurface ? 'settings' : 'workspace',
            panel: 'documentDock',
            activeView: container.panelId,
            hasWorkspace: workspace.isOpen,
            workspaceFolder: workspace.path || '',
          },
        })
        if (this.viewsForContainer(container.id, context).length > 0) {
          return container
        }
      }

      return candidateContainers[0] || null
    },

    async focusSidebarContainer(panelId = '', target = {}) {
      const normalizedPanelId = String(panelId || '').trim()
      if (!normalizedPanelId) return ''
      const workspace = useWorkspaceStore()
      if (workspace.isSettingsSurface) {
        await workspace.openWorkspaceSurface().catch(() => {})
      }
      if (workspace.leftSidebarPanel === 'references') {
        await workspace.setLeftSidebarPanel('files').catch(() => {})
      }
      this.setSidebarTarget(normalizedPanelId, target)
      await workspace.openDocumentDock().catch(() => {})
      await workspace.setDocumentDockActivePage(normalizedPanelId).catch(() => {})
      return normalizedPanelId
    },

    async routeActionToSidebar(action = {}, target = {}) {
      const container = this.resolveContainerForAction(action, target)
      if (!container?.panelId) return null
      await this.focusSidebarContainer(container.panelId, target)
      return container
    },

    async hydrateSettings(force = false, options = {}) {
      if (!force && this.settingsHydrated) return this.snapshotSettings()
      const workspace = useWorkspaceStore()
      const globalConfigDir = await workspace.ensureGlobalConfigDir()
      const settings = await loadExtensionSettings(globalConfigDir, workspace.path || '', {
        hydrateSecrets: options?.hydrateSecrets === true,
      })
      this.enabledExtensionIds = Array.isArray(settings?.enabledExtensionIds)
        ? settings.enabledExtensionIds.map(normalizeExtensionId).filter(Boolean)
        : []
      this.extensionConfig = settings?.extensionConfig && typeof settings.extensionConfig === 'object'
        ? { ...settings.extensionConfig }
        : {}
      this.settingsFileExists = Boolean(settings?.settingsExists)
      this.settingsHydrated = true
      return this.snapshotSettings()
    },

    async persistSettings(patch = {}) {
      const workspace = useWorkspaceStore()
      const globalConfigDir = await workspace.ensureGlobalConfigDir()
      const next = {
        ...this.snapshotSettings(),
        ...patch,
      }
      const saved = await saveExtensionSettings(globalConfigDir, workspace.path || '', next)
      this.enabledExtensionIds = Array.isArray(saved?.enabledExtensionIds)
        ? saved.enabledExtensionIds.map(normalizeExtensionId).filter(Boolean)
        : []
      this.extensionConfig = saved?.extensionConfig && typeof saved.extensionConfig === 'object'
        ? { ...saved.extensionConfig }
        : {}
      this.settingsFileExists = true
      this.settingsHydrated = true
      return this.snapshotSettings()
    },

    async refreshRegistry(options = {}) {
      const forceSettingsReload = options?.forceSettingsReload === true
      const workspace = useWorkspaceStore()
      const globalConfigDir = await workspace.ensureGlobalConfigDir()
      this.loadingRegistry = true
      this.lastError = ''
      try {
        const extensions = await listExtensions(globalConfigDir, workspace.path || '')
        this.registry = extensions.map(normalizeExtension)
        if (forceSettingsReload || !this.settingsHydrated) {
          await this.hydrateSettings(forceSettingsReload)
        }
        if (!this.settingsFileExists && this.enabledExtensionIds.length === 0) {
          const availableIds = this.registry
            .filter((extension) => extension.status === 'available')
            .map((extension) => extension.id)
          if (availableIds.length > 0) {
            await this.persistSettings({ enabledExtensionIds: availableIds })
          }
        }
        await this.refreshHostSummary().catch(() => {})
        return this.registry
      } catch (error) {
        this.lastError = error?.message || String(error || '')
        throw error
      } finally {
        this.loadingRegistry = false
      }
    },

    async refreshRegistryAndTasks(options = {}) {
      const registry = await this.refreshRegistry(options)
      await this.refreshTasks()
      return {
        registry,
        tasks: this.tasks,
      }
    },

    async refreshTasks() {
      const workspace = useWorkspaceStore()
      this.loadingTasks = true
      this.taskError = ''
      try {
        this.tasks = (await listExtensionTasks(workspace.path || '')).map(normalizeTask)
        return this.tasks
      } catch (error) {
        this.taskError = error?.message || String(error || '')
        throw error
      } finally {
        this.loadingTasks = false
      }
    },

    async refreshHostSummary() {
      this.hostSummary = normalizeHostSummary(await loadExtensionHostStatus())
      return this.hostSummary
    },

    async syncHostSummaryAfterPromptEvent() {
      return this.refreshHostSummary().catch(() => this.hostStatus)
    },

    async cancelPendingPromptForExtension(extensionId = '', workspaceRoot = useWorkspaceStore().path || '') {
      const id = normalizeExtensionId(extensionId)
      const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot)
      if (!id || !normalizedWorkspaceRoot) return this.hostStatus
      const extensionWindowUi = useExtensionWindowUiStore()
      const pendingRequestExtensionId = normalizeExtensionId(extensionWindowUi.pendingRequest?.extensionId || '')
      const pendingRequestWorkspaceRoot = normalizeWorkspaceRoot(extensionWindowUi.pendingRequest?.workspaceRoot || '')
      const requestMatches =
        extensionWindowUi.visible &&
        pendingRequestExtensionId === id &&
        pendingRequestWorkspaceRoot === normalizedWorkspaceRoot

      if (requestMatches) {
        await extensionWindowUi.cancel().catch(() => {})
      } else {
        await cancelExtensionWindowInputs({
          extensionId: id,
          workspaceRoot: normalizedWorkspaceRoot,
        }).catch(() => {})
      }

      await this.syncHostSummaryAfterPromptEvent().catch(() => {})
      await this.flushDeferredViewRequests().catch(() => {})
      return this.hostStatus
    },

    async restartExtensionRuntime(extensionId = '', workspaceRoot = useWorkspaceStore().path || '') {
      const id = normalizeExtensionId(extensionId)
      const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot)
      if (!id || !normalizedWorkspaceRoot) return null

      const summary = await this.refreshHostSummary().catch(() => this.hostStatus)
      const activeSlot = Array.isArray(summary?.activeRuntimeSlots)
        ? summary.activeRuntimeSlots.find(
          (entry) => entry.extensionId === id && entry.workspaceRoot === normalizedWorkspaceRoot,
        )
        : null

      if (activeSlot || this.runtimeRegistry[id]?.activated) {
        await deactivateExtensionHost({
          extensionId: id,
          workspaceRoot: normalizedWorkspaceRoot,
        }).catch(() => {})
      }

      this.pruneExtensionRuntimeState(id)
      const runtimeEntry = await this.activateExtension(id, '').catch(() => null)
      await this.refreshTasks().catch(() => {})
      await this.refreshHostSummary().catch(() => {})
      return runtimeEntry
    },

    async teardownWorkspaceRuntimeSlots(workspaceRoot = useWorkspaceStore().path || '') {
      const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot)
      if (!normalizedWorkspaceRoot) return []
      const summary = await this.refreshHostSummary().catch(() => this.hostStatus)
      const slots = Array.isArray(summary?.activeRuntimeSlots)
        ? summary.activeRuntimeSlots.filter((entry) => entry.workspaceRoot === normalizedWorkspaceRoot)
        : []
      for (const slot of slots) {
        await deactivateExtensionHost({
          extensionId: slot.extensionId,
          workspaceRoot: normalizedWorkspaceRoot,
        }).catch(() => {})
        this.pruneExtensionRuntimeState(slot.extensionId)
      }
      await this.refreshHostSummary().catch(() => {})
      return slots
    },

    async setExtensionEnabled(extensionId = '', enabled = true) {
      const id = normalizeExtensionId(extensionId)
      const ids = new Set(this.enabledExtensionIds.map(normalizeExtensionId))
      if (enabled) {
        ids.add(id)
      } else {
        ids.delete(id)
      }
      const snapshot = await this.persistSettings({ enabledExtensionIds: [...ids] })
      if (enabled) {
        await this.activateExtension(id, '').catch(() => {})
      } else {
        const extensionWindowUi = useExtensionWindowUiStore()
        const workspace = useWorkspaceStore()
        const workspaceRoot = workspace.path || ''
        if (String(extensionWindowUi.pendingRequest?.extensionId || '').trim().toLowerCase() === id) {
          extensionWindowUi.clearRequest()
        }
        await cancelExtensionWindowInputs({ extensionId: id, workspaceRoot }).catch(() => {})
        const cancelledTasks = await cancelExtensionTasksForExtensionWithBackend(id, workspaceRoot).catch(() => [])
        for (const task of cancelledTasks) {
          this.upsertTask(task)
        }
        if (this.runtimeRegistry[id]?.activated) {
          await deactivateExtensionHost({ extensionId: id, workspaceRoot }).catch(() => {})
        }
        this.pruneExtensionRuntimeState(id)
        await this.refreshHostSummary().catch(() => {})
      }
      return snapshot
    },

    async setExtensionConfigValue(extensionId = '', key = '', value = '') {
      const id = normalizeExtensionId(extensionId)
      const configKey = String(key || '').trim()
      if (!id || !configKey) return this.snapshotSettings()
      const current = this.extensionConfig?.[id] && typeof this.extensionConfig[id] === 'object'
        ? this.extensionConfig[id]
        : {}
      const nextExtensionConfig = {
        ...this.extensionConfig,
        [id]: {
          ...current,
          [configKey]: value,
        },
      }
      const snapshot = await this.persistSettings({ extensionConfig: nextExtensionConfig })
      const extension = this.registry.find((entry) => entry.id === id)
      if (extension && this.runtimeRegistry[id]?.activated) {
        const workspace = useWorkspaceStore()
        const globalConfigDir = await workspace.ensureGlobalConfigDir()
        await updateExtensionHostSettings({
          globalConfigDir,
          workspaceRoot: workspace.path || '',
          extensionId: id,
          settings: this.configForExtension(extension),
        }).catch(() => {})
      }
      return snapshot
    },
    async activateExtension(extensionId = '', activationEvent = '*') {
      const id = normalizeExtensionId(extensionId)
      if (!id) return null
      if (!this.isExtensionEnabled(id)) return null
      const extension = this.registry.find((entry) => entry.id === id)
      if (!extension || extension.status !== 'available') return null
      const workspace = useWorkspaceStore()
      const globalConfigDir = await workspace.ensureGlobalConfigDir()
      const result = await activateExtensionHost({
        globalConfigDir,
        workspaceRoot: workspace.path || '',
        extensionId: id,
        activationEvent,
      })
      this.runtimeRegistry[id] = normalizeRuntimeEntry(result)
      await this.refreshHostSummary().catch(() => {})
      return this.runtimeRegistry[id]
    },
    async activateEnabledExtensions() {
      const enabled = new Set(this.enabledExtensionIds.map(normalizeExtensionId))
      for (const extension of this.registry) {
        if (!enabled.has(extension.id) || extension.status !== 'available') continue
        await this.activateExtension(extension.id, '').catch(() => {})
      }
    },
    async executeCommand(action = {}, target = {}, settings = {}) {
      const extensionId = normalizeExtensionId(action.extensionId)
      const commandId = String(action.commandId || action.command || action.id || '').trim()
      if (!this.isExtensionEnabled(extensionId)) {
        throw new Error(`Extension command is disabled: ${extensionId || commandId}`)
      }
      const extension = this.registry.find((extension) => extension.id === extensionId)
      if (!extension || extension.status !== 'available') {
        throw new Error(`Extension command is not available: ${extensionId || commandId}`)
      }
      const workspace = useWorkspaceStore()
      const workspaceRoot = workspace.path || ''
      const preflightSummary = await this.refreshHostSummary().catch(() => this.hostStatus)
      const hostState = commandHostStateFor({
        extensionId,
        workspaceRoot,
        hostSummary: preflightSummary,
        runtimeEntry: this.runtimeRegistry?.[extensionId],
      })
      if (hostState.blocked) {
        throw buildExtensionCommandBlockedError(hostState, {
          extensionId,
          commandId,
        })
      }
      await this.routeActionToSidebar(action, target).catch(() => {})
      await this.activateExtension(extensionId, `onCommand:${commandId}`).catch(() => {})
      const postActivationSummary = await this.refreshHostSummary().catch(() => this.hostStatus)
      const postActivationHostState = commandHostStateFor({
        extensionId,
        workspaceRoot,
        hostSummary: postActivationSummary,
        runtimeEntry: this.runtimeRegistry?.[extensionId],
      })
      if (postActivationHostState.blocked) {
        throw buildExtensionCommandBlockedError(postActivationHostState, {
          extensionId,
          commandId,
        })
      }
      const runtimeCommands = runtimeCommandIds(this.runtimeRegistry?.[extensionId])
      const manifestCommands = new Set(
        (extension.contributedCommands || []).map((command) => String(command.commandId || '').trim()).filter(Boolean),
      )
      if (runtimeCommands.size > 0) {
        if (!runtimeCommands.has(commandId)) {
          throw new Error(`Extension ${extensionId} does not register command ${commandId} at runtime`)
        }
      } else if (!manifestCommands.has(commandId)) {
        throw new Error(`Extension ${extensionId} does not contribute command ${commandId}`)
      }
      const globalConfigDir = await workspace.ensureGlobalConfigDir()
      const extensionSettings = this.configForExtension(extension)
      const result = await executeExtensionCommand({
        globalConfigDir,
        workspaceRoot: workspace.path || '',
        extensionId,
        commandId,
        itemId: String(action.itemId || ''),
        itemHandle: String(action.itemHandle || ''),
        target,
        settings: {
          ...extensionSettings,
          ...(settings && typeof settings === 'object' ? settings : {}),
        },
      })
      const task = this.upsertTask(result?.task || {})
      if (task && Array.isArray(result?.resultEntries)) {
        task.resultEntries = result.resultEntries.map((entry, index) => normalizeResultEntry(entry, index))
      }
      this.markViewsChanged(result?.changedViews, extensionId)
      return task
    },
    async invokeCapability(action = {}, target = {}, settings = {}) {
      const extensionId = normalizeExtensionId(action.extensionId)
      const capabilityId = normalizeCapability(action.capabilityId || action.capability || action.id || '')
      if (!this.isExtensionEnabled(extensionId)) {
        throw new Error(`Extension capability is disabled: ${extensionId || capabilityId}`)
      }
      const extension = this.registry.find((entry) => entry.id === extensionId)
      if (!extension || extension.status !== 'available') {
        throw new Error(`Extension capability is not available: ${extensionId || capabilityId}`)
      }
      if (!capabilityId) {
        throw new Error('Extension capability id is required')
      }
      const workspace = useWorkspaceStore()
      const workspaceRoot = workspace.path || ''
      const preflightBlock = runtimeBlockDescriptorFor({
        extensionId,
        workspaceRoot,
        hostSummary: await this.refreshHostSummary().catch(() => this.hostStatus),
        runtimeEntry: this.runtimeRegistry?.[extensionId],
      })
      if (preflightBlock.blocked) {
        throw buildExtensionCommandBlockedError(preflightBlock, {
          extensionId,
          commandId: capabilityId,
        })
      }
      await this.routeActionToSidebar(action, target).catch(() => {})
      await this.activateExtension(extensionId, `onCapability:${capabilityId}`).catch(() => {})
      const postActivationBlock = runtimeBlockDescriptorFor({
        extensionId,
        workspaceRoot,
        hostSummary: await this.refreshHostSummary().catch(() => this.hostStatus),
        runtimeEntry: this.runtimeRegistry?.[extensionId],
      })
      if (postActivationBlock.blocked) {
        throw buildExtensionCommandBlockedError(postActivationBlock, {
          extensionId,
          commandId: capabilityId,
        })
      }
      const runtimeCapabilities = runtimeCapabilityIds(this.runtimeRegistry?.[extensionId])
      const manifestCapabilities = new Set(
        (extension.contributedCapabilities || [])
          .map((capability) => normalizeCapability(capability?.id))
          .filter(Boolean),
      )
      if (runtimeCapabilities.size > 0) {
        if (!runtimeCapabilities.has(capabilityId)) {
          throw new Error(`Extension ${extensionId} does not register capability ${capabilityId} at runtime`)
        }
      } else if (!manifestCapabilities.has(capabilityId)) {
        throw new Error(`Extension ${extensionId} does not contribute capability ${capabilityId}`)
      }
      const globalConfigDir = await workspace.ensureGlobalConfigDir()
      const extensionSettings = this.configForExtension(extension)
      const result = await invokeExtensionCapability({
        globalConfigDir,
        workspaceRoot: workspace.path || '',
        extensionId,
        capabilityId,
        itemId: String(action.itemId || ''),
        itemHandle: String(action.itemHandle || ''),
        target,
        settings: {
          ...extensionSettings,
          ...(settings && typeof settings === 'object' ? settings : {}),
        },
      })
      const task = this.upsertTask(result?.task || {})
      if (task && Array.isArray(result?.resultEntries)) {
        task.resultEntries = result.resultEntries.map((entry, index) => normalizeResultEntry(entry, index))
      }
      this.markViewsChanged(result?.changedViews, extensionId)
      return task
    },
    async resolveView(view = {}, target = {}, settings = {}, parentItemId = '') {
      const extensionId = normalizeExtensionId(view.extensionId)
      const viewId = String(view.id || '').trim()
      if (!extensionId || !viewId) {
        throw new Error('Extension view is incomplete')
      }
      if (!this.isExtensionEnabled(extensionId)) {
        throw new Error(`Extension view is disabled: ${extensionId || viewId}`)
      }
      const workspace = useWorkspaceStore()
      const globalConfigDir = await workspace.ensureGlobalConfigDir()
      const extension = this.registry.find((entry) => entry.id === extensionId)
      await this.activateExtension(extensionId, `onView:${viewId}`).catch(() => {})
      const extensionSettings = extension ? this.configForExtension(extension) : {}
      const mergedSettings = {
        ...extensionSettings,
        ...(settings && typeof settings === 'object' ? settings : {}),
      }
      let resolved
      try {
        resolved = await resolveExtensionView({
          globalConfigDir,
          workspaceRoot: workspace.path || '',
          extensionId,
          viewId,
          parentItemId: String(parentItemId || ''),
          commandId: String(view.commandId || ''),
          targetKind: String(target?.kind || ''),
          referenceId: String(target?.referenceId || ''),
          targetPath: String(target?.path || ''),
          settings: mergedSettings,
        })
      } catch (error) {
        if (isPromptIsolationError(error)) {
          this.deferViewRequest({
            kind: 'resolveView',
            extensionId,
            workspaceRoot: workspace.path || '',
            viewId,
            target,
            settings: mergedSettings,
            parentItemId,
          })
        }
        throw error
      }
      const viewKey = `${extensionId}:${viewId}`
      this.resolvedViews[viewKey] = mergeResolvedViewState(
        this.resolvedViews[viewKey],
        resolved,
        parentItemId,
      )
      this.viewState[viewKey] = buildExtensionViewState(resolved)
      this.retryDeferredViewRequests()
      return resolved
    },
    async notifyViewSelection(view = {}, itemHandle = '') {
      const extensionId = normalizeExtensionId(view.extensionId)
      const viewId = String(view.id || '').trim()
      if (!extensionId || !viewId) return null
      if (!this.isExtensionEnabled(extensionId)) {
        throw new Error(`Extension view is disabled: ${extensionId || viewId}`)
      }
      const workspace = useWorkspaceStore()
      const globalConfigDir = await workspace.ensureGlobalConfigDir()
      try {
        const result = await notifyExtensionViewSelection({
          globalConfigDir,
          workspaceRoot: workspace.path || '',
          extensionId,
          viewId,
          itemHandle: String(itemHandle || ''),
        })
        this.retryDeferredViewRequests()
        return result
      } catch (error) {
        if (isPromptIsolationError(error)) {
          this.deferViewRequest({
            kind: 'notifyViewSelection',
            extensionId,
            workspaceRoot: workspace.path || '',
            viewId,
            target: {},
            itemHandle,
          })
        }
        throw error
      }
    },
    setViewControllerState(viewKey = '', patch = {}) {
      const key = String(viewKey || '').trim()
      if (!key) return
      const current = this.viewControllerState[key] && typeof this.viewControllerState[key] === 'object'
        ? this.viewControllerState[key]
        : {
            selectedHandle: '',
            focusedHandle: '',
            revealedPathHandles: [],
          }
      this.viewControllerState[key] = {
        ...current,
        ...(patch && typeof patch === 'object' ? patch : {}),
      }
    },
    requestViewReveal(payload = {}) {
      const extensionId = normalizeExtensionId(payload.extensionId)
      const viewId = String(payload.viewId || '').trim()
      const itemHandle = String(payload.itemHandle || '').trim()
      if (!extensionId || !viewId || !itemHandle) return
      const viewKey = `${extensionId}:${viewId}`
      const parentHandles = Array.isArray(payload.parentHandles)
        ? payload.parentHandles.map((entry) => String(entry || '').trim()).filter(Boolean)
        : []
      this.setViewControllerState(viewKey, {
        selectedHandle: payload.select === false ? '' : itemHandle,
        focusedHandle: payload.focus ? itemHandle : '',
        revealedPathHandles: payload.expand === false ? [] : parentHandles,
      })
      const container = this.resolveContainerForViewId(extensionId, viewId)
      if (container?.panelId) {
        void this.focusSidebarContainer(
          container.panelId,
          this.sidebarTargetForPanel(container.panelId),
        ).catch(() => {})
      }
    },
    markViewsChanged(changedViews = [], defaultExtensionId = '') {
      const extensionId = normalizeExtensionId(defaultExtensionId)
      if (!Array.isArray(changedViews) || changedViews.length === 0) return
      for (const rawViewId of changedViews) {
        const viewId = String(rawViewId || '').trim()
        if (!viewId) continue
        const key = viewId.includes(':')
          ? viewId
          : `${extensionId}:${viewId}`
        const normalizedKey = String(key || '').trim()
        if (!normalizedKey) continue
        this.changedViewTicks[normalizedKey] = (this.changedViewTicks[normalizedKey] || 0) + 1
      }
    },
    requestViewRefresh(viewKeys = []) {
      this.markViewsChanged(viewKeys)
    },
    deferViewRequest(payload = {}) {
      const normalizedExtensionId = normalizeExtensionId(payload?.extensionId)
      const normalizedWorkspaceRoot = normalizeWorkspaceRoot(payload?.workspaceRoot || useWorkspaceStore().path || '')
      const normalizedViewId = String(payload?.viewId || '').trim()
      const normalizedKind = String(payload?.kind || '').trim()
      if (!normalizedExtensionId || !normalizedViewId || !normalizedKind) return
      const request = {
        kind: normalizedKind,
        extensionId: normalizedExtensionId,
        workspaceRoot: normalizedWorkspaceRoot,
        viewId: normalizedViewId,
        target: normalizeTarget(payload?.target || {}),
        settings: payload?.settings && typeof payload.settings === 'object' ? payload.settings : {},
        parentItemId: String(payload?.parentItemId || '').trim(),
        itemHandle: String(payload?.itemHandle || '').trim(),
      }
      const key = deferredViewRequestKey(request)
      this.deferredViewRequests = {
        ...this.deferredViewRequests,
        [key]: request,
      }
    },
    requeueDeferredViewRequests(requests = []) {
      if (!Array.isArray(requests) || requests.length === 0) return
      for (const request of requests) {
        this.deferViewRequest(request)
      }
    },
    retryDeferredViewRequests() {
      if (this._flushingDeferredViewRequests) return
      if (Object.keys(this.deferredViewRequests || {}).length === 0) return
      void this.flushDeferredViewRequests().catch(() => {})
    },
    async flushDeferredViewRequests() {
      if (this._flushingDeferredViewRequests) return []
      const pending = Object.values(this.deferredViewRequests || {})
      if (pending.length === 0) return []
      this._flushingDeferredViewRequests = true
      this.deferredViewRequests = {}
      const replayed = []
      try {
        for (let index = 0; index < pending.length; index += 1) {
          const request = pending[index]
          const currentWorkspaceRoot = normalizeWorkspaceRoot(useWorkspaceStore().path || '')
          if (normalizeWorkspaceRoot(request.workspaceRoot) !== currentWorkspaceRoot) {
            continue
          }
          try {
            if (request.kind === 'resolveView') {
              await this.resolveView(
                { extensionId: request.extensionId, id: request.viewId },
                request.target,
                request.settings,
                request.parentItemId,
              )
              replayed.push(deferredViewRequestKey(request))
              continue
            }
            if (request.kind === 'notifyViewSelection') {
              await this.notifyViewSelection(
                { extensionId: request.extensionId, id: request.viewId },
                request.itemHandle,
              )
              replayed.push(deferredViewRequestKey(request))
              continue
            }
            throw new Error(`Unsupported deferred extension view request kind: ${request.kind}`)
          } catch (error) {
            if (isPromptIsolationError(error)) {
              this.deferViewRequest(request)
              continue
            }
            this.requeueDeferredViewRequests(pending.slice(index))
            throw error
          }
        }
        return replayed
      } finally {
        this._flushingDeferredViewRequests = false
      }
    },
    upsertTask(task = {}) {
      const normalized = normalizeTask(task)
      if (!normalized.id) return null
      const index = this.tasks.findIndex((item) => item.id === normalized.id)
      if (index >= 0) {
        this.tasks.splice(index, 1, normalized)
      } else {
        this.tasks.unshift(normalized)
      }
      return normalized
    },
    async startHostEventBridge() {
      if (this._extensionHostUnlisten) return
      this._extensionHostUnlisten = await listenExtensionViewChanged((event) => {
        const payload = event?.payload || {}
        const activeWorkspaceRoot = String(useWorkspaceStore().path || '')
        const workspaceRoot = String(payload.workspaceRoot || '')
        if (workspaceRoot && activeWorkspaceRoot && workspaceRoot !== activeWorkspaceRoot) return
        this.markViewsChanged(payload.viewIds, payload.extensionId)
      }).catch(() => null)
      this._extensionHostViewStateUnlisten = await listenExtensionViewStateChanged((event) => {
        const payload = event?.payload || {}
        const activeWorkspaceRoot = String(useWorkspaceStore().path || '')
        const workspaceRoot = String(payload.workspaceRoot || '')
        if (workspaceRoot && activeWorkspaceRoot && workspaceRoot !== activeWorkspaceRoot) return
        const viewKey = `${normalizeExtensionId(payload.extensionId)}:${String(payload.viewId || '').trim()}`
        this.viewState[viewKey] = buildExtensionViewState(payload)
      }).catch(() => null)
      this._extensionTaskChangedUnlisten = await listenExtensionTaskChanged((event) => {
        this.upsertTask(event?.payload || {})
      }).catch(() => null)
      this._extensionHostViewRevealUnlisten = await listenExtensionViewRevealRequested((event) => {
        const payload = event?.payload || {}
        const activeWorkspaceRoot = String(useWorkspaceStore().path || '')
        const workspaceRoot = String(payload.workspaceRoot || '')
        if (workspaceRoot && activeWorkspaceRoot && workspaceRoot !== activeWorkspaceRoot) return
        this.requestViewReveal(payload)
      }).catch(() => null)
      await this.refreshTasks().catch(() => {})
    },
    stopHostEventBridge() {
      this._extensionHostUnlisten?.()
      this._extensionHostUnlisten = null
      this._extensionHostViewStateUnlisten?.()
      this._extensionHostViewStateUnlisten = null
      this._extensionTaskChangedUnlisten?.()
      this._extensionTaskChangedUnlisten = null
      this._extensionHostViewRevealUnlisten?.()
      this._extensionHostViewRevealUnlisten = null
    },
    async cancelTask(taskId = '') {
      return this.upsertTask(await cancelExtensionTaskWithBackend(taskId))
    },

    async refreshTask(taskId = '') {
      return this.upsertTask(await getExtensionTask(taskId))
    },

    openArtifact(artifact = {}) {
      return openExtensionArtifactWithBackend(artifact)
    },

    revealArtifact(artifact = {}) {
      return revealExtensionArtifactWithBackend(artifact)
    },

    async runResultEntryAction(entry = {}, fallbackTarget = {}) {
      const action = String(entry?.action || '').trim().toLowerCase()
      const path = String(entry?.path || '').trim()
      const mediaType = String(entry?.mediaType || '').trim()
      const commandId = String(entry?.commandId || '').trim()
      const target = {
        kind: String(entry?.targetKind || fallbackTarget?.kind || '').trim(),
        referenceId: String(entry?.referenceId || fallbackTarget?.referenceId || '').trim(),
        path: String(entry?.targetPath || path || fallbackTarget?.path || '').trim(),
      }

      if (action === 'reveal' && path) {
        return this.revealArtifact({ path })
      }

      if (action === 'copy-text') {
        const text = String(entry?.payload?.text || path || '').trim()
        if (!text) return null
        return writeNativeClipboardText(text)
      }

      if (action === 'open-tab' && target.path) {
        return useEditorStore().openFile(target.path)
      }

      if (action === 'execute-command' && commandId) {
        return this.executeCommand({
          extensionId: normalizeExtensionId(
            entry?.extensionId ||
            entry?.extension_id ||
            entry?.payload?.extensionId ||
            entry?.payload?.extension_id,
          ),
          commandId,
        }, target, entry?.payload?.settings || {})
      }

      if (action === 'open-reference' && target.referenceId) {
        const workspaceStore = useWorkspaceStore()
        const referencesStore = useReferencesStore()
        referencesStore.selectReference(target.referenceId)
        await workspaceStore.openWorkspaceSurface().catch(() => {})
        await workspaceStore.setLeftSidebarPanel('references').catch(() => {})
        await workspaceStore.openReferenceDock().catch(() => {})
        return target.referenceId
      }

      if (action === 'copy-path') {
        const text = String(path || target.path || '').trim()
        if (!text) return null
        return writeNativeClipboardText(text)
      }

      if ((action === 'open' || !action) && path) {
        return this.openArtifact({ path, mediaType })
      }

      if (path) {
        return this.openArtifact({ path, mediaType })
      }

      return null
    },
  },
})
