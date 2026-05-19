export function normalizeExtensionToneClass(tone = '') {
  const normalized = String(tone || '').trim().toLowerCase()
  return normalized ? `is-${normalized}` : ''
}
