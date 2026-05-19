function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeBadgeValue(value = null) {
  return Number.isInteger(value) ? value : null
}

export function buildExtensionPluginContainerPresentation(container = {}, viewState = {}, translate = (value) => value) {
  const fallbackLabel = translate('Plugin')
  const label = normalizeText(container?.title || container?.id || '') || fallbackLabel
  const badgeValue = normalizeBadgeValue(viewState?.badgeValue)
  const badgeTooltip = normalizeText(viewState?.badgeTooltip || '')
  const description = normalizeText(viewState?.description || '')

  return {
    label,
    title: badgeValue != null ? `${label} (${badgeValue})` : label,
    description,
    badgeValue,
    badgeTooltip,
  }
}
