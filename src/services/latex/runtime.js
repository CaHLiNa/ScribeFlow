import { invoke } from '@tauri-apps/api/core'

export async function resolveLatexCompileStart(params = {}) {
  return invoke('latex_runtime_compile_start', { params })
}

export async function resolveLatexCompileFinish(params = {}) {
  return invoke('latex_runtime_compile_finish', { params })
}

export async function resolveLatexCompileFail(params = {}) {
  return invoke('latex_runtime_compile_fail', { params })
}
