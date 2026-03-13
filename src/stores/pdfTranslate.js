import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { t } from '../i18n'
import { useWorkspaceStore } from './workspace'
import { useEnvironmentStore } from './environment'
import { useEditorStore } from './editor'
import {
  getPdfTranslationEngine,
  isOpenAiCompatibleProvider,
  providerLabel,
  providerSupportsPdfTranslation,
} from '../services/modelCatalog'

const DEFAULT_QPS = 8
const DEFAULT_POOL_MAX_WORKERS = 0
const MAX_POOL_MAX_WORKERS = 1000
const RUNTIME_STATUS_CACHE_MS = 60 * 1000

const DEFAULT_SETTINGS = () => ({
  modelId: '',
  langIn: 'en',
  langOut: 'zh',
  mode: 'dual',
  qps: DEFAULT_QPS,
  poolMaxWorkers: DEFAULT_POOL_MAX_WORKERS,
  autoMapPoolMaxWorkers: true,
  ocrWorkaround: false,
  autoEnableOcrWorkaround: false,
  noWatermarkMode: false,
  translateTableText: true,
})

function clampQps(value) {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return DEFAULT_QPS
  return Math.max(1, Math.min(parsed, 32))
}

function clampPoolMaxWorkers(value) {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return DEFAULT_POOL_MAX_WORKERS
  return Math.max(0, Math.min(parsed, MAX_POOL_MAX_WORKERS))
}

function normalizeMode(value) {
  return ['mono', 'dual', 'both'].includes(value) ? value : 'dual'
}

function dirname(path) {
  const normalized = String(path || '').replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  if (idx < 0) return '.'
  const dir = normalized.slice(0, idx)
  if (/^[A-Za-z]:$/.test(dir)) return `${dir}/`
  return dir || '/'
}

function fileNameForLog(path = '') {
  return String(path || '').split(/[\\/]/).pop() || path
}

function normalizeOpenAiCompatibleBaseUrl(url = '') {
  return String(url || '').replace(/\/responses$/, '').trim()
    .replace(/\/chat\/completions$/, '')
    .replace(/\/models$/, '')
}

function normalizeGoogleTranslationBaseUrl(url = '') {
  const value = String(url || '').trim()
  if (!value) return ''
  if (!value.includes('/openai')) return ''
  return value
    .replace(/\/chat\/completions$/, '')
    .replace(/\/responses$/, '')
    .replace(/\/models$/, '')
    .trim()
}

