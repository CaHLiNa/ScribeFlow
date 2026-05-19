const COMPLETE_STATES = new Set(['succeeded', 'completed'])
const ACTIVE_STATES = new Set(['running', 'queued'])

function normalizeProgressState(state = '') {
  return String(state || '').trim().toLowerCase()
}

function normalizeProgressNumber(value = 0) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? Math.max(0, number) : 0
}

function resolveProgressWidth(state = '', current = 0, total = 0) {
  if (total <= 0) {
    return COMPLETE_STATES.has(state) ? '100%' : '0%'
  }
  return `${Math.min(100, Math.round((current / total) * 100))}%`
}

function resolveProgressToneClass(state = '') {
  if (state === 'failed') return 'is-error'
  if (ACTIVE_STATES.has(state)) return 'is-running'
  if (COMPLETE_STATES.has(state)) return 'is-success'
  return ''
}

export function buildExtensionProgressPresentation(progress = {}) {
  const state = normalizeProgressState(progress?.state)
  const current = normalizeProgressNumber(progress?.current)
  const total = normalizeProgressNumber(progress?.total)

  return {
    state,
    current,
    total,
    label: String(progress?.label || '').trim(),
    width: resolveProgressWidth(state, current, total),
    toneClass: resolveProgressToneClass(state),
  }
}
