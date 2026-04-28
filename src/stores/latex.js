import { defineStore } from 'pinia'
import { useFilesStore } from './files'
import { useWorkspaceStore } from './workspace'
import {
  checkLatexCompilers,
  checkLatexTools,
  cancelLatexRuntime,
  downloadTectonic,
  executeLatexCompile,
  formatLatexDocument,
  listenLatexCompileStream,
  listenLatexRuntimeCompileRequested,
  listenTectonicDownloadProgress,
  resolveLatexRuntimeChange,
  resolveLatexRuntimeSource,
  scheduleLatexRuntime,
} from '../services/latex/runtime.js'
import {
  stableContentFingerprint,
} from '../services/latex/projectGraph'
import {
  createLatexPreferenceState,
  loadLatexPreferences as loadLatexPreferencesFromRust,
  saveLatexPreferences as saveLatexPreferencesToRust,
} from '../services/latexPreferences.js'

const COMPILER_CHECK_CACHE_MS = 5 * 60 * 1000
const TOOL_CHECK_CACHE_MS = 5 * 60 * 1000

let latexStreamUnlistenPromise = null
let latexRuntimeCompileRequestUnlistenPromise = null
const LATEX_PREFERENCE_KEYS = [
  'compilerPreference',
  'enginePreference',
  'autoCompile',
  'formatOnSave',
  'buildExtraArgs',
  'customSystemTexPath',
]

function normalizeLatexRuntimePath(path = '') {
  return String(path || '').trim()
}

function resolveLatexTargetPathFromState(storeState = {}, texPath = '') {
  const normalizedPath = normalizeLatexRuntimePath(texPath)
  if (!normalizedPath) return ''

  const directCompileTarget = normalizeLatexRuntimePath(
    storeState.compileState?.[normalizedPath]?.compileTargetPath,
  )
  if (directCompileTarget) return directCompileTarget

  const directQueueTarget = normalizeLatexRuntimePath(
    storeState.buildQueueState?.[normalizedPath]?.targetPath,
  )
  if (directQueueTarget) return directQueueTarget

  for (const [statePath, state] of Object.entries(storeState.compileState || {})) {
    if (normalizeLatexRuntimePath(state?.linkedSourcePath) !== normalizedPath) continue
    return normalizeLatexRuntimePath(state?.compileTargetPath || statePath)
  }

  for (const queueState of Object.values(storeState.buildQueueState || {})) {
    if (normalizeLatexRuntimePath(queueState?.sourcePath) !== normalizedPath) continue
    const targetPath = normalizeLatexRuntimePath(queueState?.targetPath)
    if (targetPath) return targetPath
  }

  return normalizedPath
}

function buildFallbackLatexTerminalText(texPath, message = '') {
  const normalizedPath = String(texPath || '').trim() || 'unknown.tex'
  const normalizedMessage = String(message || '').trim() || 'LaTeX runtime failed.'
  return [
    `[LaTeX] ${normalizedPath}`,
    'Compilation failed',
    'Errors: 1',
    'Warnings: 0',
    '',
    'Errors',
    `- ${normalizedMessage}`,
    '',
    '----- Full log -----',
    normalizedMessage,
    '',
  ].join('\n')
}

function pushLatexLogToTerminal(texPath, result) {
  if (typeof window === 'undefined') return
  const text = String(
    result?.terminalText ||
    buildFallbackLatexTerminalText(texPath, result?.log || result?.message || ''),
  )
  if (!text.trim()) return
  const shouldOpenTerminal =
    !result.success ||
    (Array.isArray(result.errors) && result.errors.length > 0)
  window.dispatchEvent(
    new CustomEvent('terminal-log', {
      detail: {
        key: 'latex-log',
        label: 'LaTeX',
        text,
        clear: false,
        open: shouldOpenTerminal,
        status: result.success ? 'success' : 'error',
      },
    }),
  )
}

