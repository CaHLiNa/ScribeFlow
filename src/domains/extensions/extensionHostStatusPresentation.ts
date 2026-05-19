function normalizeSummaryParts(parts = []) {
  return Array.isArray(parts) ? parts.filter(Boolean) : []
}

export function describeExtensionHostStatusSurface(surface = {}, translate = (key) => key) {
  const summaryParts = normalizeSummaryParts(surface?.summaryParts)
  return {
    badgeKey: String(surface?.badgeKey || '').trim(),
    titleKey: String(surface?.titleKey || '').trim(),
    descriptionKey: String(surface?.descriptionKey || '').trim(),
    descriptionParams: surface?.descriptionParams && typeof surface.descriptionParams === 'object'
      ? { ...surface.descriptionParams }
      : {},
    toneClass: String(surface?.toneClass || '').trim(),
    summaryParts: summaryParts.map((entry) => ({
      key: String(entry?.key || '').trim(),
      params: entry?.params && typeof entry.params === 'object'
        ? { ...entry.params }
        : {},
    })),
    recoveryOwner: surface?.recoveryOwner && typeof surface.recoveryOwner === 'object'
      ? {
        extensionId: String(surface.recoveryOwner.extensionId || '').trim(),
        workspaceRoot: String(surface.recoveryOwner.workspaceRoot || '').trim(),
      }
      : null,
    badge: surface?.badgeKey ? translate(surface.badgeKey) : '',
    title: surface?.titleKey ? translate(surface.titleKey) : '',
    description: surface?.descriptionKey
      ? translate(surface.descriptionKey, surface.descriptionParams || {})
      : '',
    summaryText: summaryParts
      .map((entry) => translate(entry?.key || '', entry?.params || {}))
      .filter(Boolean)
      .join(' · '),
  }
}
