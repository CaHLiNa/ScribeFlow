import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useFilesStore } from './files'
import { useWorkspaceStore } from './workspace'
import { t } from '../i18n'
import { resolveCachedLatexRootPath } from '../services/latex/root'
import { stableContentFingerprint } from '../services/latex/projectGraph'
import { basenamePath } from '../utils/path'
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

function fileNameForLog(texPath = '') {
  return basenamePath(texPath) || texPath
}

function formatIssue(issue) {
  const line = issue?.line ? `L${issue.line}: ` : ''
  return `${line}${issue?.message || ''}`.trim()
}

function buildLatexTerminalOutput(
  texPath,
  result,
  { includeRawLog = true } = {},
) {
  const errors = Array.isArray(result.errors) ? result.errors : []
  const warnings = Array.isArray(result.warnings) ? result.warnings : []
  const lines = [
    `[LaTeX] ${fileNameForLog(texPath)}`,
    result.compiler_backend
      ? `${t('Compiler')}: ${result.compiler_backend}`
      : null,
    result.command_preview
      ? `${t('Command')}: ${result.command_preview}`
      : null,
    result.requested_program
      ? `${t('Magic comment')}: % !TEX program = ${result.requested_program} (${result.requested_program_applied ? t('applied') : t('detected but not applied')})`
      : null,
    result.success
      ? t('Compilation succeeded in {duration}', {
          duration: `${result.duration_ms || 0}ms`,
        })
      : t('Compilation failed'),
    `${t('Errors')}: ${errors.length}`,
    `${t('Warnings')}: ${warnings.length}`,
  ].filter(Boolean)

  if (errors.length > 0) {
    lines.push('')
    lines.push(t('Errors'))
    for (const issue of errors) {
      lines.push(`- ${formatIssue(issue)}`)
    }
  }

  if (warnings.length > 0) {
    lines.push('')
    lines.push(t('Warnings'))
    for (const issue of warnings) {
      lines.push(`- ${formatIssue(issue)}`)
    }
  }

  const rawLog = String(result.log || '').trim()
  if (includeRawLog && rawLog) {
    lines.push('')
    lines.push(`----- ${t('Full log')} -----`)
    lines.push(rawLog)
  }

  return `${lines.join('\n')}\n`
}

