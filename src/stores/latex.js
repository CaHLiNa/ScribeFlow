import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useFilesStore } from './files'
import { useWorkspaceStore } from './workspace'
import { t } from '../i18n'
import { resolveCachedLatexRootPath, resolveLatexCompileTarget } from '../services/latex/root'
import {
  stableContentFingerprint,
  resolveLatexCompileTargetsForChange,
  resolveLatexProjectGraph,
} from '../services/latex/projectGraph'
import {
  resolveLatexCompileFail,
  resolveLatexCompileFinish,
  resolveLatexCompileStart,
} from '../services/latex/runtime'
import { resolveExistingLatexSynctexPath } from '../services/latex/synctex'
import { isBrowserPreviewRuntime } from '../app/browserPreview/routes.js'
import { basenamePath } from '../utils/path'
import {
  createLatexPreferenceState,
  loadLatexPreferences as loadLatexPreferencesFromRust,
  saveLatexPreferences as saveLatexPreferencesToRust,
} from '../services/latexPreferences.js'

const COMPILER_CHECK_CACHE_MS = 5 * 60 * 1000
const TOOL_CHECK_CACHE_MS = 5 * 60 * 1000
const LATEX_AUTOCOMPILE_DEBOUNCE_MS = 1200
export const LATEX_BUILD_RECIPE_OPTIONS = Object.freeze([
  'default',
  'shell-escape',
  'clean-build',
  'shell-escape-clean',
])

let latexStreamUnlistenPromise = null
let latexForwardSyncRequestId = 0

const LATEX_PREFERENCE_KEYS = [
  'compilerPreference',
  'enginePreference',
  'autoCompile',
  'formatOnSave',
  'buildRecipe',
  'buildExtraArgs',
  'customSystemTexPath',
]

export function normalizeLatexBuildRecipe(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return LATEX_BUILD_RECIPE_OPTIONS.includes(normalized)
    ? normalized
    : 'default'
}

export function formatLatexBuildRecipeLabel(recipe, translate = t) {
  switch (normalizeLatexBuildRecipe(recipe)) {
    case 'shell-escape':
      return translate('Shell escape')
    case 'clean-build':
      return translate('Clean build')
    case 'shell-escape-clean':
      return translate('Shell escape + clean build')
    default:
      return translate('Default build')
  }
}

function fileNameForLog(texPath = '') {
  return basenamePath(texPath) || texPath
}

function formatIssue(issue) {
  const line = issue?.line ? `L${issue.line}: ` : ''
  return `${line}${issue?.message || ''}`.trim()
}