function pushLatexStreamToTerminal({
  texPath,
  line,
  clear = false,
  header = false,
  open = false,
  status = null,
} = {}) {
  if (typeof window === 'undefined' || !line) return
  window.dispatchEvent(
    new CustomEvent('terminal-stream', {
      detail: {
        key: 'latex-log',
        label: 'LaTeX',
        sourcePath: texPath,
        text: line.endsWith('\n') ? line : `${line}\n`,
        clear,
        header,
        open,
        status,
      },
    }),
  )
}

async function ensureLatexStreamListener() {
  if (latexStreamUnlistenPromise) {
    await latexStreamUnlistenPromise
    return
  }

  latexStreamUnlistenPromise = listenLatexCompileStream((payload) => {
    pushLatexStreamToTerminal({
      texPath: payload.texPath,
      line: payload.line,
      clear: payload.clear === true,
      header: payload.header === true,
      open: payload.open === true,
      status: payload.status || null,
    })
  })

  await latexStreamUnlistenPromise
}

async function ensureLatexRuntimeCompileRequestListener() {
  if (latexRuntimeCompileRequestUnlistenPromise) {
    await latexRuntimeCompileRequestUnlistenPromise
    return
  }

  latexRuntimeCompileRequestUnlistenPromise = listenLatexRuntimeCompileRequested((payload) => {
    const latexStore = useLatexStore()
    const sourcePath = String(payload.sourcePath || '')
    const targetPath = String(payload.targetPath || sourcePath)
    if (!sourcePath) return
    void latexStore.compile(sourcePath, {
      reason: String(payload.reason || 'save'),
      targetPath,
    })
  })

  await latexRuntimeCompileRequestUnlistenPromise
}

function buildLatexRuntimeContentOverrides(sourcePath, options = {}) {
  const normalizedSourcePath = String(sourcePath || '').trim()
  if (!normalizedSourcePath) return {}

  if (options.sourceContent === undefined) {
    return options.contentOverrides && typeof options.contentOverrides === 'object'
      ? options.contentOverrides
      : {}
  }

  return {
    ...(options.contentOverrides && typeof options.contentOverrides === 'object'
      ? options.contentOverrides
      : {}),
    [normalizedSourcePath]: options.sourceContent,
  }
}

function normalizeLatexCompileRequestValue(sourcePath, value = null) {
  const normalizedSourcePath = String(sourcePath || '').trim()
  const resolvedRootPath = String(
    value?.rootPath || value?.sourcePath || normalizedSourcePath,
  )
  return {
    sourcePath: String(value?.sourcePath || normalizedSourcePath),
    rootPath: resolvedRootPath,
    previewPath: String(
      value?.previewPath ||
      `${resolvedRootPath.replace(/\.(tex|latex)$/i, '')}.pdf`,
    ),
  }
}

function normalizeLatexLintStateValue(nextState = null) {
  return {
    status: String(nextState?.status || 'unavailable'),
    diagnostics: Array.isArray(nextState?.diagnostics)
      ? nextState.diagnostics
      : [],
    error: nextState?.error || null,
    updatedAt: Number(nextState?.updatedAt || Date.now()),
  }
}

async function resolveLatexRuntimeSourceFromRust(sourcePath, options = {}) {
  const workspaceStore = useWorkspaceStore()
  const normalizedSourcePath = String(sourcePath || '').trim()
  if (!normalizedSourcePath) return null

  const contentOverrides = buildLatexRuntimeContentOverrides(
    normalizedSourcePath,
    options,
  )
  const latexStore = useLatexStore()
  const resolved = await resolveLatexRuntimeSource({
    sourcePath: normalizedSourcePath,
    workspacePath: workspaceStore.path || '',
    contentOverrides,
    sourceContent:
      typeof options.sourceContent === 'string' ? options.sourceContent : null,
    customSystemTexPath:
      String(latexStore.customSystemTexPath || '').trim() || null,
  }).catch(() => null)

  const compileRequest = normalizeLatexCompileRequestValue(
    normalizedSourcePath,
    resolved?.compileRequest,
  )

  return {
    ...compileRequest,
    lintState: normalizeLatexLintStateValue(resolved?.lintState || null),
    contentOverrides,
  }
}

