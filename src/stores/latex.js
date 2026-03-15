import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { ensureBibFile } from '../services/latexBib'
import { t } from '../i18n'

const COMPILER_CHECK_CACHE_MS = 5 * 60 * 1000
const LATEX_AUTOCOMPILE_DEBOUNCE_MS = 1200

let latexStreamUnlistenPromise = null

const readStoredValue = (key, fallback) => {
  try {
    const value = localStorage.getItem(key)
    return value == null ? fallback : value
  } catch {
    return fallback
  }
}

const clearLegacyLatexSettings = () => {
  try {
    localStorage.removeItem('latex.customLatexmkPath')
  } catch {}
}

function fileNameForLog(texPath = '') {
  return String(texPath).split('/').pop() || texPath
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
    },
  }))
}

function pushLatexStreamToTerminal({ texPath, line, clear = false, header = false, open = false } = {}) {
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
    })
  })

  await latexStreamUnlistenPromise
}

export const useLatexStore = defineStore('latex', {
  state: () => {
    clearLegacyLatexSettings()
    return ({
    // Per-file compile state: { [texPath]: { status, errors, warnings, pdfPath, synctexPath, log, durationMs, lastCompiled } }
    compileState: {},
    // Whether auto-compile on save is enabled
    autoCompile: false,
    // Debounce timers per file
    _timers: {},
    // Recompile flags per file (set when compile is requested while one is running)
    _recompileNeeded: {},
    compilerPreference: readStoredValue('latex.compilerPreference', 'auto'),
    enginePreference: readStoredValue('latex.enginePreference', 'auto'),
    customSystemTexPath: readStoredValue('latex.customSystemTexPath', ''),
    // Tectonic install state
    tectonicInstalled: false,
    tectonicPath: null,
    systemTexInstalled: false,
    systemTexPath: null,
    checkingCompilers: false,
    lastCompilerCheckAt: 0,
    downloading: false,
    downloadProgress: 0,
    downloadError: null,
  })
  },

  getters: {
    stateForFile: (state) => (texPath) => {
      return state.compileState[texPath] || null
    },

    isCompiling: (state) => (texPath) => {
      const s = state.compileState[texPath]
      return s?.status === 'compiling'
    },

    errorsForFile: (state) => (texPath) => {
      return state.compileState[texPath]?.errors || []
    },

    warningsForFile: (state) => (texPath) => {
      return state.compileState[texPath]?.warnings || []
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
  },

  actions: {
    scheduleAutoCompile(texPath) {
      if (!this.autoCompile) return

      // Clear existing timer for this file
      if (this._timers[texPath]) {
        clearTimeout(this._timers[texPath])
      }

      // Auto-save is 1s, so this keeps the total delay much closer to VS Code.
      this._timers[texPath] = setTimeout(() => {
        delete this._timers[texPath]
        this.compile(texPath)
      }, LATEX_AUTOCOMPILE_DEBOUNCE_MS)
    },

    async compile(texPath) {
      await ensureLatexStreamListener()
      this.cancelAutoCompile(texPath)

      // If already compiling, set recompile flag and return
      const current = this.compileState[texPath]
      if (current?.status === 'compiling') {
        this._recompileNeeded[texPath] = true
        return
      }

      // Set compiling state
      this.compileState[texPath] = {
        ...this.compileState[texPath],
        status: 'compiling',
        errors: [],
        warnings: [],
      }

      try {
        // Generate .bib file from reference library before compiling
        try { await ensureBibFile(texPath) } catch {}

        pushLatexStreamToTerminal({
          texPath,
          line: t('Starting LaTeX compile for {file}', { file: fileNameForLog(texPath) }),
          header: true,
          open: false,
        })

        const result = await invoke('compile_latex', {
          texPath,
          compilerPreference: this.compilerPreference,
          enginePreference: this.enginePreference,
          customSystemTexPath: this.customSystemTexPath || null,
          customTectonicPath: null,
        })

        this.compileState[texPath] = {
          status: result.success ? 'success' : 'error',
          errors: result.errors,
          warnings: result.warnings,
          pdfPath: result.pdf_path,
          synctexPath: result.synctex_path,
          log: result.log,
          durationMs: result.duration_ms,
          lastCompiled: Date.now(),
        }

        // Dispatch event for PDF viewer to refresh
        window.dispatchEvent(new CustomEvent('latex-compile-done', {
          detail: { texPath, ...result },
        }))
        pushLatexLogToTerminal(texPath, result)

        // If recompile was requested during compilation, compile again
        if (this._recompileNeeded[texPath]) {
          delete this._recompileNeeded[texPath]
          this.compile(texPath)
        }
      } catch (err) {
        this.compileState[texPath] = {
          ...this.compileState[texPath],
          status: 'error',
          errors: [{ line: null, message: err, severity: 'error' }],
          warnings: [],
        }
        pushLatexLogToTerminal(texPath, {
          success: false,
          duration_ms: 0,
          errors: [{ line: null, message: err, severity: 'error' }],
          warnings: [],
          log: String(err || ''),
        })
      }
    },

    setCompilerPreference(preference) {
      this.compilerPreference = preference
      try {
        localStorage.setItem('latex.compilerPreference', preference)
      } catch {}
    },

    setEnginePreference(preference) {
      this.enginePreference = preference
      try {
        localStorage.setItem('latex.enginePreference', preference)
      } catch {}
    },

    async setCustomSystemTexPath(path) {
      this.customSystemTexPath = String(path || '').trim()
      try {
        if (this.customSystemTexPath) {
          localStorage.setItem('latex.customSystemTexPath', this.customSystemTexPath)
        } else {
          localStorage.removeItem('latex.customSystemTexPath')
        }
      } catch {}
      this.lastCompilerCheckAt = 0
      await this.checkCompilers(true)
    },

    cancelAutoCompile(texPath) {
      if (this._timers[texPath]) {
        clearTimeout(this._timers[texPath])
        delete this._timers[texPath]
      }
    },

    clearState(texPath) {
      delete this.compileState[texPath]
      this.cancelAutoCompile(texPath)
      delete this._recompileNeeded[texPath]
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
        },
      }))
    },

    cleanup() {
      for (const texPath of Object.keys(this._timers)) {
        clearTimeout(this._timers[texPath])
      }
      this._timers = {}
      this._recompileNeeded = {}
      this.compileState = {}
    },

    async checkCompilers(force = false) {
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
        this.downloadError = typeof e === 'string' ? e : e.message || 'Download failed'
      } finally {
        unlisten()
        this.downloading = false
      }
    },
  },
})
