import { defineStore } from 'pinia'
import { useWorkspaceStore } from './workspace'
import {
  detectPluginRuntime,
  listPlugins,
  loadPluginSettings,
  savePluginSettings,
} from '../services/plugins/pluginRegistry'
import {
  cancelPluginJob as cancelPluginJobWithBackend,
  getPluginJob,
  listPluginJobs,
  startPluginJob,
} from '../services/plugins/pluginJobs'
import {
  openPluginArtifact as openPluginArtifactWithBackend,
  revealPluginArtifact as revealPluginArtifactWithBackend,
} from '../services/plugins/pluginArtifacts'

function normalizePluginId(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeCapability(value = '') {
  return String(value || '').trim()
}

function normalizePlugin(plugin = {}) {
  const uiActions = Array.isArray(plugin?.manifest?.ui?.actions)
    ? plugin.manifest.ui.actions
        .map((action) => ({
          id: String(action?.id || '').trim(),
          pluginId: normalizePluginId(plugin.id),
          surface: String(action?.surface || '').trim(),
          capability: normalizeCapability(action?.capability),
          label: String(action?.label || '').trim(),
          icon: String(action?.icon || '').trim(),
        }))
        .filter((action) => action.id && action.surface && action.capability)
    : []

  return {
    ...plugin,
    id: normalizePluginId(plugin.id),
    name: String(plugin.name || plugin.id || ''),
    version: String(plugin.version || ''),
    description: String(plugin.description || ''),
    scope: String(plugin.scope || ''),
    status: String(plugin.status || 'invalid'),
    capabilities: Array.isArray(plugin.capabilities) ? plugin.capabilities.map(normalizeCapability).filter(Boolean) : [],
    warnings: Array.isArray(plugin.warnings) ? plugin.warnings : [],
    errors: Array.isArray(plugin.errors) ? plugin.errors : [],
    settingsSchema: plugin?.manifest?.settingsSchema && typeof plugin.manifest.settingsSchema === 'object'
      ? plugin.manifest.settingsSchema
      : {},
    uiActions,
  }
}

function normalizeJob(job = {}) {
  return {
    ...job,
    id: String(job.id || ''),
    pluginId: normalizePluginId(job.pluginId),
    capability: normalizeCapability(job.capability),
    state: String(job.state || ''),
    artifacts: Array.isArray(job.artifacts) ? job.artifacts : [],
    error: String(job.error || ''),
  }
}

export const usePluginsStore = defineStore('plugins', {
  state: () => ({
    registry: [],
    jobs: [],
    enabledPluginIds: [],
    defaultProviders: {},
    pluginConfig: {},
    loadingRegistry: false,
    loadingJobs: false,
    settingsHydrated: false,
    settingsFileExists: false,
    lastError: '',
  }),

  getters: {
    enabledPlugins(state) {
      const enabled = new Set(state.enabledPluginIds.map(normalizePluginId))
      return state.registry.filter((plugin) => enabled.has(plugin.id))
    },
    providersForCapability: (state) => (capability) => {
      const normalizedCapability = normalizeCapability(capability)
      const enabled = new Set(state.enabledPluginIds.map(normalizePluginId))
      return state.registry.filter(
        (plugin) =>
          enabled.has(plugin.id) &&
          plugin.status === 'available' &&
          plugin.capabilities.includes(normalizedCapability)
      )
    },
    defaultProviderForCapability: (state) => (capability) => {
      const normalizedCapability = normalizeCapability(capability)
      const preferredId = normalizePluginId(state.defaultProviders[normalizedCapability])
      const enabled = new Set(state.enabledPluginIds.map(normalizePluginId))
      const providers = state.registry.filter(
        (plugin) =>
          enabled.has(plugin.id) &&
          plugin.status === 'available' &&
          plugin.capabilities.includes(normalizedCapability)
      )
      return providers.find((plugin) => plugin.id === preferredId) || providers[0] || null
    },
    actionsForSurface: (state) => (surface = '') => {
      const normalizedSurface = String(surface || '').trim()
      if (!normalizedSurface) return []
      const enabled = new Set(state.enabledPluginIds.map(normalizePluginId))
      return state.registry
        .filter((plugin) => enabled.has(plugin.id) && plugin.status === 'available')
        .flatMap((plugin) =>
          (plugin.uiActions || [])
            .filter((action) => action.surface === normalizedSurface)
            .map((action) => ({
              ...action,
              pluginId: plugin.id,
              pluginName: plugin.name,
            }))
        )
    },
    recentJobs(state) {
      return [...state.jobs].slice(0, 8)
    },
    defaultConfigForPlugin: () => (plugin = {}) => {
      const defaults = {}
      const schema = plugin.settingsSchema || {}
      for (const [key, definition] of Object.entries(schema)) {
        if (definition && Object.prototype.hasOwnProperty.call(definition, 'default')) {
          defaults[key] = definition.default
        }
      }
      return defaults
    },
    configForPlugin: (state) => (plugin = {}) => {
      const defaults = {}
      const schema = plugin.settingsSchema || {}
      for (const [key, definition] of Object.entries(schema)) {
        if (definition && Object.prototype.hasOwnProperty.call(definition, 'default')) {
          defaults[key] = definition.default
        }
      }
      const saved = state.pluginConfig?.[normalizePluginId(plugin.id)]
      return {
        ...defaults,
        ...(saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}),
      }
    },
  },

  actions: {
    snapshotSettings() {
      return {
        enabledPluginIds: [...this.enabledPluginIds],
        defaultProviders: { ...this.defaultProviders },
        pluginConfig: { ...this.pluginConfig },
      }
    },

    async hydrateSettings(force = false) {
      if (!force && this.settingsHydrated) return this.snapshotSettings()
      const workspace = useWorkspaceStore()
      const globalConfigDir = await workspace.ensureGlobalConfigDir()
      const settings = await loadPluginSettings(globalConfigDir)
      this.enabledPluginIds = Array.isArray(settings?.enabledPluginIds)
        ? settings.enabledPluginIds.map(normalizePluginId).filter(Boolean)
        : []
      this.defaultProviders = settings?.defaultProviders && typeof settings.defaultProviders === 'object'
        ? { ...settings.defaultProviders }
        : {}
      this.pluginConfig = settings?.pluginConfig && typeof settings.pluginConfig === 'object'
        ? { ...settings.pluginConfig }
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
      const saved = await savePluginSettings(globalConfigDir, next)
      this.enabledPluginIds = Array.isArray(saved?.enabledPluginIds)
        ? saved.enabledPluginIds.map(normalizePluginId).filter(Boolean)
        : []
      this.defaultProviders = saved?.defaultProviders && typeof saved.defaultProviders === 'object'
        ? { ...saved.defaultProviders }
        : {}
      this.pluginConfig = saved?.pluginConfig && typeof saved.pluginConfig === 'object'
        ? { ...saved.pluginConfig }
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
        const plugins = await listPlugins(globalConfigDir, workspace.path || '')
        this.registry = plugins.map(normalizePlugin)
        if (!this.settingsHydrated) {
          await this.hydrateSettings()
        }
        if (!this.settingsFileExists && this.enabledPluginIds.length === 0) {
          const availableIds = this.registry
            .filter((plugin) => plugin.status === 'available')
            .map((plugin) => plugin.id)
          if (availableIds.length > 0) {
            await this.persistSettings({ enabledPluginIds: availableIds })
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

    async refreshJobs() {
      this.loadingJobs = true
      try {
        this.jobs = (await listPluginJobs()).map(normalizeJob)
        return this.jobs
      } finally {
        this.loadingJobs = false
      }
    },

    async setPluginEnabled(pluginId = '', enabled = true) {
      const id = normalizePluginId(pluginId)
      const ids = new Set(this.enabledPluginIds.map(normalizePluginId))
      if (enabled) {
        ids.add(id)
      } else {
        ids.delete(id)
      }
      return this.persistSettings({ enabledPluginIds: [...ids] })
    },

    async setDefaultProvider(capability = '', pluginId = '') {
      const next = {
        ...this.defaultProviders,
        [normalizeCapability(capability)]: normalizePluginId(pluginId),
      }
      return this.persistSettings({ defaultProviders: next })
    },

    async setPluginConfigValue(pluginId = '', key = '', value = '') {
      const id = normalizePluginId(pluginId)
      const configKey = String(key || '').trim()
      if (!id || !configKey) return this.snapshotSettings()
      const current = this.pluginConfig?.[id] && typeof this.pluginConfig[id] === 'object'
        ? this.pluginConfig[id]
        : {}
      const nextPluginConfig = {
        ...this.pluginConfig,
        [id]: {
          ...current,
          [configKey]: value,
        },
      }
      return this.persistSettings({ pluginConfig: nextPluginConfig })
    },

    async detectRuntime(pluginId = '') {
      const workspace = useWorkspaceStore()
      const globalConfigDir = await workspace.ensureGlobalConfigDir()
      return detectPluginRuntime(globalConfigDir, workspace.path || '', pluginId)
    },

    async startCapabilityJob(capability = '', target = {}, settings = {}) {
      const workspace = useWorkspaceStore()
      const provider = this.defaultProviderForCapability(capability)
      if (!provider) {
        throw new Error(`No available plugin provider for ${capability}`)
      }
      const globalConfigDir = await workspace.ensureGlobalConfigDir()
      const providerSettings = this.configForPlugin(provider)
      const job = normalizeJob(await startPluginJob({
        globalConfigDir,
        workspaceRoot: workspace.path || '',
        pluginId: provider.id,
        capability,
        target,
        settings: {
          ...providerSettings,
          ...(settings && typeof settings === 'object' ? settings : {}),
        },
      }))
      await this.refreshJobs().catch(() => {})
      return job
    },

    async startPluginAction(action = {}, target = {}, settings = {}) {
      const pluginId = normalizePluginId(action.pluginId)
      const capability = normalizeCapability(action.capability)
      const provider = this.registry.find((plugin) => plugin.id === pluginId)
      if (!provider || provider.status !== 'available') {
        throw new Error(`Plugin action is not available: ${pluginId || capability}`)
      }
      if (!provider.capabilities.includes(capability)) {
        throw new Error(`Plugin ${pluginId} does not provide ${capability}`)
      }
      const workspace = useWorkspaceStore()
      const globalConfigDir = await workspace.ensureGlobalConfigDir()
      const providerSettings = this.configForPlugin(provider)
      const job = normalizeJob(await startPluginJob({
        globalConfigDir,
        workspaceRoot: workspace.path || '',
        pluginId,
        capability,
        target,
        settings: {
          ...providerSettings,
          ...(settings && typeof settings === 'object' ? settings : {}),
        },
      }))
      await this.refreshJobs().catch(() => {})
      return job
    },

    async cancelJob(jobId = '') {
      const job = normalizeJob(await cancelPluginJobWithBackend(jobId))
      await this.refreshJobs().catch(() => {})
      return job
    },

    async refreshJob(jobId = '') {
      const job = normalizeJob(await getPluginJob(jobId))
      const index = this.jobs.findIndex((item) => item.id === job.id)
      if (index >= 0) {
        this.jobs.splice(index, 1, job)
      } else {
        this.jobs.unshift(job)
      }
      return job
    },

    openArtifact(artifact = {}) {
      return openPluginArtifactWithBackend(artifact)
    },

    revealArtifact(artifact = {}) {
      return revealPluginArtifactWithBackend(artifact)
    },
  },
})
