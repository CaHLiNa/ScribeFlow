import { defineStore } from 'pinia'
import { compilePythonFile, detectPythonRuntime } from '../services/pythonRuntime'

function createInterpreterState() {
  return {
    found: false,
    path: '',
    version: '',
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

export const usePythonStore = defineStore('python', {
  state: () => ({
    interpreter: createInterpreterState(),
    checkingInterpreter: false,
    compileState: {},
  }),

  getters: {
    hasInterpreter: (state) => state.interpreter.found === true,
    stateForFile: (state) => (filePath) => state.compileState[filePath] || null,
  },

  actions: {
    async checkInterpreter(force = false) {
      if (this.checkingInterpreter && !force) return this.interpreter
      this.checkingInterpreter = true
      try {
        const result = await detectPythonRuntime()
        this.interpreter = {
          ...createInterpreterState(),
          ...result,
          found: result?.found === true,
          path: String(result?.path || ''),
          version: String(result?.version || ''),
        }
        return this.interpreter
      } catch {
        this.interpreter = createInterpreterState()
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
        const result = await compilePythonFile(normalizedPath)
        this.interpreter = {
          found: true,
          path: String(result?.interpreterPath || this.interpreter.path || ''),
          version: String(result?.interpreterVersion || this.interpreter.version || ''),
        }

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
