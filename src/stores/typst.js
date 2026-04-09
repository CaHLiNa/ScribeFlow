import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useWorkspaceStore } from './workspace'
import { t } from '../i18n'
import { events } from '../services/telemetry'
import { buildTypstProjectProblems } from '../services/typst/diagnostics.js'
import {
  resolveTypstAffectedRootTargets,
  resolveTypstProjectGraph,
} from '../services/typst/projectGraph.js'
import {
  resolveCachedTypstPreviewPath,
  resolveCachedTypstRootPath,
  resolveTypstCompileTarget,
} from '../services/typst/root.js'

const COMPILER_CHECK_CACHE_MS = 5 * 60 * 1000
const TYPST_AUTOCOMPILE_DEBOUNCE_MS = 350
let typstStreamUnlistenPromise = null

const readStoredValue = (key, fallback = '') => {
  try {
    const value = localStorage.getItem(key)
    return value == null ? fallback : value
  } catch {
    return fallback
  }
}

const readStoredBoolean = (key, fallback = false) => {
  const value = readStoredValue(key, fallback ? 'true' : 'false')
  return value === 'true'
}

function fileNameForLog(filePath = '') {
  return String(filePath).split('/').pop() || filePath
}

function formatIssue(issue) {
  const line = issue?.line ? `L${issue.line}: ` : ''
  return `${line}${issue?.message || ''}`.trim()
}

function buildTypstTerminalOutput(filePath, result) {
  const errors = Array.isArray(result.errors) ? result.errors : []
  const warnings = Array.isArray(result.warnings) ? result.warnings : []
  const lines = [
    `[Typst] ${fileNameForLog(filePath)}`,
    result.success
      ? t('Compilation succeeded in {duration}', { duration: `${result.duration_ms || 0}ms` })
      : t('Compilation failed'),
    `${t('Errors')}: ${errors.length}`,
    `${t('Warnings')}: ${warnings.length}`,
  ]

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
  if (rawLog) {
    lines.push('')
    lines.push(`----- ${t('Full log')} -----`)
    lines.push(rawLog)
  }

  return `${lines.join('\n')}\n`
}

function buildPreviewPath(filePath = '') {
  return String(filePath || '').replace(/\.typ$/i, '.pdf')
}

function pushTypstLogToTerminal(filePath, result) {
  if (typeof window === 'undefined') return
  const shouldOpenTerminal = !result.success
    || (Array.isArray(result.errors) && result.errors.length > 0)
  window.dispatchEvent(new CustomEvent('terminal-log', {
    detail: {
      key: 'typst-log',
      label: 'Typst',
      text: buildTypstTerminalOutput(filePath, result),
      clear: false,
      open: shouldOpenTerminal,
      status: result.success ? 'success' : 'error',
    },
  }))
}

function pushTypstStreamToTerminal({ filePath, line, clear = false, header = false, open = false, status = null } = {}) {
  if (typeof window === 'undefined' || !line) return
  window.dispatchEvent(new CustomEvent('terminal-stream', {
    detail: {
      key: 'typst-log',
      label: 'Typst',
      sourcePath: filePath,
      text: line.endsWith('\n') ? line : `${line}\n`,
      clear,
      header,
      open,
      status,
    },
  }))
}

async function ensureTypstStreamListener() {
  if (typstStreamUnlistenPromise) {
    await typstStreamUnlistenPromise
    return
  }

  typstStreamUnlistenPromise = listen('typst-compile-stream', (event) => {
    const payload = event.payload || {}
    pushTypstStreamToTerminal({
      filePath: payload.typPath,
      line: payload.line,
      clear: payload.clear === true,
      header: payload.header === true,
      open: payload.open === true,
      status: payload.status || null,
    })
  })

  await typstStreamUnlistenPromise
}

