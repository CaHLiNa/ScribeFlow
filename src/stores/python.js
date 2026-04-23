import { defineStore } from 'pinia'
import { useWorkspaceStore } from './workspace'
import {
  createPythonPreferenceState,
  loadPythonPreferences as loadPythonPreferencesFromRust,
  savePythonPreferences as savePythonPreferencesToRust,
} from '../services/pythonPreferences'
import { compilePythonFile, listPythonRuntimes } from '../services/pythonRuntime'

function createInterpreterState() {
  return {
    found: false,
    path: '',
    version: '',
    source: '',
  }
}

function normalizeIssue(issue = {}) {
  return {
    line: Number.isFinite(Number(issue.line)) ? Number(issue.line) : null,
    column: Number.isFinite(Number(issue.column)) ? Number(issue.column) : null,
    message: String(issue.message || '').trim(),
    raw: String(issue.raw || '').trim(),
  }
}

function normalizeInterpreter(runtime = {}) {
  return {
    ...createInterpreterState(),
    ...runtime,
    found: runtime?.found === true,
    path: String(runtime?.path || '').trim(),
    version: String(runtime?.version || '').trim(),
    source: String(runtime?.source || '').trim(),
  }
}

const PYTHON_PREFERENCE_KEYS = ['interpreterPreference']

export const usePythonStore = defineStore('python', {
  state: () => ({
    ...createPythonPreferenceState(),
    interpreter: createInterpreterState(),
    selectedInterpreter: createInterpreterState(),
    availableInterpreters: [],
    checkingInterpreter: false,
    _preferencesHydrated: false,
    compileState: {},
  }),

  getters: {
    hasInterpreter: (state) => state.interpreter.found === true,
    detectedInterpreterCount: (state) => state.availableInterpreters.length,
    selectedInterpreterAvailable: (state) =>
      state.interpreterPreference === 'auto' || state.selectedInterpreter.found === true,
    stateForFile: (state) => (filePath) => state.compileState[filePath] || null,
  },

  actions: {
    applyPreferenceState(preferences = {}) {
      const next = {
        ...createPythonPreferenceState(),
        ...preferences,
      }

      for (const key of PYTHON_PREFERENCE_KEYS) {
        this[key] = next[key]
      }
    },

    snapshotPreferences() {
      return Object.fromEntries(PYTHON_PREFERENCE_KEYS.map((key) => [key, this[key]]))
    },

    async hydratePreferences(force = false) {
      if (!force && this._preferencesHydrated) return this.snapshotPreferences()

      const workspaceStore = useWorkspaceStore()
      const globalConfigDir = await workspaceStore.ensureGlobalConfigDir()
      const preferences = await loadPythonPreferencesFromRust(globalConfigDir)
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
        const preferences = await savePythonPreferencesToRust(globalConfigDir, optimistic)
        this.applyPreferenceState(preferences)
        this._preferencesHydrated = true
        return preferences
      } catch (error) {
        this.applyPreferenceState(previous)
        throw error
      }
    },

    async setInterpreterPreference(preference) {
      await this.persistPreferences({
        interpreterPreference: String(preference || '').trim() || 'auto',
      })
      await this.checkInterpreter(true)
    },

    async checkInterpreter(force = false) {
      if (this.checkingInterpreter && !force) return this.interpreter
      if (!this._preferencesHydrated) {
        await this.hydratePreferences().catch(() => {})
      }

      this.checkingInterpreter = true
      try {
        const result = await listPythonRuntimes(this.interpreterPreference)
        this.availableInterpreters = Array.isArray(result?.interpreters)
          ? result.interpreters.map(normalizeInterpreter)
          : []
        this.selectedInterpreter = normalizeInterpreter(result?.selectedInterpreter || {})
        this.interpreter = normalizeInterpreter(result?.resolvedInterpreter || {})
        return this.interpreter
      } catch {
        this.interpreter = createInterpreterState()
        this.selectedInterpreter = createInterpreterState()
        this.availableInterpreters = []
        return this.interpreter
      } finally {
        this.checkingInterpreter = false
      }
    },

    setCompileState(filePath, state = null) {
      if (!filePath) return
      const next = { ...this.compileState }
      if (!state) {
        delete next[filePath]
      } else {
        next[filePath] = state
      }
      this.compileState = next
    },

    async compile(filePath) {
      const normalizedPath = String(filePath || '').trim()
      if (!normalizedPath) return null
      if (!this._preferencesHydrated) {
        await this.hydratePreferences().catch(() => {})
      }

      const previousState = this.stateForFile(normalizedPath) || null
      this.setCompileState(normalizedPath, {
        ...(previousState || {}),
        status: 'running',
        errors: [],
        warnings: [],
        stdout: '',
        stderr: '',
      })

      try {
        const result = await compilePythonFile(
          normalizedPath,
          this.interpreterPreference === 'auto' ? '' : this.interpreterPreference,
        )
        this.interpreter = normalizeInterpreter({
          found: true,
          path: String(result?.interpreterPath || this.interpreter.path || ''),
          version: String(result?.interpreterVersion || this.interpreter.version || ''),
          source: String(result?.interpreterPath || ''),
        })

        const nextState = {
          status: result?.success ? 'success' : 'error',
          errors: Array.isArray(result?.errors) ? result.errors.map(normalizeIssue) : [],
          warnings: Array.isArray(result?.warnings) ? result.warnings.map(normalizeIssue) : [],
          stdout: String(result?.stdout || ''),
          stderr: String(result?.stderr || ''),
          commandPreview: String(result?.commandPreview || ''),
          exitCode: Number(result?.exitCode ?? (result?.success ? 0 : -1)),
          durationMs: Number(result?.durationMs || 0),
          interpreterPath: String(result?.interpreterPath || ''),
          interpreterVersion: String(result?.interpreterVersion || ''),
          lastCompiled: Date.now(),
        }
        this.setCompileState(normalizedPath, nextState)
        return nextState
      } catch (error) {
        await this.checkInterpreter(true).catch(() => {})
        const message = String(error?.message || error || 'Python compile failed.')
        const nextState = {
          status: 'error',
          errors: [{ line: null, column: null, message, raw: message }],
          warnings: [],
          stdout: '',
          stderr: message,
          commandPreview: '',
          exitCode: -1,
          durationMs: 0,
          interpreterPath: this.interpreter.path || '',
          interpreterVersion: this.interpreter.version || '',
          lastCompiled: Date.now(),
        }
        this.setCompileState(normalizedPath, nextState)
        return nextState
      }
    },
  },
})
