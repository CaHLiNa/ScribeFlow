import { invoke } from '@tauri-apps/api/core'

export async function normalizeProblem(problem = {}, defaults = {}) {
  const result = await invoke('diagnostics_normalize_problems', {
    problems: [problem],
    defaults,
  })
  return result[0] || null
}

export async function normalizeProblems(problems = [], defaults = {}) {
  return invoke('diagnostics_normalize_problems', { problems, defaults })
}
