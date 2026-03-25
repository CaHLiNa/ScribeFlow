export function resolveLeftSidebarChromeAnchor({
  hasVisibleTrafficLights = false,
  macSafePadding = 0,
  railBoundary = 44,
} = {}) {
  const normalizedRailBoundary = Number.isFinite(Number(railBoundary))
    ? Math.max(Number(railBoundary), 0)
    : 0
  const normalizedMacSafePadding = Number.isFinite(Number(macSafePadding))
    ? Math.max(Number(macSafePadding), 0)
    : 0

  if (hasVisibleTrafficLights) {
    return Math.max(normalizedMacSafePadding, normalizedRailBoundary)
  }

  return normalizedRailBoundary
}

export function resolveRightHeaderChromeAnchor({ buttonInset = 8 } = {}) {
  const normalizedButtonInset = Number.isFinite(Number(buttonInset))
    ? Math.max(Number(buttonInset), 0)
    : 0

  return normalizedButtonInset
}

export function resolveHeaderChromeLayout({
  hasVisibleTrafficLights = false,
  macSafePadding = 0,
  railBoundary = 44,
  buttonInset = 8,
} = {}) {
  const normalizedRailBoundary = Number.isFinite(Number(railBoundary))
    ? Math.max(Number(railBoundary), 0)
    : 0

  const leftToggleLeft = resolveLeftSidebarChromeAnchor({
    hasVisibleTrafficLights,
    macSafePadding,
    railBoundary: normalizedRailBoundary,
  })

  const rightToggleRight = resolveRightHeaderChromeAnchor({
    buttonInset,
  })

  return {
    leftToggleLeft,
    rightToggleRight,
  }
}