export const usePdfTranslateStore = defineStore('pdfTranslate', {
  state: () => ({
    settings: DEFAULT_SETTINGS(),
    loaded: false,
    loading: false,
    saving: false,
    tasks: {},
    taskOrder: [],
    runtimeStatus: { status: 'NotInitialized' },
    setupInProgress: false,
    warmupInProgress: false,
    setupProgress: 0,
    setupMessage: '',
    setupLogs: [],
    runtimeRefreshing: false,
    lastRuntimeCheckAt: 0,
    lastRuntimePythonPath: '',
    autoOpenTaskIds: {},
    _taskUnlisten: null,
    _envProgressUnlisten: null,
    _envLogUnlisten: null,
    _listenersReady: false,
    _tasksLoaded: false,
  }),

  getters: {
    compatibleModels() {
      const workspace = useWorkspaceStore()
      return (workspace.modelsConfig?.models || []).filter(model => providerSupportsPdfTranslation(model.provider))
    },

    selectedModel(state) {
      return this.compatibleModels.find(model => model.id === state.settings.modelId) || null
    },

    latestTaskForInput: (state) => (inputPath) => {
      for (const taskId of state.taskOrder) {
        const task = state.tasks[taskId]
        if (task?.inputPath === inputPath) return task
      }
      return null
    },

    runtimeLabel(state) {
      switch (state.runtimeStatus?.status) {
        case 'Ready':
          return t('Ready')
        case 'PythonMissing':
          return t('Python not found')
        case 'Error':
          return state.runtimeStatus?.data || t('Setup failed')
        default:
          return t('Not initialized')
      }
    },
  },

  actions: {
    _settingsPath() {
      const workspace = useWorkspaceStore()
      if (!workspace.globalConfigDir) return ''
      return `${workspace.globalConfigDir}/pdf-translate.json`
    },

    _defaultModelId() {
      return this.compatibleModels.find(model => model.default)?.id || this.compatibleModels[0]?.id || ''
    },

    _normalizeSettings(raw = {}) {
      const next = {
        ...DEFAULT_SETTINGS(),
        ...(raw || {}),
      }

      next.modelId = typeof next.modelId === 'string' ? next.modelId : ''
      next.langIn = typeof next.langIn === 'string' && next.langIn.trim() ? next.langIn.trim() : 'en'
      next.langOut = typeof next.langOut === 'string' && next.langOut.trim() ? next.langOut.trim() : 'zh'
      next.mode = normalizeMode(next.mode)
      next.qps = clampQps(next.qps)
      next.poolMaxWorkers = clampPoolMaxWorkers(next.poolMaxWorkers)
      next.autoMapPoolMaxWorkers = next.autoMapPoolMaxWorkers !== false
      next.ocrWorkaround = next.ocrWorkaround === true
      next.autoEnableOcrWorkaround = next.autoEnableOcrWorkaround === true
      next.noWatermarkMode = next.noWatermarkMode === true
      next.translateTableText = next.translateTableText !== false

      if (next.ocrWorkaround) next.autoEnableOcrWorkaround = false
      if (next.autoEnableOcrWorkaround) next.ocrWorkaround = false

      const hasModel = this.compatibleModels.some(model => model.id === next.modelId)
      if (!hasModel) {
        next.modelId = this._defaultModelId()
      }

      return next
    },

    _upsertTask(task) {
      if (!task?.id) return
      this.tasks[task.id] = task
      this.taskOrder = Object.values(this.tasks)
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
        .map(item => item.id)
    },

    _preferredOutput(task) {
      if (!task) return ''
      if (this.settings.mode === 'mono') return task.monoOutput || task.dualOutput || ''
      if (this.settings.mode === 'dual') return task.dualOutput || task.monoOutput || ''
      return task.dualOutput || task.monoOutput || ''
    },

    _terminalKey(task) {
      return `pdf-translate:${task?.id || 'unknown'}`
    },

    _emitTerminalLog(task, text, { clear = false, open = false } = {}) {
      if (typeof window === 'undefined' || !text) return
      window.dispatchEvent(new CustomEvent('terminal-log', {
        detail: {
          key: this._terminalKey(task),
          label: t('PDF Translation'),
          text,
          clear,
          open,
        },
      }))
    },

    _formatTaskStatusLine(task, previousTask) {
      if (!task?.id) return ''
      const status = String(task.status || '')
      const previousStatus = String(previousTask?.status || '')
      const message = String(task.message || '').trim()
      const progress = Number.isFinite(task.progress) ? Math.round(task.progress) : 0
      const previousProgress = Number.isFinite(previousTask?.progress) ? Math.round(previousTask.progress) : -1
      const previousMessage = String(previousTask?.message || '').trim()

      if (status === 'running') {
        if (message === previousMessage && progress === previousProgress) return ''
        return `[${progress}%] ${message || t('Translating...')}\n`
      }

      if (status === 'completed' && previousStatus !== 'completed') {
        return `[done] ${message || t('Translation completed')}\n`
      }

      if (status === 'failed' && (previousStatus !== 'failed' || message !== previousMessage)) {
        return `[error] ${message || t('Failed')}\n`
      }

      if (status === 'canceled' && previousStatus !== 'canceled') {
        return `[canceled] ${message || t('Canceled')}\n`
      }

      return ''
    },

    _syncTerminalLog(previousTask, payload) {
      const task = payload?.task || payload
      if (!task?.id) return

      if (payload?.rawEvent == null && payload?.rawLine) {
        const rawLine = String(payload.rawLine || '').trim()
        if (rawLine) {
          this._emitTerminalLog(task, `${rawLine}\n`, { open: task.status === 'failed' })
        }
        return
      }

      const line = this._formatTaskStatusLine(task, previousTask)
      if (line) {
        this._emitTerminalLog(task, line, { open: task.status === 'failed' })
      }
    },

    _autoOpenOutput(task) {
      const outputPath = this._preferredOutput(task)
      if (!outputPath) return

      const editorStore = useEditorStore()
      const existingPane = editorStore.findPaneWithTab(outputPath)
      if (existingPane) {
        existingPane.activeTab = outputPath
        editorStore.activePaneId = existingPane.id
        editorStore.saveEditorState()
        return
      }

      const sourcePane = editorStore.findPaneWithTab(task.inputPath)
      if (sourcePane) {
        const newPaneId = editorStore.splitPaneWith(sourcePane.id, 'vertical', outputPath)
        if (newPaneId) {
          const newPane = editorStore.findPane(editorStore.paneTree, newPaneId)
          if (newPane) newPane.activeTab = outputPath
          editorStore.activePaneId = newPaneId
          editorStore.saveEditorState()
          return
        }
      }

      editorStore.openFile(outputPath)
    },

    _applyTaskPayload(payload, allowAutoOpen = false) {
      const task = payload?.task || payload
      if (!task?.id) return
      const previousTask = this.tasks[task.id] ? { ...this.tasks[task.id] } : null
      this._upsertTask(task)
      this._syncTerminalLog(previousTask, payload)

      if (allowAutoOpen && task.status === 'completed' && this.autoOpenTaskIds[task.id]) {
        delete this.autoOpenTaskIds[task.id]
        this._autoOpenOutput(task)
      }

      if (task.status === 'failed' || task.status === 'canceled') {
        delete this.autoOpenTaskIds[task.id]
      }
    },

    async ensureListeners() {
      if (this._listenersReady) return

      this._taskUnlisten = await listen('pdf-translation-progress', (event) => {
        this._applyTaskPayload(event.payload, true)
      })
      this._envProgressUnlisten = await listen('pdf-translation-env-progress', (event) => {
        this.setupMessage = event.payload?.message || ''
        this.setupProgress = Number.isFinite(event.payload?.progress) ? event.payload.progress : 0
      })
      this._envLogUnlisten = await listen('pdf-translation-env-log', (event) => {
        const line = String(event.payload || '').trim()
        if (!line) return
        this.setupLogs = [...this.setupLogs.slice(-79), line]
      })
      this._listenersReady = true
    },

    async loadTasks() {
      if (this._tasksLoaded) return
      await this.ensureListeners()
      try {
        const tasks = await invoke('pdf_translate_list_tasks')
        for (const task of tasks || []) {
          this._applyTaskPayload(task, false)
        }
      } catch (error) {
        console.warn('Failed to load PDF translation tasks:', error)
      } finally {
        this._tasksLoaded = true
      }
    },

    async loadSettings(force = false) {
      if (this.loaded && !force) return this.settings
      if (this.loading && !force) return this.settings

      this.loading = true
      try {
        const path = this._settingsPath()
        if (!path) {
          this.settings = this._normalizeSettings()
          this.loaded = true
          return this.settings
        }

        const exists = await invoke('path_exists', { path }).catch(() => false)
        if (!exists) {
          this.settings = this._normalizeSettings()
          this.loaded = true
          return this.settings
        }

        const raw = await invoke('read_file', { path })
        this.settings = this._normalizeSettings(JSON.parse(raw))
        this.loaded = true
        return this.settings
      } catch (error) {
        console.warn('Failed to load PDF translation settings:', error)
        this.settings = this._normalizeSettings()
        this.loaded = true
        return this.settings
      } finally {
        this.loading = false
      }
    },

    async saveSettings(patch = null) {
      await this.loadSettings()
      const path = this._settingsPath()
      if (!path) return this.settings

      this.saving = true
      try {
        const next = this._normalizeSettings({
          ...this.settings,
          ...(patch || {}),
        })
        await invoke('write_file', {
          path,
          content: JSON.stringify(next, null, 2),
        })
        this.settings = next
        return next
      } finally {
        this.saving = false
      }
    },

    async refreshRuntimeStatus(options = {}) {
      const { force = false, ensureEnvironment = false } = options || {}
      await this.ensureListeners()
      const envStore = useEnvironmentStore()

      if (this.runtimeRefreshing) return this.runtimeStatus

      if (ensureEnvironment && !envStore.detected && !envStore.detecting) {
        try { await envStore.detect() } catch {}
      }

      const basePythonPath = envStore.selectedInterpreterPath('python') || null
      if (
        !force
        && this.lastRuntimeCheckAt
        && this.lastRuntimePythonPath === (basePythonPath || '')
        && Date.now() - this.lastRuntimeCheckAt < RUNTIME_STATUS_CACHE_MS
      ) {
        return this.runtimeStatus
      }

      this.runtimeRefreshing = true
      try {
        const status = await invoke('pdf_translate_check_env_status', {
          basePythonPath,
        })
        this.runtimeStatus = status || { status: 'NotInitialized' }
      } catch (error) {
        this.runtimeStatus = { status: 'Error', data: error?.message || String(error) }
      } finally {
        this.lastRuntimeCheckAt = Date.now()
        this.lastRuntimePythonPath = basePythonPath || ''
        this.runtimeRefreshing = false
      }
      return this.runtimeStatus
    },

    _beginRuntimeOperation(message) {
      this.setupProgress = 0
      this.setupMessage = message
      this.setupLogs = []
    },

    async setupRuntime() {
      await this.ensureListeners()
      const envStore = useEnvironmentStore()
      if (!envStore.detected && !envStore.detecting) {
        try { await envStore.detect() } catch {}
      }

      if (this.setupInProgress || this.warmupInProgress) {
        return this.runtimeStatus
      }

      this.setupInProgress = true
      this._beginRuntimeOperation(t('Preparing translation runtime'))

      try {
        const status = await invoke('pdf_translate_setup_env', {
          basePythonPath: envStore.selectedInterpreterPath('python') || null,
        })
        this.runtimeStatus = status || { status: 'NotInitialized' }
        if (status?.status === 'Error') {
          throw new Error(status.data || t('Failed to prepare translation runtime'))
        }
        return status
      } finally {
        this.setupInProgress = false
        await this.refreshRuntimeStatus({ force: true })
      }
    },

    async warmupRuntime() {
      await this.ensureListeners()

      if (this.setupInProgress || this.warmupInProgress) {
        return this.runtimeStatus
      }

      const runtimeStatus = await this.refreshRuntimeStatus({
        force: true,
        ensureEnvironment: true,
      })
      if (runtimeStatus?.status !== 'Ready') {
        throw new Error(t('Prepare the PDF translation runtime in Settings > PDF Translation first.'))
      }

      this.warmupInProgress = true
      this._beginRuntimeOperation(t('Warming up translation runtime'))

      try {
        const status = await invoke('pdf_translate_warmup_env')
        this.runtimeStatus = status || { status: 'Ready' }
        if (status?.status === 'Error') {
          throw new Error(status.data || t('Failed to warm up translation runtime'))
        }
        return status
      } finally {
        this.warmupInProgress = false
        await this.refreshRuntimeStatus({ force: true })
      }
    },

    _providerConfigForModel(model) {
      const workspace = useWorkspaceStore()
      return workspace.modelsConfig?.providers?.[model?.provider] || null
    },

    _apiKeyForModel(model) {
      const workspace = useWorkspaceStore()
      const providerConfig = this._providerConfigForModel(model)
      const envName = providerConfig?.apiKeyEnv
      if (!envName) return ''
      return workspace.apiKeys?.[envName] || ''
    },

    _translationBaseUrlForModel(model) {
      const providerConfig = this._providerConfigForModel(model)
      if (!providerConfig) return undefined

      if (isOpenAiCompatibleProvider(model.provider)) {
        const url = normalizeOpenAiCompatibleBaseUrl(providerConfig.customUrl || providerConfig.url || '')
        return url || undefined
      }

      if (model.provider === 'google') {
        const url = normalizeGoogleTranslationBaseUrl(providerConfig.customUrl || '')
        return url || undefined
      }

      return undefined
    },

    async startTranslation(filePath) {
      await this.ensureListeners()
      await this.loadTasks()
      const workspace = useWorkspaceStore()
      if (!workspace.modelsConfig) {
        await workspace.loadSettings()
      }
      await this.loadSettings()

      const model = this.selectedModel
      if (!model) {
        throw new Error(t('Choose a default translation model in Settings > PDF Translation first.'))
      }

      const apiKey = this._apiKeyForModel(model)
      if (!apiKey) {
        throw new Error(t('{provider} API key is not configured in Settings > Models.', {
          provider: providerLabel(model.provider),
        }))
      }

      const runtimeStatus = await this.refreshRuntimeStatus({
        force: true,
        ensureEnvironment: true,
      })
      if (runtimeStatus?.status !== 'Ready') {
        throw new Error(t('Prepare the PDF translation runtime in Settings > PDF Translation first.'))
      }

      const request = {
        inputPath: filePath,
        outputDir: dirname(filePath),
        langIn: this.settings.langIn,
        langOut: this.settings.langOut,
        engine: getPdfTranslationEngine(model.provider) || 'openai',
        apiKey,
        model: model.model || model.id,
        baseUrl: this._translationBaseUrlForModel(model),
        qps: this.settings.qps,
        poolMaxWorkers: this.settings.poolMaxWorkers,
        autoMapPoolMaxWorkers: this.settings.autoMapPoolMaxWorkers,
        mode: this.settings.mode,
        ocrWorkaround: this.settings.ocrWorkaround,
        autoEnableOcrWorkaround: this.settings.autoEnableOcrWorkaround,
        noWatermarkMode: this.settings.noWatermarkMode,
        translateTableText: this.settings.translateTableText,
      }

      const task = await invoke('pdf_translate_start', { request })
      this._applyTaskPayload(task, false)
      this.autoOpenTaskIds[task.id] = true
      this._emitTerminalLog(task, `${t('Starting translation for {name}', {
        name: fileNameForLog(filePath),
      })}\n`, {
        clear: true,
        open: true,
      })
      return task
    },

    async cancelTask(taskId) {
      try {
        await invoke('pdf_translate_cancel', { taskId })
      } finally {
        delete this.autoOpenTaskIds[taskId]
      }
    },
  },
})
