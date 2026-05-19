import { invokeCommand as invoke } from '../tauriBridge.ts'

export async function normalizeProblem(problem = {}, defaults = {}) {
  const result = await invoke('diagnostics_normalize_problems', {
    params: {
      problems: [problem],
      defaults,
    },
  })
  return result[0] || null
}

export async function normalizeProblems(problems = [], defaults = {}) {
  return invoke('diagnostics_normalize_problems', {
    params: {
      problems,
      defaults,
    },
  })
}
