import { defineStore } from 'pinia'
import { useWorkspaceStore } from './workspace'
import {
  createPythonPreferenceState,
  loadPythonPreferences as loadPythonPreferencesFromRust,
  normalizePythonPreferences as normalizePythonPreferencesWithRust,
  savePythonPreferences as savePythonPreferencesToRust,
} from '../services/pythonPreferences'
import {
  compilePythonFile,
  listPythonRuntimes,
  normalizePythonInterpreter,
} from '../services/pythonRuntime'

function createInterpreterState() {
  return {
    found: false,
    path: '',
    version: '',
    source: '',
  }
}

function errorMessage(error, fallback) {
  return String(error?.message || error || fallback).trim() || fallback
}

const PYTHON_PREFERENCE_KEYS = ['interpreterPreference']

export const usePythonStore = defineStore('python', {
  state: () => ({
    ...createPythonPreferenceState(),
    interpreter: createInterpreterState(),
    selectedInterpreter: createInterpreterState(),
    availableInterpreters: [],
    checkingInterpreter: false,
    preferenceError: '',
    interpreterError: '',
    _preferencesHydrated: false,
    compileState: {},
  }),

  getters: {
    hasInterpreter: (state) => state.interpreter.found === true,
    detectedInterpreterCount: (state) => state.availableInterpreters.length,
    selectedInterpreterAvailable: (state) =>
      state.interpreterPreference === 'auto' || state.selectedInterpreter.found === true,
    stateForFile: (state) => (filePath) => state.compileState[filePath] || null,
    environmentError: (state) => state.preferenceError || state.interpreterError,
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

      try {
        const workspaceStore = useWorkspaceStore()
        const globalConfigDir = await workspaceStore.ensureGlobalConfigDir()
        const preferences = await loadPythonPreferencesFromRust(globalConfigDir)
        this.applyPreferenceState(preferences)
        this.preferenceError = ''
        this._preferencesHydrated = true
        return preferences
      } catch (error) {
        this.preferenceError = errorMessage(error, 'Failed to load Python preferences.')
        throw error
      }
    },

    async persistPreferences(patch = {}) {
      const workspaceStore = useWorkspaceStore()
      const globalConfigDir = await workspaceStore.ensureGlobalConfigDir()
      const previous = this.snapshotPreferences()
      const optimistic = {
        ...previous,
        ...patch,
      }

      const normalizedOptimistic =
        await normalizePythonPreferencesWithRust(optimistic)

      this.applyPreferenceState(normalizedOptimistic)
      this._preferencesHydrated = true

      try {
        const preferences = await savePythonPreferencesToRust(
          globalConfigDir,
          normalizedOptimistic,
        )
        this.applyPreferenceState(preferences)
        this.preferenceError = ''
        this._preferencesHydrated = true
        return preferences
      } catch (error) {
        this.applyPreferenceState(previous)
        this.preferenceError = errorMessage(error, 'Failed to save Python preferences.')
        throw error
      }
    },

    async setInterpreterPreference(preference) {
      await this.persistPreferences({
        interpreterPreference: preference,
      })
      await this.checkInterpreter(true)
    },

    async checkInterpreter(force = false) {
      if (this.checkingInterpreter && !force) return this.interpreter
      if (!this._preferencesHydrated) {
        try {
          await this.hydratePreferences()
        } catch {
          // Runtime discovery can still run with the default preference.
        }
      }

      this.checkingInterpreter = true
      try {
        const result = await listPythonRuntimes(this.interpreterPreference)
        this.availableInterpreters = result.interpreters
        this.selectedInterpreter = result.selectedInterpreter
        this.interpreter = result.resolvedInterpreter
        this.interpreterError = ''
        return this.interpreter
      } catch (error) {
        this.interpreter = createInterpreterState()
        this.selectedInterpreter = createInterpreterState()
        this.availableInterpreters = []
        this.interpreterError = errorMessage(error, 'Failed to check Python interpreter.')
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
        try {
          await this.hydratePreferences()
        } catch {
          // Compilation can still fall back to the default runtime preference.
        }
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
        this.interpreter = normalizePythonInterpreter({
          found: true,
          path: String(result?.interpreterPath || this.interpreter.path || ''),
          version: String(result?.interpreterVersion || this.interpreter.version || ''),
          source: String(result?.interpreterPath || ''),
        })

        const nextState = {
          status: result?.success ? 'success' : 'error',
          errors: result.errors,
          warnings: result.warnings,
          stdout: result.stdout,
          stderr: result.stderr,
          commandPreview: result.commandPreview,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          interpreterPath: result.interpreterPath,
          interpreterVersion: result.interpreterVersion,
          lastCompiled: Date.now(),
        }
        this.setCompileState(normalizedPath, nextState)
        return nextState
      } catch (error) {
        await this.checkInterpreter(true)
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
