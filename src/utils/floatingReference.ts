function toDomRect(x, y, width = 1, height = 1) {
  if (typeof DOMRect === 'function') {
    return new DOMRect(x, y, width, height)
  }

  return {
    x,
    y,
    width,
    height,
    top: y,
    right: x + width,
    bottom: y + height,
    left: x,
  }
}

export function createPointReference(x = 0, y = 0, width = 1, height = 1) {
  const safeX = Number.isFinite(x) ? x : 0
  const safeY = Number.isFinite(y) ? y : 0

  return {
    getBoundingClientRect() {
      return toDomRect(safeX, safeY, width, height)
    },
  }
}

export function resolveFloatingReference(reference) {
  if (!reference) return undefined
  if (reference.$el) return reference.$el
  if (reference.el?.value) return reference.el.value
  if (reference.el) return reference.el
  return reference
}