function buildLatexTerminalOutput(texPath, result, { includeRawLog = true } = {}) {
  const errors = Array.isArray(result.errors) ? result.errors : []
  const warnings = Array.isArray(result.warnings) ? result.warnings : []
  const lines = [
    `[LaTeX] ${fileNameForLog(texPath)}`,
    result.compiler_backend ? `${t('Compiler')}: ${result.compiler_backend}` : null,
    result.command_preview ? `${t('Command')}: ${result.command_preview}` : null,
    result.requested_program
      ? `${t('Magic comment')}: % !TEX program = ${result.requested_program} (${result.requested_program_applied ? t('applied') : t('detected but not applied')})`
      : null,
    result.success
      ? t('Compilation succeeded in {duration}', { duration: `${result.duration_ms || 0}ms` })
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
  const shouldOpenTerminal = !result.success
    || (Array.isArray(result.errors) && result.errors.length > 0)
  window.dispatchEvent(new CustomEvent('terminal-log', {
    detail: {
      key: 'latex-log',
      label: 'LaTeX',
      text: buildLatexTerminalOutput(texPath, result, { includeRawLog: false }),
      clear: false,
      open: shouldOpenTerminal,
      status: result.success ? 'success' : 'error',
    },
  }))
}

function pushLatexStreamToTerminal({ texPath, line, clear = false, header = false, open = false, status = null } = {}) {
  if (typeof window === 'undefined' || !line) return
  window.dispatchEvent(new CustomEvent('terminal-stream', {
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
  }))
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

export const useLatexStore = defineStore('latex', {
  state: () => {
    return ({
    ...createLatexPreferenceState(),
    // Per-file compile state: { [texPath]: { status, errors, warnings, pdfPath, synctexPath, log, durationMs, lastCompiled } }
    compileState: {},
    // Debounce timers keyed by compile target
    _timers: {},
    // Latest source file that requested work for a given compile target
    _latestSourceByTarget: {},
    buildQueueState: {},
    lintState: {},
    // Pending forward SyncTeX requests keyed by TeX source path.
    forwardSyncRequests: {},
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
  })
  },

  getters: {
    stateForFile: (state) => (texPath) => {
      return state.compileState[texPath]
        || state.compileState[resolveCachedLatexRootPath(texPath)]
        || null
    },

    isCompiling: (state) => (texPath) => {
      const s = state.compileState[texPath] || state.compileState[resolveCachedLatexRootPath(texPath)]
      return s?.status === 'compiling'
    },

    errorsForFile: (state) => (texPath) => {
      return state.compileState[texPath]?.errors
        || state.compileState[resolveCachedLatexRootPath(texPath)]?.errors
        || []
    },

    warningsForFile: (state) => (texPath) => {
      return state.compileState[texPath]?.warnings
        || state.compileState[resolveCachedLatexRootPath(texPath)]?.warnings
        || []
    },

    lintDiagnosticsForFile: (state) => (texPath) => {
      return state.lintState[texPath]?.diagnostics || []
    },

    forwardSyncRequestFor: (state) => (texPath) => {
      return state.forwardSyncRequests[texPath] || null
    },

    hasAvailableCompiler: (state) => {
      if (state.compilerPreference === 'system') return state.systemTexInstalled
      if (state.compilerPreference === 'tectonic') return state.tectonicInstalled
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
      return state.buildQueueState[texPath]
        || state.buildQueueState[resolveCachedLatexRootPath(texPath)]
        || null
    },

    buildRecipeLabel: (state) => formatLatexBuildRecipeLabel(state.buildRecipe),

    buildRecipeLabelFor: () => (recipe) => formatLatexBuildRecipeLabel(recipe),
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
      return Object.fromEntries(LATEX_PREFERENCE_KEYS.map((key) => [key, this[key]]))
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
        const preferences = await saveLatexPreferencesToRust(globalConfigDir, optimistic)
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
        buildRecipe: normalizeLatexBuildRecipe(this.buildRecipe),
        buildExtraArgs: String(this.buildExtraArgs || '').trim(),
      }
    },

    setBuildQueueState(targetPath, patch = {}) {
      if (!targetPath) return null
      const current = this.buildQueueState[targetPath] || {}
      const next = {
        targetPath,
        recipe: this.currentBuildOptions().buildRecipe,
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

    applyCompileStatePatch(filePath, patch = null) {
      if (!filePath || !patch || typeof patch !== 'object') return
      this.compileState[filePath] = {
        ...(this.compileState[filePath] || {}),
        ...patch,
      }
    },

    async resolveCompileRequest(texPath, options = {}) {
      const filesStore = useFilesStore()
      const workspaceStore = useWorkspaceStore()
      const contentOverrides = options.sourceContent === undefined
        ? options.contentOverrides
        : {
            ...(options.contentOverrides || {}),
            [texPath]: options.sourceContent,
          }

      const project = await resolveLatexProjectGraph(texPath, {
        filesStore,
        workspacePath: workspaceStore.path,
        contentOverrides,
      }).catch(() => null)
      const compileTargetPath = await resolveLatexCompileTarget(texPath, {
        filesStore,
        workspacePath: workspaceStore.path,
        contentOverrides,
      }).catch(() => texPath)

      return {
        filesStore,
        workspaceStore,
        project,
        compileTargetPath: compileTargetPath || texPath,
      }
    },

    async scheduleAutoCompile(texPath, options = {}) {
      if (!texPath) return

      void this.refreshLint(texPath, options).catch(() => {})
      if (!this.autoCompile) return

      const { compileTargetPath } = await this.resolveCompileRequest(texPath, options)
      this.scheduleCompileTarget(texPath, compileTargetPath || texPath, options)
    },

    scheduleCompileTarget(sourcePath, targetPath, options = {}) {
      const timerKey = targetPath || sourcePath
      if (!timerKey) return null

      const nextSourcePath = sourcePath || timerKey
      const reason = options.reason || 'save'
      this._latestSourceByTarget[timerKey] = nextSourcePath
      this.setBuildQueueState(timerKey, {
        phase: 'scheduled',
        sourcePath: nextSourcePath,
        reason,
        pendingCount: 0,
        scheduledAt: Date.now(),
      })

      if (this._timers[timerKey]) {
        clearTimeout(this._timers[timerKey])
      }

      // Auto-save is 1s, so this keeps the total delay much closer to VS Code.
      this._timers[timerKey] = setTimeout(() => {
        const resolvedSourcePath = this._latestSourceByTarget[timerKey] || nextSourcePath
        delete this._timers[timerKey]
        void this.compile(resolvedSourcePath, {
          reason,
          targetPath: timerKey,
        })
      }, LATEX_AUTOCOMPILE_DEBOUNCE_MS)

      return timerKey
    },

    async compile(texPath, options = {}) {
      await ensureLatexStreamListener()
      this.cancelAutoCompile(texPath)

      try {
        const { filesStore, project, compileTargetPath } = await this.resolveCompileRequest(texPath, options)
        const targetKey = compileTargetPath || texPath
        const reason = options.reason || 'manual'
        const queueState = this.buildQueueState[targetKey] || null
        const sourceContent =
          typeof options.sourceContent === 'string'
            ? options.sourceContent
            : filesStore.fileContents?.[texPath]
        const sourceFingerprint =
          typeof sourceContent === 'string' ? stableContentFingerprint(sourceContent) : ''
        this._latestSourceByTarget[targetKey] = texPath
        const buildOptions = this.currentBuildOptions()
        const compileStart = await resolveLatexCompileStart({
          texPath,
          targetPath: targetKey,
          reason,
          queueState,
          buildRecipe: buildOptions.buildRecipe,
          buildExtraArgs: buildOptions.buildExtraArgs,
          now: Date.now(),
        })

        if (compileStart?.queueState) {
          this.setBuildQueueState(targetKey, compileStart.queueState)
        }
        this.applyCompileStatePatch(texPath, compileStart?.sourceState)
        if (targetKey !== texPath) {
          this.applyCompileStatePatch(targetKey, compileStart?.targetState)
        }
        if (compileStart?.shouldRun !== true) {
          return
        }

        const result = await invoke('compile_latex', {
          texPath: compileTargetPath,
          compilerPreference: this.compilerPreference,
          enginePreference: this.enginePreference,
          buildRecipe: buildOptions.buildRecipe,
          buildExtraArgs: buildOptions.buildExtraArgs || null,
          customSystemTexPath: this.customSystemTexPath || null,
          customTectonicPath: null,
        })

        const compileFinish = await resolveLatexCompileFinish({
          texPath,
          targetPath: targetKey,
          projectRootPath: project?.rootPath || compileTargetPath || targetKey,
          projectPreviewPath: project?.previewPath || result.pdf_path || '',
          buildRecipe: buildOptions.buildRecipe,
          buildExtraArgs: buildOptions.buildExtraArgs,
          now: Date.now(),
          queueState: this.buildQueueState[targetKey] || null,
          result,
        })
        if (sourceFingerprint) {
          if (compileFinish?.sourceState && typeof compileFinish.sourceState === 'object') {
            compileFinish.sourceState.sourceFingerprint = sourceFingerprint
          }
          if (compileFinish?.targetState && typeof compileFinish.targetState === 'object') {
            compileFinish.targetState.sourceFingerprint = sourceFingerprint
          }
        }
        this.applyCompileStatePatch(texPath, compileFinish?.sourceState)
        if (targetKey !== texPath) {
          this.applyCompileStatePatch(targetKey, compileFinish?.targetState)
        }

        // Dispatch event for PDF viewer to refresh
        window.dispatchEvent(new CustomEvent('latex-compile-done', {
          detail: { texPath, compileTargetPath, ...result },
        }))
        pushLatexLogToTerminal(texPath, result)

        if (compileFinish?.rerunRequested) {
          const nextSourcePath = compileFinish.nextSourcePath || this._latestSourceByTarget[targetKey] || texPath
          if (compileFinish.queueState) {
            this.setBuildQueueState(targetKey, compileFinish.queueState)
          }
          void this.compile(nextSourcePath, {
            reason: 'rerun',
            targetPath: targetKey,
          })
        } else {
          this.clearBuildQueueState(targetKey)
        }
      } catch (err) {
        const targetKey = this.compileState[texPath]?.compileTargetPath || options.targetPath || resolveCachedLatexRootPath(texPath) || texPath
        const buildOptions = this.currentBuildOptions()
        const compileFail = await resolveLatexCompileFail({
          texPath,
          targetPath: targetKey,
          projectRootPath: this.compileState[targetKey]?.projectRootPath || targetKey,
          projectPreviewPath: this.compileState[targetKey]?.previewPath || '',
          buildRecipe: buildOptions.buildRecipe,
          buildExtraArgs: buildOptions.buildExtraArgs,
          now: Date.now(),
          queueState: this.buildQueueState[targetKey] || null,
          result: {
            success: false,
            pdf_path: null,
            synctex_path: null,
            errors: [{ line: null, message: err, severity: 'error' }],
            warnings: [],
            log: String(err || ''),
            duration_ms: 0,
            compiler_backend: null,
            command_preview: null,
            requested_program: null,
            requested_program_applied: false,
          },
        }).catch(() => null)
        this.applyCompileStatePatch(texPath, compileFail?.sourceState || {
          status: 'error',
          errors: [{ line: null, message: err, severity: 'error' }],
          warnings: [],
        })
        if (targetKey !== texPath) {
          this.applyCompileStatePatch(targetKey, compileFail?.targetState)
        }
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

    async setAutoCompile(enabled) {
      await this.persistPreferences({ autoCompile: enabled === true })
    },

    async setFormatOnSave(enabled) {
      await this.persistPreferences({ formatOnSave: enabled === true })
    },

    async setBuildRecipe(recipe) {
      await this.persistPreferences({
        buildRecipe: normalizeLatexBuildRecipe(recipe),
      })
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
      for (const key of [texPath, rootPath].filter(Boolean)) {
        if (this._timers[key]) {
          clearTimeout(this._timers[key])
          delete this._timers[key]
        }
        if (this.buildQueueState[key]?.phase === 'scheduled') {
          this.clearBuildQueueState(key)
        }
      }
    },

    requestForwardSync(texPath, line, column = 0) {
      const lineNumber = Number(line)
      const columnNumber = Number(column)
      if (!texPath || !Number.isInteger(lineNumber) || lineNumber < 1) return null

      const request = {
        id: ++latexForwardSyncRequestId,
        texPath,
        line: lineNumber,
        column: Number.isInteger(columnNumber) && columnNumber >= 0 ? columnNumber : 0,
        requestedAt: Date.now(),
      }

      this.forwardSyncRequests = {
        ...this.forwardSyncRequests,
        [texPath]: request,
      }
      return request
    },

    clearForwardSync(texPath, requestId = null) {
      if (!texPath || !this.forwardSyncRequests[texPath]) return
      if (requestId != null && this.forwardSyncRequests[texPath]?.id !== requestId) return

      const nextRequests = { ...this.forwardSyncRequests }
      delete nextRequests[texPath]
      this.forwardSyncRequests = nextRequests
    },

    clearState(texPath) {
      delete this.compileState[texPath]
      delete this.lintState[texPath]
      this.cancelAutoCompile(texPath)
      this.clearBuildQueueState(texPath)
      this.clearBuildQueueState(resolveCachedLatexRootPath(texPath))
      this.clearForwardSync(texPath)
    },

    async registerExistingArtifact(texPath, pdfPath, options = {}) {
      if (!texPath || !pdfPath) return null
      const targetKey = options.targetPath || resolveCachedLatexRootPath(texPath) || texPath
      const previous = this.compileState[texPath] || {}
      const resolvedSynctexPath = previous.synctexPath
        || options.synctexPath
        || await resolveExistingLatexSynctexPath(pdfPath)
      const nextState = {
        ...previous,
        status: previous.status || 'idle',
        pdfPath,
        synctexPath: resolvedSynctexPath || null,
        previewPath: previous.previewPath || pdfPath,
        compileTargetPath: previous.compileTargetPath || targetKey,
        projectRootPath: previous.projectRootPath || targetKey,
      }
      this.compileState[texPath] = nextState
      if (targetKey) {
        this.compileState[targetKey] = {
          ...(this.compileState[targetKey] || {}),
          ...nextState,
          linkedSourcePath: texPath,
          compileTargetPath: targetKey,
          projectRootPath: targetKey,
        }
      }
      return nextState
    },

    async scheduleAutoBuildForPath(filePath, options = {}) {
      if (!filePath) return []
      const filesStore = useFilesStore()
      const workspaceStore = useWorkspaceStore()
      const contentOverrides = options.sourceContent === undefined
        ? options.contentOverrides
        : {
            ...(options.contentOverrides || {}),
            [filePath]: options.sourceContent,
          }

      const targets = await resolveLatexCompileTargetsForChange(filePath, {
        filesStore,
        workspacePath: workspaceStore.path,
        contentOverrides,
      }).catch(() => [])
      if (!Array.isArray(targets) || targets.length === 0) {
        return []
      }

      const targetPaths = targets.map((target) => target.rootPath || target.sourcePath || filePath)
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

      window.dispatchEvent(new CustomEvent('terminal-log', {
        detail: {
          key: 'latex-log',
          label: 'LaTeX',
          text: buildLatexTerminalOutput(texPath, {
            success: state.status === 'success',
            errors: state.errors || [],
            warnings: state.warnings || [],
            log: state.log || '',
            duration_ms: state.durationMs || 0,
          }, { includeRawLog: true }),
          clear: true,
          open: true,
          status: state.status === 'success' ? 'success' : 'error',
        },
      }))
    },

    cleanup() {
      for (const texPath of Object.keys(this._timers)) {
        clearTimeout(this._timers[texPath])
      }
      this._timers = {}
      this._latestSourceByTarget = {}
      this.buildQueueState = {}
      this.compileState = {}
      this.lintState = {}
      this.forwardSyncRequests = {}
    },

    applyBrowserPreviewDiagnostics() {
      this.tectonicInstalled = true
      this.tectonicPath = '/opt/preview/bin/tectonic'
      this.systemTexInstalled = true
      this.systemTexPath = '/Library/TeX/texbin/latexmk'
      this.chktexInstalled = true
      this.chktexPath = '/opt/preview/bin/chktex'
      this.latexindentInstalled = true
      this.latexindentPath = '/opt/preview/bin/latexindent'
      this.lastCompilerCheckAt = Date.now()
      this.lastToolCheckAt = Date.now()
      this.downloadError = null
    },

    async checkCompilers(force = false) {
      if (isBrowserPreviewRuntime()) {
        this.applyBrowserPreviewDiagnostics()
        return
      }
      if (this.checkingCompilers) return
      if (!force && this.lastCompilerCheckAt && Date.now() - this.lastCompilerCheckAt < COMPILER_CHECK_CACHE_MS) return
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
      if (isBrowserPreviewRuntime()) {
        this.applyBrowserPreviewDiagnostics()
        return
      }
      if (this.checkingTools) return
      if (!force && this.lastToolCheckAt && Date.now() - this.lastToolCheckAt < TOOL_CHECK_CACHE_MS) return
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
      if (this.lastToolCheckAt && !this.chktexInstalled) {
        this.lintState[texPath] = {
          status: 'unavailable',
          diagnostics: [],
          error: null,
          updatedAt: Date.now(),
        }
        return []
      }

      const sourceContent = options.sourceContent ?? useFilesStore().fileContents?.[texPath] ?? null

      try {
        const workspaceStore = useWorkspaceStore()
        const diagnostics = await invoke('run_chktex', {
          texPath,
          content: sourceContent,
          customSystemTexPath: this.customSystemTexPath || null,
          workspacePath: workspaceStore.path || null,
        })
        this.lintState[texPath] = {
          status: 'ready',
          diagnostics: Array.isArray(diagnostics) ? diagnostics : [],
          error: null,
          updatedAt: Date.now(),
        }
      } catch (error) {
        console.warn('[latex] chktex failed:', error)
        this.lintState[texPath] = {
          status: 'error',
          diagnostics: [],
          error: error?.message || String(error || ''),
          updatedAt: Date.now(),
        }
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
      if (isBrowserPreviewRuntime()) {
        this.applyBrowserPreviewDiagnostics()
        return
      }
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
        this.downloadError = typeof e === 'string' ? e : e.message || 'Download failed'
      } finally {
        unlisten()
        this.downloading = false
      }
    },
  },
})
