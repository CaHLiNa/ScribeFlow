import { invoke } from '@tauri-apps/api/core'

export async function normalizeLatexCompileResult(result = {}) {
  return invoke('latex_compile_result_normalize', { result })
}

export async function normalizeLatexCompileExecution(execution = {}) {
  return invoke('latex_compile_execution_normalize', { execution })
}
