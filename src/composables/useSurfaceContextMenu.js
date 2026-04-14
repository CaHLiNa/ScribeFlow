import { ref } from 'vue'
import { useTransientOverlayDismiss } from './useTransientOverlayDismiss'

function normalizeCoordinate(value = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function clampPointToViewport(x = 0, y = 0, padding = 8) {
  if (typeof window === 'undefined') {
    return { x, y }
  }

  const maxX = Math.max(padding, window.innerWidth - padding)
  const maxY = Math.max(padding, window.innerHeight - padding)

  return {
    x: Math.min(Math.max(x, padding), maxX),
    y: Math.min(Math.max(y, padding), maxY),
  }
}

export function useSurfaceContextMenu() {
  const menuVisible = ref(false)
  const menuX = ref(0)
  const menuY = ref(0)
  const menuGroups = ref([])
  const { dismissOtherTransientOverlays } = useTransientOverlayDismiss(
    'surface-context-menu',
    () => {
      closeSurfaceContextMenu()
    }
  )

  function closeSurfaceContextMenu() {
    menuVisible.value = false
    menuGroups.value = []
  }

  function openSurfaceContextMenu(options = {}) {
    dismissOtherTransientOverlays()
    const point = clampPointToViewport(
      normalizeCoordinate(options.x),
      normalizeCoordinate(options.y)
    )
    menuX.value = point.x
    menuY.value = point.y
    menuGroups.value = Array.isArray(options.groups) ? options.groups : []
    menuVisible.value = true
  }

  function handleSurfaceContextMenuSelect(_key, item) {
    closeSurfaceContextMenu()
    item?.action?.()
  }

  return {
    menuVisible,
    menuX,
    menuY,
    menuGroups,
    closeSurfaceContextMenu,
    openSurfaceContextMenu,
    handleSurfaceContextMenuSelect,
  }
}