function pushLatexLogToTerminal(texPath, result) {
  if (typeof window === 'undefined') return
  const shouldOpenTerminal =
    !result.success ||
    (Array.isArray(result.errors) && result.errors.length > 0)
  window.dispatchEvent(
    new CustomEvent('terminal-log', {
      detail: {
        key: 'latex-log',
        label: 'LaTeX',
        text: buildLatexTerminalOutput(texPath, result, {
          includeRawLog: false,
        }),
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

  latexStreamUnlistenPromise = listen('latex-compile-stream', (event) => {
    const payload = event.payload || {}
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

  latexRuntimeCompileRequestUnlistenPromise = listen(
    'latex-runtime-compile-requested',
    (event) => {
      const payload = event.payload || {}
      const latexStore = useLatexStore()
      const sourcePath = String(payload.sourcePath || '')
      const targetPath = String(payload.targetPath || sourcePath)
      if (!sourcePath) return
      void latexStore.compile(sourcePath, {
        reason: String(payload.reason || 'save'),
        targetPath,
      })
    },
  )

  await latexRuntimeCompileRequestUnlistenPromise
}

async function resolveLatexCompileRequestFromRust(sourcePath, options = {}) {
  const filesStore = useFilesStore()
  const workspaceStore = useWorkspaceStore()
  const normalizedSourcePath = String(sourcePath || '').trim()
  if (!normalizedSourcePath) return null

  const contentOverrides =
    options.sourceContent === undefined
      ? options.contentOverrides || {}
      : {
          ...(options.contentOverrides || {}),
          [normalizedSourcePath]: options.sourceContent,
        }

  const flatFiles = await filesStore.ensureFlatFilesReady().catch(() => [])
  const resolved = await invoke('latex_compile_request_resolve', {
    params: {
      sourcePath: normalizedSourcePath,
      flatFiles: Array.isArray(flatFiles)
        ? flatFiles
            .map((entry) => String(entry?.path || entry || ''))
            .filter(Boolean)
        : [],
      contentOverrides,
    },
  }).catch(() => null)

  const rootPath = String(resolved?.rootPath || normalizedSourcePath)
  return {
    filesStore,
    workspaceStore,
    sourcePath: String(resolved?.sourcePath || normalizedSourcePath),
    rootPath,
    previewPath: String(
      resolved?.previewPath || `${rootPath.replace(/\.(tex|latex)$/i, '')}.pdf`,
    ),
    contentOverrides,
  }
}

async function resolveLatexCompileTargetsFromRust(changedPath, options = {}) {
  const filesStore = useFilesStore()
  const normalizedChangedPath = String(changedPath || '').trim()
  if (!normalizedChangedPath) return []

  const contentOverrides =
    options.sourceContent === undefined
      ? options.contentOverrides || {}
      : {
          ...(options.contentOverrides || {}),
          [normalizedChangedPath]: options.sourceContent,
        }

  const flatFiles = await filesStore.ensureFlatFilesReady().catch(() => [])
  const targets = await invoke('latex_compile_targets_resolve', {
    params: {
      changedPath: normalizedChangedPath,
      flatFiles: Array.isArray(flatFiles)
        ? flatFiles
            .map((entry) => String(entry?.path || entry || ''))
            .filter(Boolean)
        : [],
      contentOverrides,
    },
  }).catch(() => [])

  return Array.isArray(targets)
    ? targets
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({
          sourcePath: String(entry.sourcePath || normalizedChangedPath),
          rootPath: String(
            entry.rootPath || entry.sourcePath || normalizedChangedPath,
          ),
          previewPath: String(
            entry.previewPath ||
              `${String(entry.rootPath || entry.sourcePath || normalizedChangedPath).replace(/\.(tex|latex)$/i, '')}.pdf`,
          ),
        }))
        .filter((entry) => entry.rootPath)
    : []
}

async function resolveLatexLintStateFromRust(texPath, options = {}) {
  const filesStore = useFilesStore()
  const workspaceStore = useWorkspaceStore()
  const sourceContent =
    options.sourceContent ?? filesStore.fileContents?.[texPath] ?? null
  return invoke('latex_runtime_lint_resolve', {
    params: {
      texPath,
      content: sourceContent,
      customSystemTexPath:
        String(useLatexStore().customSystemTexPath || '').trim() || null,
      workspacePath: workspaceStore.path || null,
    },
  }).catch(() => null)
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
      return (
        state.compileState[texPath] ||
        state.compileState[resolveCachedLatexRootPath(texPath)] ||
        null
      )
    },

    isCompiling: (state) => (texPath) => {
      const s =
        state.compileState[texPath] ||
        state.compileState[resolveCachedLatexRootPath(texPath)]
      return s?.status === 'compiling'
    },

    errorsForFile: (state) => (texPath) => {
      return (
        state.compileState[texPath]?.errors ||
        state.compileState[resolveCachedLatexRootPath(texPath)]?.errors ||
        []
      )
    },

    warningsForFile: (state) => (texPath) => {
      return (
        state.compileState[texPath]?.warnings ||
        state.compileState[resolveCachedLatexRootPath(texPath)]?.warnings ||
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
      return (
        state.buildQueueState[texPath] ||
        state.buildQueueState[resolveCachedLatexRootPath(texPath)] ||
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

    async resolveScheduleRequest(sourcePath, targetPath, options = {}) {
      const buildOptions = this.currentBuildOptions()
      return invoke('latex_runtime_schedule', {
        params: {
          sourcePath,
          targetPath,
          reason: options.reason || 'save',
          buildExtraArgs: buildOptions.buildExtraArgs,
          now: Date.now(),
        },
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
      const resolved = await resolveLatexCompileRequestFromRust(
        texPath,
        options,
      )
      return {
        filesStore: resolved?.filesStore || useFilesStore(),
        workspaceStore: resolved?.workspaceStore || useWorkspaceStore(),
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

      void this.refreshLint(texPath, options).catch(() => {})
      if (!this.autoCompile) return

      const { compileTargetPath } = await this.resolveCompileRequest(
        texPath,
        options,
      )
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
        const { filesStore, project, compileTargetPath } =
          await this.resolveCompileRequest(texPath, options)
        const targetKey = compileTargetPath || texPath
        const sourceContent =
          typeof options.sourceContent === 'string'
            ? options.sourceContent
            : filesStore.fileContents?.[texPath]
        const sourceFingerprint =
          typeof sourceContent === 'string'
            ? stableContentFingerprint(sourceContent)
            : ''
        const buildOptions = this.currentBuildOptions()
        const compileExecution = await invoke('latex_runtime_compile_execute', {
          params: {
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
          },
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
          compileExecution?.result || {
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
          resolveCachedLatexRootPath(texPath) ||
          texPath
        this.applyCompileStatePatch(texPath, {
          status: 'error',
          errors: [{ line: null, message: err, severity: 'error' }],
          warnings: [],
        })
        this.clearBuildQueueState(targetKey)
        pushLatexLogToTerminal(texPath, {
          success: false,
          duration_ms: 0,
          errors: [{ line: null, message: err, severity: 'error' }],
          warnings: [],
          log: String(err || ''),
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
      const rootPath = resolveCachedLatexRootPath(texPath)
      const targetPaths = [texPath, rootPath].filter(Boolean)
      if (targetPaths.length > 0) {
        void invoke('latex_runtime_cancel', {
          params: {
            targetPaths,
          },
        }).catch(() => {})
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
      this.clearBuildQueueState(resolveCachedLatexRootPath(texPath))
    },

    async scheduleAutoBuildForPath(filePath, options = {}) {
      if (!filePath) return []
      const targets = await resolveLatexCompileTargetsFromRust(
        filePath,
        options,
      ).catch(() => [])
      if (!Array.isArray(targets) || targets.length === 0) {
        return []
      }

      const targetPaths = targets.map(
        (target) => target.rootPath || target.sourcePath || filePath,
      )
      if (!this.autoCompile) {
        const lowerPath = String(filePath).toLowerCase()
        if (lowerPath.endsWith('.tex') || lowerPath.endsWith('.latex')) {
          void this.refreshLint(filePath, options).catch(() => {})
        }
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

    openCompileLog(texPath) {
      if (typeof window === 'undefined') return
      const state = this.compileState[texPath]
      if (!state) return

      window.dispatchEvent(
        new CustomEvent('terminal-log', {
          detail: {
            key: 'latex-log',
            label: 'LaTeX',
            text: buildLatexTerminalOutput(
              texPath,
              {
                success: state.status === 'success',
                errors: state.errors || [],
                warnings: state.warnings || [],
                log: state.log || '',
                duration_ms: state.durationMs || 0,
              },
              { includeRawLog: true },
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
        const result = await invoke('check_latex_compilers', {
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
        const result = await invoke('check_latex_tools', {
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
      const nextState = await resolveLatexLintStateFromRust(texPath, options)
      this.lintState[texPath] = {
        status: String(nextState?.status || 'unavailable'),
        diagnostics: Array.isArray(nextState?.diagnostics)
          ? nextState.diagnostics
          : [],
        error: nextState?.error || null,
        updatedAt: Number(nextState?.updatedAt || Date.now()),
      }

      return this.lintState[texPath]?.diagnostics || []
    },

    async formatDocument(texPath, content) {
      return await invoke('format_latex_document', {
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

      const unlisten = await listen('tectonic-download-progress', (event) => {
        this.downloadProgress = event.payload.percent
      })

      try {
        const path = await invoke('download_tectonic')
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
