import { defineStore } from 'pinia'
import { useWorkspaceStore } from './workspace'
import {
  listExtensions,
  loadExtensionSettings,
  saveExtensionSettings,
} from '../services/extensions/extensionRegistry'
import {
  executeExtensionCommand,
} from '../services/extensions/extensionCommands'
import {
  cancelExtensionTask as cancelExtensionTaskWithBackend,
  getExtensionTask,
  listExtensionTasks,
} from '../services/extensions/extensionTasks'
import {
  openExtensionArtifact as openExtensionArtifactWithBackend,
  revealExtensionArtifact as revealExtensionArtifactWithBackend,
} from '../services/extensions/extensionArtifacts'
import {
  resolveExtensionView,
} from '../services/extensions/extensionViews'
import {
  matchesWhenClause,
  normalizeExtensionContributions,
} from '../domains/extensions/extensionContributionRegistry'

function normalizeExtensionId(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeCapability(value = '') {
  return String(value || '').trim()
}

function normalizeExtension(extension = {}) {
  const manifest = extension?.manifest && typeof extension.manifest === 'object' ? extension.manifest : {}
  const contributions = normalizeExtensionContributions(extension)

  return {
    ...extension,
    id: normalizeExtensionId(extension.id),
    name: String(extension.name || extension.id || ''),
    version: String(extension.version || ''),
    description: String(extension.description || ''),
    scope: String(extension.scope || ''),
    status: String(extension.status || 'invalid'),
    manifestFormat: String(extension.manifestFormat || ''),
    main: String(manifest?.main || ''),
    activationEvents: Array.isArray(manifest?.activationEvents) ? manifest.activationEvents : [],
    extensionKind: Array.isArray(manifest?.extensionKind) ? manifest.extensionKind : [],
    capabilities: Array.isArray(extension.capabilities) ? extension.capabilities.map(normalizeCapability).filter(Boolean) : [],
    contributedCommands: contributions.commands,
    contributedMenus: contributions.menus,
    contributedKeybindings: contributions.keybindings,
    contributedViewContainers: contributions.viewContainers,
    contributedViews: contributions.views,
    contributedCapabilities: contributions.capabilities,
    warnings: Array.isArray(extension.warnings) ? extension.warnings : [],
    errors: Array.isArray(extension.errors) ? extension.errors : [],
    settingsSchema: contributions.configuration,
  }
}

function normalizeTask(task = {}) {
  return {
    ...task,
    id: String(task.id || ''),
    extensionId: normalizeExtensionId(task.extensionId),
    capability: normalizeCapability(task.capability),
    commandId: String(task.commandId || ''),
    state: String(task.state || ''),
    artifacts: Array.isArray(task.artifacts) ? task.artifacts : [],
    error: String(task.error || ''),
  }
}

export const useExtensionsStore = defineStore('extensions', {
  state: () => ({
    registry: [],
    tasks: [],
    enabledExtensionIds: [],
    extensionConfig: {},
    resolvedViews: {},
    loadingRegistry: false,
    loadingTasks: false,
    settingsHydrated: false,
    settingsFileExists: false,
    lastError: '',
  }),

  getters: {
    enabledExtensions(state) {
      const enabled = new Set(state.enabledExtensionIds.map(normalizeExtensionId))
      return state.registry.filter((extension) => enabled.has(extension.id))
    },
    actionsForSurface() {
      return (surface = '', context = {}) => this.menuActionsForSurface(surface, context)
    },
    menuActionsForSurface: (state) => (surface = '', context = {}) => {
      const normalizedSurface = String(surface || '').trim()
      if (!normalizedSurface) return []
      const enabled = new Set(state.enabledExtensionIds.map(normalizeExtensionId))
      return state.registry
        .filter((extension) => enabled.has(extension.id) && extension.status === 'available')
        .flatMap((extension) =>
          (extension.contributedMenus || [])
            .filter((action) =>
              action.surface === normalizedSurface &&
              matchesWhenClause(action.when, context)
            )
            .map((action) => ({
              ...action,
              extensionId: extension.id,
              extensionName: extension.name,
            }))
        )
    },
    keybindingsForContext: (state) => (context = {}) => {
      const enabled = new Set(state.enabledExtensionIds.map(normalizeExtensionId))
      return state.registry
        .filter((extension) => enabled.has(extension.id) && extension.status === 'available')
        .flatMap((extension) =>
          (extension.contributedKeybindings || [])
            .filter((keybinding) => matchesWhenClause(keybinding.when, context))
            .map((keybinding) => ({
              ...keybinding,
              extensionId: extension.id,
              extensionName: extension.name,
            }))
        )
    },
    commandPaletteCommandsForContext: (state) => (context = {}) => {
      const enabled = new Set(state.enabledExtensionIds.map(normalizeExtensionId))
      return state.registry
        .filter((extension) => enabled.has(extension.id) && extension.status === 'available')
        .flatMap((extension) => {
          const paletteMenus = (extension.contributedMenus || [])
            .filter((menu) => menu.surface === 'commandPalette')
          return (extension.contributedCommands || [])
            .filter((command) => {
              const commandMenus = paletteMenus
                .filter((menu) => menu.commandId === command.commandId)
              if (commandMenus.length === 0) return true
              return commandMenus.some((menu) => matchesWhenClause(menu.when, context))
            })
            .map((command) => ({
              ...command,
              extensionId: extension.id,
              extensionName: extension.name,
            }))
        })
    },
    sidebarViewContainers(state) {
      const enabled = new Set(state.enabledExtensionIds.map(normalizeExtensionId))
      return state.registry
        .filter((extension) => enabled.has(extension.id) && extension.status === 'available')
        .flatMap((extension) =>
          (extension.contributedViewContainers || []).map((container) => ({
            ...container,
            extensionId: extension.id,
            extensionName: extension.name,
          }))
        )
    },
    viewsForContainer: (state) => (containerId = '', context = {}) => {
      const normalizedContainerId = String(containerId || '').trim()
      if (!normalizedContainerId) return []
      const enabled = new Set(state.enabledExtensionIds.map(normalizeExtensionId))
      return state.registry
        .filter((extension) => enabled.has(extension.id) && extension.status === 'available')
        .flatMap((extension) =>
          (extension.contributedViews || [])
            .filter((view) =>
              view.containerId === normalizedContainerId &&
              matchesWhenClause(view.when, context)
            )
            .map((view) => ({
              ...view,
              extensionId: extension.id,
              extensionName: extension.name,
            }))
        )
    },
    resolvedViewFor: (state) => (viewKey = '') => state.resolvedViews[String(viewKey || '').trim()] || null,
    recentTasks(state) {
      return [...state.tasks].slice(0, 8)
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
  },

  actions: {
    snapshotSettings() {
      return {
        enabledExtensionIds: [...this.enabledExtensionIds],
        extensionConfig: { ...this.extensionConfig },
      }
    },

    async hydrateSettings(force = false) {
      if (!force && this.settingsHydrated) return this.snapshotSettings()
      const workspace = useWorkspaceStore()
      const globalConfigDir = await workspace.ensureGlobalConfigDir()
      const settings = await loadExtensionSettings(globalConfigDir)
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
      const saved = await saveExtensionSettings(globalConfigDir, next)
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

    async refreshRegistry() {
      const workspace = useWorkspaceStore()
      const globalConfigDir = await workspace.ensureGlobalConfigDir()
      this.loadingRegistry = true
      this.lastError = ''
      try {
        const extensions = await listExtensions(globalConfigDir, workspace.path || '')
        this.registry = extensions.map(normalizeExtension)
        if (!this.settingsHydrated) {
          await this.hydrateSettings()
        }
        if (!this.settingsFileExists && this.enabledExtensionIds.length === 0) {
          const availableIds = this.registry
            .filter((extension) => extension.status === 'available')
            .map((extension) => extension.id)
          if (availableIds.length > 0) {
            await this.persistSettings({ enabledExtensionIds: availableIds })
          }
        }
        return this.registry
      } catch (error) {
        this.lastError = error?.message || String(error || '')
        throw error
      } finally {
        this.loadingRegistry = false
      }
    },

    async refreshTasks() {
      this.loadingTasks = true
      try {
        this.tasks = []
        this.tasks = (await listExtensionTasks()).map(normalizeTask)
        return this.tasks
      } finally {
        this.loadingTasks = false
      }
    },

    async setExtensionEnabled(extensionId = '', enabled = true) {
      const id = normalizeExtensionId(extensionId)
      const ids = new Set(this.enabledExtensionIds.map(normalizeExtensionId))
      if (enabled) {
        ids.add(id)
      } else {
        ids.delete(id)
      }
      return this.persistSettings({ enabledExtensionIds: [...ids] })
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
      return this.persistSettings({ extensionConfig: nextExtensionConfig })
    },
    async executeCommand(action = {}, target = {}, settings = {}) {
      const extensionId = normalizeExtensionId(action.extensionId)
      const commandId = String(action.commandId || action.command || action.id || '').trim()
      const extension = this.registry.find((extension) => extension.id === extensionId)
      if (!extension || extension.status !== 'available') {
        throw new Error(`Extension command is not available: ${extensionId || commandId}`)
      }
      if (!(extension.contributedCommands || []).some((command) => command.commandId === commandId)) {
        throw new Error(`Extension ${extensionId} does not contribute command ${commandId}`)
      }
      const workspace = useWorkspaceStore()
      const globalConfigDir = await workspace.ensureGlobalConfigDir()
      const extensionSettings = this.configForExtension(extension)
      const task = normalizeTask(await executeExtensionCommand({
        globalConfigDir,
        workspaceRoot: workspace.path || '',
        extensionId,
        commandId,
        target,
        settings: {
          ...extensionSettings,
          ...(settings && typeof settings === 'object' ? settings : {}),
        },
      }))
      await this.refreshTasks().catch(() => {})
      return task
    },
    async resolveView(view = {}, target = {}, settings = {}) {
      const extensionId = normalizeExtensionId(view.extensionId)
      const viewId = String(view.id || '').trim()
      if (!extensionId || !viewId) {
        throw new Error('Extension view is incomplete')
      }
      const workspace = useWorkspaceStore()
      const globalConfigDir = await workspace.ensureGlobalConfigDir()
      const extension = this.registry.find((entry) => entry.id === extensionId)
      const extensionSettings = extension ? this.configForExtension(extension) : {}
      const resolved = await resolveExtensionView({
        globalConfigDir,
        workspaceRoot: workspace.path || '',
        extensionId,
        viewId,
        commandId: String(view.commandId || ''),
        targetKind: String(target?.kind || ''),
        targetPath: String(target?.path || ''),
        settings: {
          ...extensionSettings,
          ...(settings && typeof settings === 'object' ? settings : {}),
        },
      })
      this.resolvedViews[`${extensionId}:${viewId}`] = resolved
      return resolved
    },
    async cancelTask(taskId = '') {
      const task = normalizeTask(await cancelExtensionTaskWithBackend(taskId))
      await this.refreshTasks().catch(() => {})
      return task
    },

    async refreshTask(taskId = '') {
      const task = normalizeTask(await getExtensionTask(taskId))
      const index = this.tasks.findIndex((item) => item.id === task.id)
      if (index >= 0) {
        this.tasks.splice(index, 1, task)
      } else {
        this.tasks.unshift(task)
      }
      return task
    },

    openArtifact(artifact = {}) {
      return openExtensionArtifactWithBackend(artifact)
    },

    revealArtifact(artifact = {}) {
      return revealExtensionArtifactWithBackend(artifact)
    },
  },
})
