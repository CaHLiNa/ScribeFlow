export function shouldRenderSidebarChrome(entries = [], hasTrailingContent = false) {
  const entryCount = Array.isArray(entries) ? entries.length : 0
  return entryCount > 1 || hasTrailingContent
}
