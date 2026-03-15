import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { events } from '../services/telemetry'
import { useWorkspaceStore } from './workspace'
import { t } from '../i18n'

const COMPILER_CHECK_CACHE_MS = 5 * 60 * 1000

const readStoredValue = (key, fallback = '') => {
  try {
    const value = localStorage.getItem(key)
    return value == null ? fallback : value
  } catch {
    return fallback
  }
}

// Default PDF settings
const DEFAULTS = {
  template: 'clean',
  font: 'STIX Two Text',
  font_size: 11,
  page_size: 'a4',
  margins: 'normal',
  spacing: 'normal',
  bib_style: null, // null = use global citation style from references store
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

function pushTypstLogToTerminal(filePath, result) {
  if (typeof window === 'undefined') return
  const shouldOpenTerminal = !result.success
    || (Array.isArray(result.errors) && result.errors.length > 0)
  window.dispatchEvent(new CustomEvent('terminal-log', {
    detail: {
      key: 'typst-log',
      label: 'Typst',
      text: buildTypstTerminalOutput(filePath, result),
      clear: true,
      open: shouldOpenTerminal,
    },
  }))
}

export const useTypstStore = defineStore('typst', {
  state: () => ({
    available: false,
    compilerPath: null,
    customCompilerPath: readStoredValue('typst.customCompilerPath', ''),
    checkingCompiler: false,
    lastCompilerCheckAt: 0,
    downloading: false,
    downloadProgress: 0,
    downloadError: null,
    exporting: {}, // { [path]: 'exporting' | 'done' | 'error' }
    compileState: {}, // { [typPath]: { status, errors, warnings, pdfPath, log, durationMs, lastCompiled } }
    pdfSettings: {}, // { [relativePath]: PdfSettings }
  }),

  getters: {
    stateForFile: (state) => (filePath) => state.compileState[filePath] || null,
    isCompiling: (state) => (filePath) => state.compileState[filePath]?.status === 'compiling',
  },

  actions: {
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

    getSettings(mdPath) {
      const workspace = useWorkspaceStore()
      const rel = workspace.path ? mdPath.replace(workspace.path + '/', '') : mdPath
      return { ...DEFAULTS, ...(this.pdfSettings[rel] || {}) }
    },

    setSettings(mdPath, settings) {
      const workspace = useWorkspaceStore()
      const rel = workspace.path ? mdPath.replace(workspace.path + '/', '') : mdPath
      this.pdfSettings[rel] = { ...this.getSettings(mdPath), ...settings }
      this.persistSettings()
    },

    async loadSettings() {
      const workspace = useWorkspaceStore()
      if (!workspace.projectDir) return
      try {
        const content = await invoke('read_file', {
          path: `${workspace.projectDir}/pdf-settings.json`,
        })
        this.pdfSettings = JSON.parse(content)
      } catch {
        // No settings file yet — use defaults
      }
    },

    async persistSettings() {
      const workspace = useWorkspaceStore()
      if (!workspace.projectDir) return
      try {
        await invoke('write_file', {
          path: `${workspace.projectDir}/pdf-settings.json`,
          content: JSON.stringify(this.pdfSettings, null, 2),
        })
      } catch (e) {
        console.error('Failed to save PDF settings:', e)
      }
    },

    async exportToPdf(mdPath, bibPath, settings) {
      this.exporting[mdPath] = 'exporting'
      try {
        const result = await invoke('export_md_to_pdf', {
          mdPath,
          bibPath: bibPath || null,
          settings: settings || null,
          customTypstPath: this.customCompilerPath || null,
        })
        this.exporting[mdPath] = result.success ? 'done' : 'error'
        if (result.success) events.exportPdf()
        return result
      } catch (e) {
        this.exporting[mdPath] = 'error'
        throw e
      }
    },

    async compile(filePath) {
      this.compileState[filePath] = {
        ...this.compileState[filePath],
        status: 'compiling',
        errors: [],
        warnings: [],
      }

      try {
        const result = await invoke('compile_typst_file', {
          typPath: filePath,
          customTypstPath: this.customCompilerPath || null,
        })
        this.compileState[filePath] = {
          status: result.success ? 'success' : 'error',
          errors: result.errors,
          warnings: result.warnings,
          pdfPath: result.pdf_path,
          log: result.log,
          durationMs: result.duration_ms,
          lastCompiled: Date.now(),
        }

        window.dispatchEvent(new CustomEvent('typst-compile-done', {
          detail: { typPath: filePath, ...result },
        }))
        if (result.success && result.pdf_path) {
          window.dispatchEvent(new CustomEvent('pdf-updated', {
            detail: { path: result.pdf_path },
          }))
        }
        pushTypstLogToTerminal(filePath, result)

        if (result.success) {
          events.exportPdf()
        }
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
        }
        window.dispatchEvent(new CustomEvent('typst-compile-done', {
          detail: { typPath: filePath, ...result },
        }))
        pushTypstLogToTerminal(filePath, result)
      }
    },

    openCompileLog(filePath) {
      if (typeof window === 'undefined') return
      const state = this.compileState[filePath]
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
        },
      }))
    },

    clearState(filePath) {
      delete this.compileState[filePath]
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

    cleanup() {
      this.compileState = {}
      this.exporting = {}
    },
  },
})

export { DEFAULTS as PDF_DEFAULTS }
