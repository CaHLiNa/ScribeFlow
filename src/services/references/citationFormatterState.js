const FAST_STYLE_IDS = new Set(['apa', 'chicago', 'harvard', 'ieee', 'vancouver'])

export function isFastCitationStyle(style = 'apa') {
  return FAST_STYLE_IDS.has(String(style || '').trim())
}
