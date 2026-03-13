import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { t } from '../i18n'

const DETECTION_CACHE_MS = 5 * 60 * 1000

const readStoredValue = (key, fallback = '') => {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

const DEFAULT_LANG_STATE = () => ({
  found: false,
  path: null,
  version: null,
  hasKernel: false,
  selectedHasKernel: false,
  kernelName: null,
  candidates: [],
  selectedPath: null,
})

export const useEnvironmentStore = defineStore('environment', {
  state: () => ({
    languages: {
      python: DEFAULT_LANG_STATE(),
      r: DEFAULT_LANG_STATE(),
      julia: DEFAULT_LANG_STATE(),
    },
    jupyter: { found: false, path: null, version: null },
    preferredPythonPath: readStoredValue('env.preferredPythonPath'),
    customPythonPath: readStoredValue('env.customPythonPath'),
    detected: false,
    detecting: false,
    lastDetectedAt: 0,
    installing: null,
    lastInstallLanguage: null,
    installOutput: '',
    installError: '',
  }),

  getters: {
    /**
     * What mode can we run notebooks in for this language?
     * 'jupyter' — full Jupyter kernel available
     * 'none'    — no kernel (language may or may not be installed)
     */
    capability: (state) => (lang) => {
      const info = state.languages[lang]
      if (info?.hasKernel) return 'jupyter'
      return 'none'
    },

    /** Human-readable status line for a language */
    statusLabel: (state) => (lang) => {
      const info = state.languages[lang]
      const name = lang === 'r' ? 'R' : lang.charAt(0).toUpperCase() + lang.slice(1)
      if (info?.hasKernel) {
        const ver = info.version ? ` ${info.version}` : ''
        return `${name}${ver}`
      }
      if (info?.found) return `${name} found — no Jupyter kernel`
      return `${name} not found`
    },

    selectedInterpreterPath: (state) => (lang) => {
      if (lang === 'python') {
        return state.languages.python.selectedPath || state.preferredPythonPath || state.languages.python.path || null
      }
      return state.languages[lang]?.path || null
    },
  },

  actions: {
    _isWindows() {
      if (typeof navigator === 'undefined') return false
      const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || ''
      return /win/i.test(platform)
    },

    _stdoutOnly(output) {
      const text = String(output || '')
      const marker = '\n--- stderr ---\n'
      const idx = text.indexOf(marker)
      return idx >= 0 ? text.slice(0, idx) : text
    },

    _primaryOutputText(output) {
      const stdout = this._stdoutOnly(output).trim()
      if (stdout) return stdout

      const text = String(output || '')
      const marker = '\n--- stderr ---\n'
      const idx = text.indexOf(marker)
      return idx >= 0 ? text.slice(idx + marker.length).trim() : stdout
    },

    _firstOutputLine(output) {
      return String(output || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .find(Boolean) || ''
    },

    async _detectCommandPath(cmd, fallbackCmd = null) {
      const candidates = [cmd, fallbackCmd].filter(Boolean)
      for (const candidate of candidates) {
        const query = this._isWindows()
          ? `where.exe ${candidate} 2>NUL`
          : `command -v ${candidate} 2>/dev/null`
        const output = await this._run(query)
        const path = this._firstOutputLine(this._stdoutOnly(output))
        if (path) return path
      }
      return ''
    },

    _kernelLanguage(kernel) {
      const language = String(kernel?.language || '').trim().toLowerCase()
      if (language === 'python' || language === 'r' || language === 'julia') return language

      const name = String(kernel?.name || '').toLowerCase()
      const display = String(kernel?.display || '').toLowerCase()
      if (name.includes('python') || display.includes('python')) return 'python'
      if (name === 'ir' || display === 'r' || display.startsWith('r ') || display.includes(' r ')) return 'r'
      if (name.includes('julia') || display.includes('julia')) return 'julia'
      return ''
    },

    async detect(force = false) {
      if (this.detecting) return
      if (
        !force
        && this.detected
        && this.lastDetectedAt
        && Date.now() - this.lastDetectedAt < DETECTION_CACHE_MS
      ) {
        return this.languages
      }

      this.detecting = true

      try {
        // Run all checks in parallel
        const [pythonCandidates, r, julia, jupyter, kernels] = await Promise.all([
          this._detectPythonInterpreters(),
          this._detectLang('R', null, /R version (\d+\.\d+\.\d+)/),
          this._detectLang('julia', null, /julia version (\d+\.\d+\.\d+)/i),
          this._detectJupyter(),
          this._detectKernels(),
        ])

        this.languages.python = await this._buildPythonLanguageInfo(pythonCandidates, kernels)
        this.languages.r = { ...DEFAULT_LANG_STATE(), ...r }
        this.languages.julia = { ...DEFAULT_LANG_STATE(), ...julia }
        this.jupyter = jupyter

        // Match kernels to languages via `jupyter kernelspec list`
        for (const k of kernels) {
          const language = this._kernelLanguage(k)
          if (language === 'python') {
            this.languages.python.hasKernel = true
            if (!this.languages.python.kernelName) this.languages.python.kernelName = k.name
          } else if (language === 'r') {
            this.languages.r.hasKernel = true
            this.languages.r.kernelName = k.name
          } else if (language === 'julia') {
            this.languages.julia.hasKernel = true
            this.languages.julia.kernelName = k.name
          }
        }

        this.detected = true
        this.lastDetectedAt = Date.now()
        return this.languages
      } finally {
        this.detecting = false
      }
    },

    async _detectPythonInterpreters() {
      try {
        return await invoke('discover_python_interpreters')
      } catch {
        return []
      }
    },

    /** Detect a language binary on PATH */
    async _detectLang(cmd, fallbackCmd, versionRegex) {
      const result = { found: false, path: null, version: null }
      try {
        const path = await this._detectCommandPath(cmd, fallbackCmd)
        if (!path) return result
        result.found = true
        result.path = path

        const verOut = await this._run(`${this._quoteShell(path)} --version 2>&1`)
        const vMatch = this._primaryOutputText(verOut).match(versionRegex)
        if (vMatch) result.version = vMatch[1]
      } catch { /* not found */ }
      return result
    },

    /** Detect jupyter command */
    async _detectJupyter() {
      const result = { found: false, path: null, version: null }
      try {
        const path = await this._detectCommandPath('jupyter')
        if (!path) return result
        result.found = true
        result.path = path

        const verOut = await this._run('jupyter --version 2>&1')
        const match = this._primaryOutputText(verOut).match(/jupyter_core\s*:\s*(\d+\.\d+\.\d+)/)
        if (match) result.version = match[1]
      } catch { /* not found */ }
      return result
    },

    /** Parse `jupyter kernelspec list` output into [{name, display, path}] */
    async _detectKernels() {
      try {
        const kernels = await invoke('kernel_discover')
        return kernels.map(k => ({
          name: k.name,
          path: k.path,
          display: k.display_name || k.name,
          language: k.language || '',
        }))
      } catch {
        return []
      }
    },

    async _run(cmd) {
      try {
        return await invoke('run_shell_command', { cwd: '.', command: cmd })
      } catch {
        return ''
      }
    },

    _quoteShell(value) {
      const text = String(value)
      if (this._isWindows()) {
        return `"${text.replace(/"/g, '\\"').replace(/%/g, '%%')}"`
      }
      return `'${text.replace(/'/g, `'\"'\"'`)}'`
    },

    _pythonCandidateIdentity(candidate) {
      return String(candidate?.resolved_path || candidate?.path || '').trim()
    },

    _pythonDisplayPathScore(path) {
      const value = String(path || '').trim()
      if (!value) return -999

      let score = 0
      if (value.startsWith('/')) score += 100
      if (value.includes('/opt/homebrew/bin/') || value.includes('/usr/local/bin/') || value.includes('/bin/python')) score += 40
      if (value.includes('/Cellar/')) score -= 25
      if (value.includes('/.pyenv/shims/')) score -= 10
      if (value === 'python' || value === 'python3' || value === 'py') score -= 120
      return score - Math.floor(value.length / 12)
    },

    _mergePythonCandidate(existing, candidate) {
      if (!existing) return candidate
      const preferred = this._pythonDisplayPathScore(candidate.path) > this._pythonDisplayPathScore(existing.path)
        ? candidate
        : existing

      return {
        ...preferred,
        version: preferred.version || existing.version || candidate.version || null,
        has_ipykernel: existing.has_ipykernel || candidate.has_ipykernel,
        resolved_path: candidate.resolved_path || existing.resolved_path || preferred.path,
      }
    },

    _normalizePythonCandidate(candidate) {
      if (!candidate?.path) return null
      const path = String(candidate.path).trim()
      const resolvedPath = String(candidate.resolved_path || candidate.path).trim()
      if (!path || !resolvedPath) return null
      return {
        path,
        resolved_path: resolvedPath,
        version: candidate.version || null,
        has_ipykernel: candidate.has_ipykernel === true,
      }
    },

    async _probePythonCandidate(path) {
      const trimmed = String(path || '').trim()
      if (!trimmed) return null

      const exists = await invoke('path_exists', { path: trimmed }).catch(() => false)
      if (!exists) return null

      const quoted = this._quoteShell(trimmed)
      const versionOut = await this._run(`${quoted} --version 2>&1`)
      const versionMatch = this._primaryOutputText(versionOut).match(/Python (\d+\.\d+\.\d+)/)
      const kernelOut = await this._run(`${quoted} -m ipykernel_launcher --version 2>&1`)
      const hasIpykernel = kernelOut.trim().length > 0
        && !/No module named|ModuleNotFoundError|not found|can't open file/i.test(kernelOut)
      const resolvedPathOut = await this._run(`${quoted} -c ${this._quoteShell('import os, sys; print(os.path.realpath(sys.executable))')} 2>/dev/null`)

      return {
        path: trimmed,
        resolved_path: resolvedPathOut.trim() || trimmed,
        version: versionMatch?.[1] || null,
        has_ipykernel: hasIpykernel,
      }
    },

    async _buildPythonLanguageInfo(candidates, kernels) {
      const dedupeMap = new Map()
      for (const rawCandidate of candidates || []) {
        const candidate = this._normalizePythonCandidate(rawCandidate)
        if (!candidate) continue
        const key = this._pythonCandidateIdentity(candidate)
        dedupeMap.set(key, this._mergePythonCandidate(dedupeMap.get(key), candidate))
      }

      let deduped = [...dedupeMap.values()]

      const preferred = this.preferredPythonPath?.trim()
      if (preferred && !deduped.some(item => item.path === preferred || item.resolved_path === preferred)) {
        const custom = await this._probePythonCandidate(preferred)
        if (custom) deduped.unshift(custom)
      }

      const merged = new Map()
      for (const candidate of deduped) {
        const normalized = this._normalizePythonCandidate(candidate)
        if (!normalized) continue
        const key = this._pythonCandidateIdentity(normalized)
        merged.set(key, this._mergePythonCandidate(merged.get(key), normalized))
      }
      deduped = [...merged.values()]

      const selected = deduped.find(item => item.path === preferred || item.resolved_path === preferred) || deduped[0] || null
      const anyPythonKernel = kernels.some(k => this._kernelLanguage(k) === 'python')

      return {
        ...DEFAULT_LANG_STATE(),
        found: !!selected,
        path: selected?.path || null,
        version: selected?.version || null,
        hasKernel: anyPythonKernel,
        selectedHasKernel: selected?.has_ipykernel === true,
        kernelName: kernels.find(k => this._kernelLanguage(k) === 'python')?.name || null,
        candidates: deduped,
        selectedPath: selected?.path || null,
      }
    },

    _currentPythonKernelDescriptors() {
      if (!this.languages.python.hasKernel) return []
      if (!this.languages.python.kernelName) return [{ name: 'python', display: 'python', language: 'python' }]
      return [{ name: this.languages.python.kernelName, display: 'python', language: 'python' }]
    },

    async selectPythonInterpreter(path) {
      this.preferredPythonPath = String(path || '').trim()
      this.customPythonPath = ''
      try {
        localStorage.setItem('env.preferredPythonPath', this.preferredPythonPath)
        localStorage.removeItem('env.customPythonPath')
      } catch {}
      this.languages.python = await this._buildPythonLanguageInfo(
        this.languages.python.candidates,
        this._currentPythonKernelDescriptors()
      )
    },

    async saveCustomPythonPath(path) {
      const trimmed = String(path || '').trim()
      this.customPythonPath = trimmed
      this.preferredPythonPath = trimmed
      try {
        localStorage.setItem('env.customPythonPath', trimmed)
        localStorage.setItem('env.preferredPythonPath', trimmed)
      } catch {}
      const custom = trimmed ? await this._probePythonCandidate(trimmed) : null
      const candidates = custom
        ? [custom, ...this.languages.python.candidates]
        : this.languages.python.candidates
      this.languages.python = await this._buildPythonLanguageInfo(
        candidates,
        this._currentPythonKernelDescriptors()
      )
    },

    /**
     * Install the Jupyter kernel for a language.
     * Returns true on success, false on failure.
     */
    async installKernel(language) {
      this.installing = language
      this.lastInstallLanguage = language
      this.installOutput = ''
      this.installError = ''

      const commands = {
        r: 'R --no-echo -e "install.packages(\'IRkernel\', repos=\'https://cloud.r-project.org\'); IRkernel::installspec()" 2>&1',
        julia: 'julia -e "using Pkg; Pkg.add(\\"IJulia\\")" 2>&1',
      }

      let cmd = commands[language]
      if (language === 'python') {
        const pythonPath = this.selectedInterpreterPath('python') || 'python3'
        const quotedPython = this._quoteShell(pythonPath)
        const versionTag = (this.languages.python.version || 'custom').replace(/[^0-9.]/g, '').replace(/\./g, '-')
        const kernelName = `altals-python-${versionTag || 'custom'}`
        const displayName = this.languages.python.version
          ? `Python ${this.languages.python.version} (Altals)`
          : 'Python (Altals)'
        cmd = `${quotedPython} -m pip install -U ipykernel 2>&1 && ${quotedPython} -m ipykernel install --user --name ${this._quoteShell(kernelName)} --display-name ${this._quoteShell(displayName)} 2>&1`
      }

      if (!cmd) {
        this.installError = t('Unknown language: {language}', { language })
        this.installing = null
        return false
      }

      try {
        const output = await this._run(cmd)
        this.installOutput = output

        // Force a fresh probe so a successful install is reflected immediately.
        await this.detect(true)

        const success = language === 'python'
          ? this.languages.python.selectedHasKernel === true
          : this.languages[language]?.hasKernel === true
        if (!success) {
          this.installError = t('Installation completed but kernel not detected. Try restarting the app.')
        }
        return success
      } catch (e) {
        this.installError = e.message || String(e)
        return false
      } finally {
        this.installing = null
      }
    },

    /** Platform-appropriate install instructions */
    installHint(language) {
      const isMac = navigator.platform?.startsWith('Mac')
      const hints = {
        python: isMac
          ? t('Install via Homebrew: brew install python3 && pip3 install ipykernel')
          : t('Install from python.org, then: pip install ipykernel'),
        r: isMac
          ? t('Install from r-project.org, then in R: install.packages("IRkernel"); IRkernel::installspec()')
          : t('Install from r-project.org, then in R: install.packages("IRkernel"); IRkernel::installspec()'),
        julia: t('Install from julialang.org, then in Julia: using Pkg; Pkg.add("IJulia")'),
      }
      return hints[language] || ''
    },

    /** Quick install command (for one-click button) */
    installCommand(language) {
      return {
        python: 'pip3 install ipykernel',
        r: 'R -e "install.packages(\'IRkernel\'); IRkernel::installspec()"',
        julia: 'julia -e "using Pkg; Pkg.add(\\"IJulia\\")"',
      }[language] || ''
    },
  },
})
