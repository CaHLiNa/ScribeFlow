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
  const menuActionMap = new Map()
  const { dismissOtherTransientOverlays } = useTransientOverlayDismiss(
    'surface-context-menu',
    () => {
      closeSurfaceContextMenu()
    }
  )

  function closeSurfaceContextMenu() {
    menuVisible.value = false
    menuGroups.value = []
    menuActionMap.clear()
  }

  function indexMenuActions(groups = []) {
    menuActionMap.clear()

    const visitItems = (items = []) => {
      for (const item of items) {
        if (!item?.key) continue
        if (typeof item.action === 'function') {
          menuActionMap.set(item.key, item.action)
        }
        if (Array.isArray(item.children) && item.children.length > 0) {
          visitItems(item.children)
        }
      }
    }

    for (const group of Array.isArray(groups) ? groups : []) {
      visitItems(group?.items)
    }
  }

  function openSurfaceContextMenu(options = {}) {
    dismissOtherTransientOverlays()
    const groups = Array.isArray(options.groups) ? options.groups : []
    const point = clampPointToViewport(
      normalizeCoordinate(options.x),
      normalizeCoordinate(options.y)
    )
    menuX.value = point.x
    menuY.value = point.y
    menuGroups.value = groups
    indexMenuActions(groups)
    menuVisible.value = true
  }

  function handleSurfaceContextMenuSelect(key) {
    const action = menuActionMap.get(key)
    closeSurfaceContextMenu()
    action?.()
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
