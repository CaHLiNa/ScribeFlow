export function shouldShowIntegratedDocumentTitle({
  hasIntegratedDocumentTitle = false,
  activeTab = null,
  isActive = false,
  hasSinglePane = false,
  isSettingsSurface = false,
} = {}) {
  if (isSettingsSurface) return false

  return Boolean(
    hasIntegratedDocumentTitle
      && activeTab
      && (isActive || hasSinglePane)
  )
}