async function resolveLatexRuntimeChangeFromRust(changedPath, options = {}) {
  const workspaceStore = useWorkspaceStore()
  const normalizedChangedPath = String(changedPath || '').trim()
  if (!normalizedChangedPath) return null

  const contentOverrides = buildLatexRuntimeContentOverrides(
    normalizedChangedPath,
    options,
  )
  const latexStore = useLatexStore()
  const resolved = await resolveLatexRuntimeChange({
    changedPath: normalizedChangedPath,
    workspacePath: workspaceStore.path || '',
    contentOverrides,
    sourceContent:
      typeof options.sourceContent === 'string' ? options.sourceContent : null,
    customSystemTexPath:
      String(latexStore.customSystemTexPath || '').trim() || null,
  }).catch(() => null)

  return {
    targets: Array.isArray(resolved?.targets)
      ? resolved.targets
          .filter((entry) => entry && typeof entry === 'object')
          .map((entry) => normalizeLatexCompileRequestValue(normalizedChangedPath, entry))
          .filter((entry) => entry.rootPath)
      : [],
    lintState: normalizeLatexLintStateValue(resolved?.lintState || null),
  }
}

export const useLatexStore = defineStore('latex', {
  state: () => {
    return {
      ...createLatexPreferenceState(),
      // Per-file compile state: { [texPath]: { status, errors, warnings, pdfPath, synctexPath, log, durationMs, lastCompiled } }
      compileState: {},
      buildQueueState: {},
      lintState: {},
      _preferencesHydrated: false,
      // Tectonic install state
      tectonicInstalled: false,
      tectonicPath: null,
      systemTexInstalled: false,
      systemTexPath: null,
      checkingCompilers: false,
      lastCompilerCheckAt: 0,
      chktexInstalled: false,
      chktexPath: null,
      latexindentInstalled: false,
      latexindentPath: null,
      checkingTools: false,
      lastToolCheckAt: 0,
      downloading: false,
      downloadProgress: 0,
      downloadError: null,
    }
  },

  getters: {
    stateForFile: (state) => (texPath) => {
      const targetPath = resolveLatexTargetPathFromState(state, texPath)
      return (
        state.compileState[texPath] ||
        state.compileState[targetPath] ||
        null
      )
    },

    isCompiling: (state) => (texPath) => {
      const targetPath = resolveLatexTargetPathFromState(state, texPath)
      const s =
        state.compileState[texPath] ||
        state.compileState[targetPath]
      return s?.status === 'compiling'
    },

    errorsForFile: (state) => (texPath) => {
      const targetPath = resolveLatexTargetPathFromState(state, texPath)
      return (
        state.compileState[texPath]?.errors ||
        state.compileState[targetPath]?.errors ||
        []
      )
    },

    warningsForFile: (state) => (texPath) => {
      const targetPath = resolveLatexTargetPathFromState(state, texPath)
      return (
        state.compileState[texPath]?.warnings ||
        state.compileState[targetPath]?.warnings ||
        []
      )
    },

    lintDiagnosticsForFile: (state) => (texPath) => {
      return state.lintState[texPath]?.diagnostics || []
    },

    hasAvailableCompiler: (state) => {
      if (state.compilerPreference === 'system') return state.systemTexInstalled
      if (state.compilerPreference === 'tectonic')
        return state.tectonicInstalled
      return state.systemTexInstalled || state.tectonicInstalled
    },

    activeCompilerLabel: (state) => {
      if (state.compilerPreference === 'system') return 'System TeX'
      if (state.compilerPreference === 'tectonic') return 'Tectonic'
      if (state.systemTexInstalled) return 'System TeX'
      if (state.tectonicInstalled) return 'Tectonic'
      return null
    },

    hasLatexFormatter: (state) => state.latexindentInstalled,

    queueStateForFile: (state) => (texPath) => {
      const targetPath = resolveLatexTargetPathFromState(state, texPath)
      return (
        state.buildQueueState[texPath] ||
        state.buildQueueState[targetPath] ||
        null
      )
    },
  },

  actions: {
    applyPreferenceState(preferences = {}) {
      const next = {
        ...createLatexPreferenceState(),
        ...preferences,
      }

      for (const key of LATEX_PREFERENCE_KEYS) {
        this[key] = next[key]
      }
    },

    snapshotPreferences() {
      return Object.fromEntries(
        LATEX_PREFERENCE_KEYS.map((key) => [key, this[key]]),
      )
    },

    async hydratePreferences(force = false) {
      if (!force && this._preferencesHydrated) return this.snapshotPreferences()

      const workspaceStore = useWorkspaceStore()
      const globalConfigDir = await workspaceStore.ensureGlobalConfigDir()
      const preferences = await loadLatexPreferencesFromRust(globalConfigDir)
      this.applyPreferenceState(preferences)
      this._preferencesHydrated = true
      return preferences
    },

    async persistPreferences(patch = {}) {
      const workspaceStore = useWorkspaceStore()
      const globalConfigDir = await workspaceStore.ensureGlobalConfigDir()
      const previous = this.snapshotPreferences()
      const optimistic = {
        ...previous,
        ...patch,
      }

      this.applyPreferenceState(optimistic)
      this._preferencesHydrated = true

      try {
        const preferences = await saveLatexPreferencesToRust(
          globalConfigDir,
          optimistic,
        )
        this.applyPreferenceState(preferences)
        this._preferencesHydrated = true
        return preferences
      } catch (error) {
        this.applyPreferenceState(previous)
        throw error
      }
    },

    currentBuildOptions() {
      return {
        buildExtraArgs: String(this.buildExtraArgs || '').trim(),
      }
    },

    setBuildQueueState(targetPath, patch = {}) {
      if (!targetPath) return null
      const current = this.buildQueueState[targetPath] || {}
      const next = {
        targetPath,
        buildExtraArgs: this.currentBuildOptions().buildExtraArgs,
        pendingCount: current.pendingCount || 0,
        sourcePath: current.sourcePath || targetPath,
        reason: current.reason || 'manual',
        updatedAt: Date.now(),
        ...current,
        ...patch,
      }
      this.buildQueueState = {
        ...this.buildQueueState,
        [targetPath]: next,
      }
      return next
    },

    clearBuildQueueState(targetPath) {
      if (!targetPath || !this.buildQueueState[targetPath]) return
      const nextState = { ...this.buildQueueState }
      delete nextState[targetPath]
      this.buildQueueState = nextState
    },

    applyLintState(filePath, nextState = null) {
      if (!filePath) return []
      this.lintState[filePath] = normalizeLatexLintStateValue(nextState)
      return this.lintState[filePath]?.diagnostics || []
    },

    async resolveScheduleRequest(sourcePath, targetPath, options = {}) {
      const buildOptions = this.currentBuildOptions()
      return scheduleLatexRuntime({
        sourcePath,
        targetPath,
        reason: options.reason || 'save',
        buildExtraArgs: buildOptions.buildExtraArgs,
        now: Date.now(),
      })
    },

    applyCompileStatePatch(filePath, patch = null) {
      if (!filePath || !patch || typeof patch !== 'object') return
      this.compileState[filePath] = {
        ...(this.compileState[filePath] || {}),
        ...patch,
      }
    },

    async resolveCompileRequest(texPath, options = {}) {
      const resolved = await resolveLatexRuntimeSourceFromRust(
        texPath,
        options,
      )
      return {
        project: resolved
          ? {
              sourcePath: resolved.sourcePath,
              rootPath: resolved.rootPath,
              previewPath: resolved.previewPath,
            }
          : null,
        compileTargetPath: resolved?.rootPath || texPath,
      }
    },

    async scheduleAutoCompile(texPath, options = {}) {
      if (!texPath) return

      const resolved = await resolveLatexRuntimeSourceFromRust(
        texPath,
        options,
      )
      this.applyLintState(texPath, resolved?.lintState)
      if (!this.autoCompile) return

      const compileTargetPath = resolved?.rootPath || texPath
      this.scheduleCompileTarget(texPath, compileTargetPath || texPath, options)
    },

    scheduleCompileTarget(sourcePath, targetPath, options = {}) {
      const timerKey = targetPath || sourcePath
      if (!timerKey) return null

      const nextSourcePath = sourcePath || timerKey
      void ensureLatexRuntimeCompileRequestListener().catch(() => {})
      void this.resolveScheduleRequest(nextSourcePath, timerKey, options)
        .then((schedule) => {
          if (schedule?.queueState) {
            this.setBuildQueueState(timerKey, schedule.queueState)
          }
        })
        .catch(() => {})

      return timerKey
    },

    async compile(texPath, options = {}) {
      await ensureLatexStreamListener()
      await ensureLatexRuntimeCompileRequestListener()
      this.cancelAutoCompile(texPath)

      try {
        const filesStore = useFilesStore()
        const sourceContent =
          typeof options.sourceContent === 'string'
            ? options.sourceContent
            : filesStore.fileContents?.[texPath]
        const { project, compileTargetPath } =
          await this.resolveCompileRequest(texPath, {
            ...options,
            sourceContent,
          })
        const targetKey = compileTargetPath || texPath
        const sourceFingerprint =
          typeof sourceContent === 'string'
            ? stableContentFingerprint(sourceContent)
            : ''
        const buildOptions = this.currentBuildOptions()
        const compileExecution = await executeLatexCompile({
          texPath,
          targetPath: targetKey,
          projectRootPath:
            project?.rootPath || compileTargetPath || targetKey,
          projectPreviewPath: project?.previewPath || '',
          reason: options.reason || 'manual',
          buildExtraArgs: buildOptions.buildExtraArgs,
          now: Date.now(),
          compilerPreference: this.compilerPreference || null,
          enginePreference: this.enginePreference || null,
          customSystemTexPath: this.customSystemTexPath || null,
          customTectonicPath: null,
        })
        if (sourceFingerprint) {
          if (
            compileExecution?.sourceState &&
            typeof compileExecution.sourceState === 'object'
          ) {
            compileExecution.sourceState.sourceFingerprint = sourceFingerprint
          }
          if (
            compileExecution?.targetState &&
            typeof compileExecution.targetState === 'object'
          ) {
            compileExecution.targetState.sourceFingerprint = sourceFingerprint
          }
        }
        this.applyCompileStatePatch(texPath, compileExecution?.sourceState)
        if (targetKey !== texPath) {
          this.applyCompileStatePatch(targetKey, compileExecution?.targetState)
        }

        // Dispatch event for PDF viewer to refresh
        window.dispatchEvent(
          new CustomEvent('latex-compile-done', {
            detail: {
              texPath,
              compileTargetPath,
              pdfPath:
                compileExecution?.sourceState?.pdfPath ||
                compileExecution?.result?.pdf_path ||
                '',
              previewPath:
                compileExecution?.sourceState?.previewPath ||
                compileExecution?.result?.pdf_path ||
                '',
              synctexPath:
                compileExecution?.sourceState?.synctexPath ||
                compileExecution?.result?.synctex_path ||
                '',
              lastCompiled: Number(
                compileExecution?.sourceState?.lastCompiled || Date.now(),
              ),
              sourceFingerprint: String(
                compileExecution?.sourceState?.sourceFingerprint ||
                  sourceFingerprint ||
                  '',
              ),
              ...compileExecution?.result,
            },
          }),
        )
        pushLatexLogToTerminal(
          texPath,
          {
            ...(compileExecution?.result || {
              success: false,
              duration_ms: 0,
              errors: [
                {
                  line: null,
                  message: 'LaTeX runtime returned no result.',
                  severity: 'error',
                },
              ],
              warnings: [],
              log: 'LaTeX runtime returned no result.',
            }),
            terminalText: String(
              compileExecution?.sourceState?.terminalText ||
              compileExecution?.targetState?.terminalText ||
              '',
            ),
          },
        )

        if (compileExecution?.queueState) {
          this.setBuildQueueState(targetKey, compileExecution.queueState)
        } else {
          this.clearBuildQueueState(targetKey)
        }
      } catch (err) {
        const targetKey =
          this.compileState[texPath]?.compileTargetPath ||
          options.targetPath ||
          resolveLatexTargetPathFromState(this, texPath) ||
          texPath
        this.applyCompileStatePatch(texPath, {
          status: 'error',
          errors: [{ line: null, message: err, severity: 'error' }],
          warnings: [],
          terminalText: buildFallbackLatexTerminalText(texPath, err),
          terminalTextFull: buildFallbackLatexTerminalText(texPath, err),
        })
        this.clearBuildQueueState(targetKey)
        pushLatexLogToTerminal(texPath, {
          success: false,
          duration_ms: 0,
          errors: [{ line: null, message: err, severity: 'error' }],
          warnings: [],
          log: String(err || ''),
          terminalText: buildFallbackLatexTerminalText(texPath, err),
        })
      }
    },

    async setCompilerPreference(preference) {
      await this.persistPreferences({ compilerPreference: preference })
      this.lastCompilerCheckAt = 0
      await this.checkCompilers(true)
    },

    async setEnginePreference(preference) {
      await this.persistPreferences({ enginePreference: preference })
    },

    async setBuildExtraArgs(value) {
      await this.persistPreferences({
        buildExtraArgs: String(value || ''),
      })
    },

    async setCustomSystemTexPath(path) {
      await this.persistPreferences({
        customSystemTexPath: String(path || '').trim(),
      })
      this.lastCompilerCheckAt = 0
      await this.checkCompilers(true)
      this.lastToolCheckAt = 0
      await this.checkTools(true)
    },

    cancelAutoCompile(texPath) {
      const rootPath = resolveLatexTargetPathFromState(this, texPath)
      const targetPaths = [texPath, rootPath].filter(Boolean)
      if (targetPaths.length > 0) {
        void cancelLatexRuntime(targetPaths).catch(() => {})
      }
      for (const key of targetPaths) {
        if (
          ['scheduled', 'queued'].includes(this.buildQueueState[key]?.phase)
        ) {
          this.clearBuildQueueState(key)
        }
      }
    },

    clearState(texPath) {
      delete this.compileState[texPath]
      delete this.lintState[texPath]
      this.cancelAutoCompile(texPath)
      this.clearBuildQueueState(texPath)
      this.clearBuildQueueState(resolveLatexTargetPathFromState(this, texPath))
    },

    async scheduleAutoBuildForPath(filePath, options = {}) {
      if (!filePath) return []
      const resolved = await resolveLatexRuntimeChangeFromRust(
        filePath,
        options,
      ).catch(() => null)
      const targets = resolved?.targets || []
      if (!Array.isArray(targets) || targets.length === 0) {
        return []
      }

      const targetPaths = targets.map(
        (target) => target.rootPath || target.sourcePath || filePath,
      )
      if (!this.autoCompile) {
        this.applyLintState(filePath, resolved?.lintState)
        return targetPaths
      }

      for (const target of targets) {
        this.scheduleCompileTarget(
          target.sourcePath || target.rootPath || filePath,
          target.rootPath || target.sourcePath || filePath,
          options,
        )
      }

      return targetPaths
    },

    async warmupSource(texPath, options = {}) {
      if (!texPath) return null
      const resolved = await resolveLatexRuntimeSourceFromRust(texPath, options)
        .catch(() => null)
      this.applyLintState(texPath, resolved?.lintState)
      return resolved
    },

    openCompileLog(texPath) {
      if (typeof window === 'undefined') return
      const state = this.compileState[texPath]
      if (!state) return

      window.dispatchEvent(
        new CustomEvent('terminal-log', {
          detail: {
            key: 'latex-log',
            label: 'LaTeX',
            text: String(
              state.terminalTextFull ||
              state.terminalText ||
              buildFallbackLatexTerminalText(texPath, state.log || ''),
            ),
            clear: true,
            open: true,
            status: state.status === 'success' ? 'success' : 'error',
          },
        }),
      )
    },

    cleanup() {
      this.buildQueueState = {}
      this.compileState = {}
      this.lintState = {}
    },

    async checkCompilers(force = false) {
      if (this.checkingCompilers) return
      if (
        !force &&
        this.lastCompilerCheckAt &&
        Date.now() - this.lastCompilerCheckAt < COMPILER_CHECK_CACHE_MS
      )
        return
      this.checkingCompilers = true
      try {
        const result = await checkLatexCompilers({
          customSystemTexPath: this.customSystemTexPath || null,
          customTectonicPath: null,
        })
        this.tectonicInstalled = result.tectonic?.installed === true
        this.tectonicPath = result.tectonic?.path || null
        this.systemTexInstalled = result.systemTex?.installed === true
        this.systemTexPath = result.systemTex?.path || null
      } catch {
        this.tectonicInstalled = false
        this.tectonicPath = null
        this.systemTexInstalled = false
        this.systemTexPath = null
      } finally {
        this.lastCompilerCheckAt = Date.now()
        this.checkingCompilers = false
      }
    },

    async checkTools(force = false) {
      if (this.checkingTools) return
      if (
        !force &&
        this.lastToolCheckAt &&
        Date.now() - this.lastToolCheckAt < TOOL_CHECK_CACHE_MS
      )
        return
      this.checkingTools = true
      try {
        const result = await checkLatexTools({
          customSystemTexPath: this.customSystemTexPath || null,
        })
        this.chktexInstalled = result.chktex?.installed === true
        this.chktexPath = result.chktex?.path || null
        this.latexindentInstalled = result.latexindent?.installed === true
        this.latexindentPath = result.latexindent?.path || null
      } catch {
        this.chktexInstalled = false
        this.chktexPath = null
        this.latexindentInstalled = false
        this.latexindentPath = null
      } finally {
        this.lastToolCheckAt = Date.now()
        this.checkingTools = false
      }
    },

    async refreshLint(texPath, options = {}) {
      if (!texPath) return []
      const resolved = await resolveLatexRuntimeSourceFromRust(
        texPath,
        options,
      )
      return this.applyLintState(texPath, resolved?.lintState)
    },

    async formatDocument(texPath, content) {
      return await formatLatexDocument({
        texPath,
        content,
        customSystemTexPath: this.customSystemTexPath || null,
      })
    },

    async checkTectonic() {
      await this.checkCompilers(true)
    },

    async downloadTectonic() {
      this.downloading = true
      this.downloadProgress = 0
      this.downloadError = null

      const unlisten = await listenTectonicDownloadProgress((payload) => {
        this.downloadProgress = payload.percent
      })

      try {
        const path = await downloadTectonic()
        this.tectonicInstalled = true
        this.tectonicPath = path
        await this.checkCompilers(true)
      } catch (e) {
        this.downloadError =
          typeof e === 'string' ? e : e.message || 'Download failed'
      } finally {
        unlisten()
        this.downloading = false
      }
    },
  },
})
