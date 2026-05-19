import { invokeCommand as invoke } from '../tauriBridge.ts'

export async function normalizeLatexCompileResult(result = {}) {
  return invoke('latex_compile_result_normalize', {
    params: { result },
  })
}

export async function normalizeLatexCompileExecution(execution = {}) {
  return invoke('latex_compile_execution_normalize', {
    params: { execution },
  })
}
