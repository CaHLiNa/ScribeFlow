import { invoke } from '@tauri-apps/api/core'

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
    line: Number.isFinite(Number(issue?.line)) ? Number(issue.line) : null,
    column: Number.isFinite(Number(issue?.column)) ? Number(issue.column) : null,
    message: String(issue?.message || '').trim(),
    raw: String(issue?.raw || '').trim(),
  }
}

export function normalizePythonInterpreter(runtime = {}) {
  return {
    ...createInterpreterState(),
    ...(runtime && typeof runtime === 'object' ? runtime : {}),
    found: runtime?.found === true,
    path: String(runtime?.path || '').trim(),
    version: String(runtime?.version || '').trim(),
    source: String(runtime?.source || '').trim(),
  }
}

function normalizeRuntimeListResult(result = {}) {
  return {
    interpreters: Array.isArray(result?.interpreters)
      ? result.interpreters.map(normalizePythonInterpreter)
      : [],
    selectedInterpreter: normalizePythonInterpreter(result?.selectedInterpreter || {}),
    resolvedInterpreter: normalizePythonInterpreter(result?.resolvedInterpreter || {}),
    selectionValid: result?.selectionValid === true,
  }
}

function normalizeCompileResult(result = {}) {
  return {
    success: result?.success === true,
    errors: Array.isArray(result?.errors) ? result.errors.map(normalizeIssue) : [],
    warnings: Array.isArray(result?.warnings) ? result.warnings.map(normalizeIssue) : [],
    stdout: String(result?.stdout || ''),
    stderr: String(result?.stderr || ''),
    commandPreview: String(result?.commandPreview || ''),
    exitCode: Number(result?.exitCode ?? (result?.success ? 0 : -1)),
    durationMs: Number(result?.durationMs || 0),
    interpreterPath: String(result?.interpreterPath || '').trim(),
    interpreterVersion: String(result?.interpreterVersion || '').trim(),
  }
}

export async function detectPythonRuntime() {
  return normalizePythonInterpreter(await invoke('python_runtime_detect'))
}

export async function listPythonRuntimes(interpreterPath = '') {
  const result = await invoke('python_runtime_list', {
    params: {
      interpreterPath,
    },
  })
  return normalizeRuntimeListResult(result)
}

export async function compilePythonFile(filePath, interpreterPath = '') {
  const result = await invoke('python_runtime_compile', {
    params: {
      filePath,
      interpreterPath,
    },
  })
  return normalizeCompileResult(result)
}
