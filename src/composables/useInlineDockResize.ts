import { ref } from 'vue'

export function useInlineDockResize(options = {}) {
  const resizeStartWidth = ref(null)

  function resolveWidth() {
    const value = Number(options.getWidth?.())
    return Number.isFinite(value) ? value : 0
  }

  function resolveContainerWidth() {
    const value = Number(options.getContainerWidth?.())
    if (Number.isFinite(value) && value > 0) return value
    return typeof window !== 'undefined' ? window.innerWidth : 0
  }

  function handleResizeStart() {
    resizeStartWidth.value = resolveWidth()
    options.onResizeStart?.()
  }

  function handleResize(event = {}) {
    const startWidth = resizeStartWidth.value ?? resolveWidth()
    options.onResize?.({
      width: startWidth - Number(event.dx || 0),
      containerWidth: resolveContainerWidth(),
    })
  }

  function handleResizeEnd() {
    resizeStartWidth.value = null
    options.onResizeEnd?.()
  }

  function handleResizeSnap() {
    options.onResizeSnap?.({
      containerWidth: resolveContainerWidth(),
    })
  }

  return {
    handleResize,
    handleResizeEnd,
    handleResizeSnap,
    handleResizeStart,
  }
}