export const useTypstStore = defineStore('typst', {
  state: () => ({
    available: false,
    compilerPath: null,
    customCompilerPath: readStoredValue('typst.customCompilerPath', ''),
    autoCompile: readStoredBoolean('typst.autoCompile', false),
    formatOnSave: readStoredBoolean('typst.formatOnSave', false),
    inlayHints: readStoredBoolean('typst.inlayHints', false),
    checkingCompiler: false,
    lastCompilerCheckAt: 0,
    downloading: false,
    downloadProgress: 0,
    downloadError: null,
    compileState: {}, // { [typPath]: { status, errors, warnings, pdfPath, log, durationMs, lastCompiled } }
    _timers: {},
    _activeCompileTargets: {},
    _recompileNeeded: {},
    _latestSourceByTarget: {},
    buildQueueState: {},
    tinymistAvailable: false,
    liveState: {}, // { [typPath]: { tinymistBacked, diagnostics, outlineItems, outlineLoaded, projectProblems } }
  }),

  getters: {
    stateForFile: (state) => (filePath) => {
      return state.compileState[filePath]
        || state.compileState[resolveCachedTypstRootPath(filePath)]
        || null
    },
    isCompiling: (state) => (filePath) => {
      const nextState = state.compileState[filePath] || state.compileState[resolveCachedTypstRootPath(filePath)]
      return nextState?.status === 'compiling'
    },
    liveStateForFile: (state) => (filePath) => state.liveState[filePath] || null,
    queueStateForFile: (state) => (filePath) => {
      return state.buildQueueState[filePath]
        || state.buildQueueState[resolveCachedTypstRootPath(filePath)]
        || null
    },
  },

  actions: {
    setBuildQueueState(targetPath, patch = {}) {
      if (!targetPath) return null
      const current = this.buildQueueState[targetPath] || {}
      const next = {
        targetPath,
        sourcePath: current.sourcePath || targetPath,
        reason: current.reason || 'manual',
        pendingCount: Number(current.pendingCount || 0),
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
      const next = { ...this.buildQueueState }
      delete next[targetPath]
      this.buildQueueState = next
    },

    async resolveCompileRequest(filePath, options = {}) {
      const workspace = useWorkspaceStore()
      const compileTargetPath = await resolveTypstCompileTarget(filePath, {
        filesStore: options.filesStore,
        workspacePath: workspace.path,
        contentOverrides: options.contentOverrides,
      }).catch(() => filePath)

      return {
        compileTargetPath: compileTargetPath || filePath,
      }
    },

    async checkAvailability(force = false) {
      await this.checkCompiler(force)
      return this.available
    },

    async checkCompiler(force = false) {
      if (this.checkingCompiler) return
      if (!force && this.lastCompilerCheckAt && Date.now() - this.lastCompilerCheckAt < COMPILER_CHECK_CACHE_MS) return
      this.checkingCompiler = true
      try {
        const result = await invoke('check_typst_compiler', {
          customTypstPath: this.customCompilerPath || null,
        })
        this.available = result?.installed === true
        this.compilerPath = result?.path || null
      } catch {
        this.available = false
        this.compilerPath = null
      } finally {
        this.lastCompilerCheckAt = Date.now()
        this.checkingCompiler = false
      }
    },

    async downloadTypst() {
      this.downloading = true
      this.downloadProgress = 0
      this.downloadError = null

      const unlisten = await listen('typst-download-progress', (event) => {
        this.downloadProgress = event.payload.percent
      })

      try {
        const path = await invoke('download_typst')
        this.available = true
        this.compilerPath = path
        await this.checkCompiler(true)
      } catch (e) {
        this.downloadError = typeof e === 'string' ? e : e.message || 'Download failed'
      } finally {
        unlisten()
        this.downloading = false
      }
    },

    async compile(filePath, options = {}) {
      if (!filePath) return null

      await ensureTypstStreamListener()
      this.cancelAutoCompile(filePath)
      const { compileTargetPath } = await this.resolveCompileRequest(filePath, options)
      const targetKey = options.targetPath || compileTargetPath || filePath
      const reason = options.reason || 'manual'
      const queueState = this.buildQueueState[targetKey] || null
      this._latestSourceByTarget[targetKey] = filePath

      if (this._activeCompileTargets[targetKey]) {
        this._recompileNeeded[targetKey] = true
        this.setBuildQueueState(targetKey, {
          phase: 'queued',
          sourcePath: filePath,
          reason,
          pendingCount: Number(queueState?.pendingCount || 0) + 1,
        })
        return this.compileState[filePath] || null
      }

      this._activeCompileTargets[targetKey] = true
      this.setBuildQueueState(targetKey, {
        phase: 'running',
        sourcePath: filePath,
        reason,
        pendingCount: Number(queueState?.pendingCount || 0),
        startedAt: Date.now(),
      })

      this.compileState[filePath] = {
        ...this.compileState[filePath],
        status: 'compiling',
        errors: [],
        warnings: [],
        compileTargetPath: targetKey,
      }

      try {
        const result = await invoke('compile_typst_file', {
          typPath: targetKey,
          customTypstPath: this.customCompilerPath || null,
        })
        const nextState = {
          status: result.success ? 'success' : 'error',
          errors: result.errors,
          warnings: result.warnings,
          pdfPath: result.pdf_path,
          log: result.log,
          durationMs: result.duration_ms,
          lastCompiled: Date.now(),
          compileTargetPath: targetKey,
          projectRootPath: targetKey,
          previewPath: resolveCachedTypstPreviewPath(filePath) || buildPreviewPath(targetKey),
        }
        this.compileState[filePath] = nextState
        this.compileState[targetKey] = {
          ...nextState,
          linkedSourcePath: filePath,
        }

        window.dispatchEvent(new CustomEvent('typst-compile-done', {
          detail: { typPath: filePath, compileTargetPath: targetKey, ...result },
        }))
        pushTypstLogToTerminal(filePath, result)

        if (result.success) {
          events.exportPdf()
        }
        if (this._recompileNeeded[targetKey]) {
          delete this._recompileNeeded[targetKey]
          const nextSourcePath = this._latestSourceByTarget[targetKey] || filePath
          this.setBuildQueueState(targetKey, {
            phase: 'queued',
            sourcePath: nextSourcePath,
            reason: 'rerun',
            pendingCount: 0,
          })
          void this.compile(nextSourcePath, { reason: 'rerun', targetPath: targetKey })
        } else {
          this.clearBuildQueueState(targetKey)
        }
        return this.compileState[filePath]
      } catch (error) {
        const message = error?.message || String(error)
        const result = {
          success: false,
          pdf_path: null,
          errors: [{ line: null, message, severity: 'error' }],
          warnings: [],
          log: message,
          duration_ms: 0,
        }
        this.compileState[filePath] = {
          ...this.compileState[filePath],
          status: 'error',
          errors: result.errors,
          warnings: [],
          log: message,
          compileTargetPath: targetKey,
          projectRootPath: targetKey,
          previewPath: resolveCachedTypstPreviewPath(filePath) || buildPreviewPath(targetKey),
        }
        this.compileState[targetKey] = {
          ...this.compileState[filePath],
          linkedSourcePath: filePath,
        }
        window.dispatchEvent(new CustomEvent('typst-compile-done', {
          detail: { typPath: filePath, compileTargetPath: targetKey, ...result },
        }))
        pushTypstLogToTerminal(filePath, result)
        this.clearBuildQueueState(targetKey)
        return this.compileState[filePath]
      } finally {
        delete this._activeCompileTargets[targetKey]
      }
    },

    openCompileLog(filePath) {
      if (typeof window === 'undefined') return
      const state = this.stateForFile(filePath)
      if (!state) return

      window.dispatchEvent(new CustomEvent('terminal-log', {
        detail: {
          key: 'typst-log',
          label: 'Typst',
          text: buildTypstTerminalOutput(filePath, {
            success: state.status === 'success',
            errors: state.errors || [],
            warnings: state.warnings || [],
            log: state.log || '',
            duration_ms: state.durationMs || 0,
          }),
          clear: true,
          open: true,
          status: state.status === 'success' ? 'success' : 'error',
        },
      }))
    },

    clearState(filePath) {
      delete this.compileState[filePath]
      delete this.compileState[resolveCachedTypstRootPath(filePath)]
      delete this.liveState[filePath]
      delete this._recompileNeeded[filePath]
      delete this._latestSourceByTarget[filePath]
      this.cancelAutoCompile(filePath)
      this.clearBuildQueueState(filePath)
      this.clearBuildQueueState(resolveCachedTypstRootPath(filePath))
    },

    registerExistingArtifact(filePath, pdfPath, options = {}) {
      if (!filePath || !pdfPath) return null
      const targetKey = options.targetPath || resolveCachedTypstRootPath(filePath) || filePath
      const previous = this.compileState[filePath] || {}
      const nextState = {
        ...previous,
        status: previous.status || 'idle',
        pdfPath,
        previewPath: previous.previewPath || resolveCachedTypstPreviewPath(filePath) || pdfPath,
        compileTargetPath: previous.compileTargetPath || targetKey,
        projectRootPath: previous.projectRootPath || targetKey,
      }
      this.compileState[filePath] = nextState
      if (targetKey) {
        this.compileState[targetKey] = {
          ...(this.compileState[targetKey] || {}),
          ...nextState,
          linkedSourcePath: filePath,
          compileTargetPath: targetKey,
          projectRootPath: targetKey,
        }
      }
      return nextState
    },

    setTinymistAvailability(available) {
      this.tinymistAvailable = available === true
    },

    setTinymistDiagnostics(filePath, diagnostics = [], options = {}) {
      if (!filePath) return
      const previous = this.liveState[filePath] || {}
      this.liveState[filePath] = {
        ...previous,
        tinymistBacked: options.tinymistBacked !== false,
        diagnostics: Array.isArray(diagnostics) ? diagnostics : [],
      }
    },

    setProjectProblems(filePath, problems = []) {
      if (!filePath) return
      const previous = this.liveState[filePath] || {}
      this.liveState[filePath] = {
        ...previous,
        projectProblems: Array.isArray(problems) ? problems : [],
        projectDiagnosticsLoaded: true,
      }
    },

    setTinymistOutlineItems(filePath, outlineItems = [], options = {}) {
      if (!filePath) return
      const previous = this.liveState[filePath] || {}
      this.liveState[filePath] = {
        ...previous,
        tinymistBacked: options.tinymistBacked !== false,
        outlineItems: Array.isArray(outlineItems) ? outlineItems : [],
        outlineLoaded: options.loaded === true,
      }
    },

    clearTinymistFileState(filePath) {
      if (!filePath || !this.liveState[filePath]) return
      const current = this.liveState[filePath] || {}
      const preserved = {
        projectProblems: Array.isArray(current.projectProblems) ? current.projectProblems : [],
        projectDiagnosticsLoaded: current.projectDiagnosticsLoaded === true,
      }
      if (preserved.projectProblems.length === 0 && !preserved.projectDiagnosticsLoaded) {
        const next = { ...this.liveState }
        delete next[filePath]
        this.liveState = next
        return
      }

      this.liveState = {
        ...this.liveState,
        [filePath]: preserved,
      }
    },

    async refreshProjectProblems(filePath, options = {}) {
      if (!filePath) return []
      const project = await resolveTypstProjectGraph(filePath, {
        filesStore: options.filesStore,
        workspacePath: options.workspacePath,
        contentOverrides: options.contentOverrides,
      }).catch(() => null)

      const problems = buildTypstProjectProblems(filePath, {
        project,
        referencesStore: options.referencesStore,
      })
      this.setProjectProblems(filePath, problems)
      return problems
    },

    async setCustomCompilerPath(path) {
      this.customCompilerPath = String(path || '').trim()
      try {
        if (this.customCompilerPath) {
          localStorage.setItem('typst.customCompilerPath', this.customCompilerPath)
        } else {
          localStorage.removeItem('typst.customCompilerPath')
        }
      } catch {}
      this.lastCompilerCheckAt = 0
      await this.checkCompiler(true)
    },

    setAutoCompile(enabled) {
      this.autoCompile = enabled === true
      try {
        localStorage.setItem('typst.autoCompile', this.autoCompile ? 'true' : 'false')
      } catch {}
    },

    setFormatOnSave(enabled) {
      this.formatOnSave = enabled === true
      try {
        localStorage.setItem('typst.formatOnSave', this.formatOnSave ? 'true' : 'false')
      } catch {}
    },

    setInlayHintsEnabled(enabled) {
      this.inlayHints = enabled === true
      try {
        localStorage.setItem('typst.inlayHints', this.inlayHints ? 'true' : 'false')
      } catch {}

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('typst-inlay-hints-changed'))
      }
    },

    cancelAutoCompile(filePath) {
      if (!filePath) return
      for (const targetPath of [filePath, resolveCachedTypstRootPath(filePath)].filter(Boolean)) {
        if (this._timers[targetPath]) {
          clearTimeout(this._timers[targetPath])
          delete this._timers[targetPath]
        }
        if (this.buildQueueState[targetPath]?.phase === 'scheduled') {
          this.clearBuildQueueState(targetPath)
        }
      }
    },

    async scheduleAutoCompile(filePath, options = {}) {
      if (!filePath || !this.autoCompile) return
      const reason = options.reason || 'save'
      const targetPath = options.targetPath || filePath
      this._latestSourceByTarget[targetPath] = filePath
      this.setBuildQueueState(targetPath, {
        phase: 'scheduled',
        sourcePath: filePath,
        reason,
        pendingCount: 0,
        scheduledAt: Date.now(),
      })

      if (this._timers[targetPath]) {
        clearTimeout(this._timers[targetPath])
      }

      this._timers[targetPath] = setTimeout(() => {
        delete this._timers[targetPath]
        void this.compile(filePath, { reason, targetPath })
      }, TYPST_AUTOCOMPILE_DEBOUNCE_MS)
    },

    async scheduleAutoBuildForPath(filePath, options = {}) {
      if (!filePath || !String(filePath).toLowerCase().endsWith('.typ')) return
      const workspace = useWorkspaceStore()
      const affectedRoots = await resolveTypstAffectedRootTargets(filePath, {
        filesStore: options.filesStore,
        workspacePath: workspace.path,
        contentOverrides: options.contentOverrides,
      }).catch(() => [])

      const targets = affectedRoots.length > 0
        ? affectedRoots
        : [{ sourcePath: filePath, rootPath: filePath }]

      for (const target of targets) {
        await this.scheduleAutoCompile(filePath, {
          ...options,
          targetPath: target.rootPath || target.sourcePath || filePath,
        })
      }
    },

    cleanup() {
      Object.values(this._timers).forEach((timerId) => clearTimeout(timerId))
      this.compileState = {}
      this.buildQueueState = {}
      this._timers = {}
      this._activeCompileTargets = {}
      this._recompileNeeded = {}
      this._latestSourceByTarget = {}
      this.liveState = {}
      this.tinymistAvailable = false
    },
  },
})
