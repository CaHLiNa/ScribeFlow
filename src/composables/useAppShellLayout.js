import { onMounted, ref } from 'vue'

const DEFAULT_LEFT_SIDEBAR_WIDTH = 240
const DEFAULT_RIGHT_SIDEBAR_WIDTH = 360
const DEFAULT_BOTTOM_PANEL_HEIGHT = 250
const FALLBACK_LEFT_SIDEBAR_MIN_WIDTH = 160
const MAX_LEFT_SIDEBAR_WIDTH = 500

const leftSidebarWidth = ref(readNumberFromStorage('leftSidebarWidth', DEFAULT_LEFT_SIDEBAR_WIDTH))
const rightSidebarWidth = ref(readNumberFromStorage('rightSidebarWidth', DEFAULT_RIGHT_SIDEBAR_WIDTH))
const bottomPanelHeight = ref(readNumberFromStorage('bottomPanelHeight', DEFAULT_BOTTOM_PANEL_HEIGHT))
const rightSidebarPreSnapWidth = ref(null)

let sidebarWidthSaveTimer = null

function readNumberFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = parseInt(raw, 10)
    return Number.isFinite(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function saveNumberToStorage(key, value) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // Ignore localStorage failures.
  }
}

function debounceSidebarWidthSave() {
  clearTimeout(sidebarWidthSaveTimer)
  sidebarWidthSaveTimer = window.setTimeout(() => {
    saveNumberToStorage('leftSidebarWidth', leftSidebarWidth.value)
    saveNumberToStorage('rightSidebarWidth', rightSidebarWidth.value)
  }, 300)
}

export function resolveMinimumLeftSidebarWidth(measurements = {}) {
  const railWidth = Number(measurements.railWidth)
  const currentSidebarWidth = Number(measurements.currentSidebarWidth)
  const collapseButtonLeft = Number(measurements.collapseButtonLeft)
  const collapseButtonWidth = Number(measurements.collapseButtonWidth)
  const rightmostPanelRight = Number(measurements.rightmostPanelRight)
  const panelGap = Number(measurements.panelGap)

  if (
    !Number.isFinite(railWidth)
    || !Number.isFinite(currentSidebarWidth)
    || !Number.isFinite(collapseButtonLeft)
    || !Number.isFinite(collapseButtonWidth)
    || !Number.isFinite(rightmostPanelRight)
    || !Number.isFinite(panelGap)
  ) {
    return FALLBACK_LEFT_SIDEBAR_MIN_WIDTH
  }

  const inferredInset = railWidth + currentSidebarWidth - collapseButtonWidth - collapseButtonLeft
  if (!Number.isFinite(inferredInset)) {
    return FALLBACK_LEFT_SIDEBAR_MIN_WIDTH
  }

  return Math.max(
    0,
    Math.ceil(
      rightmostPanelRight
      + Math.max(panelGap, 0)
      - railWidth
      + collapseButtonWidth
      + Math.max(inferredInset, 0),
    ),
  )
}

function readLeftSidebarChromeMeasurements() {
  if (typeof document === 'undefined') return null

  const railEl = document.querySelector('.workbench-rail')
  const collapseButtonEl = document.querySelector('.header-sidebar-collapse-button')
  const panelButtonEls = Array.from(document.querySelectorAll('.header-sidebar-panel-button'))

  if (!railEl || !collapseButtonEl || panelButtonEls.length < 2) {
    return null
  }

  const rightmostPanelRect = panelButtonEls.at(-1)?.getBoundingClientRect()
  const adjacentPanelRect = panelButtonEls.at(-2)?.getBoundingClientRect()
  const collapseButtonRect = collapseButtonEl.getBoundingClientRect()
  const railRect = railEl.getBoundingClientRect()

  if (!rightmostPanelRect || !adjacentPanelRect || !collapseButtonRect || !railRect) {
    return null
  }

  return {
    railWidth: railRect.width,
    currentSidebarWidth: leftSidebarWidth.value,
    collapseButtonLeft: collapseButtonRect.left,
    collapseButtonWidth: collapseButtonRect.width,
    rightmostPanelRight: rightmostPanelRect.right,
    panelGap: rightmostPanelRect.left - adjacentPanelRect.right,
  }
}

function resolveDynamicLeftSidebarMinWidth() {
  return resolveMinimumLeftSidebarWidth(readLeftSidebarChromeMeasurements() || {})
}

function setLeftSidebarWidth(value) {
  const minWidth = resolveDynamicLeftSidebarMinWidth()
  leftSidebarWidth.value = Math.max(minWidth, Math.min(MAX_LEFT_SIDEBAR_WIDTH, value))
  debounceSidebarWidthSave()
}

function setRightSidebarWidth(value) {
  const maxWidth = Math.floor(window.innerWidth * 0.8)
  rightSidebarWidth.value = Math.max(200, Math.min(maxWidth, value))
  debounceSidebarWidthSave()
}

function setBottomPanelHeight(value) {
  bottomPanelHeight.value = Math.max(100, Math.min(600, value))
  saveNumberToStorage('bottomPanelHeight', bottomPanelHeight.value)
}

function onLeftResize(event) {
  setLeftSidebarWidth(event.x)
}

function onBottomResize(event) {
  setBottomPanelHeight(window.innerHeight - event.y)
}

function onRightResize(event) {
  setRightSidebarWidth(window.innerWidth - event.x)
  rightSidebarPreSnapWidth.value = null
}

function onRightResizeSnap() {
  const halfWindow = Math.floor(window.innerWidth / 2)
  if (rightSidebarPreSnapWidth.value !== null) {
    setRightSidebarWidth(rightSidebarPreSnapWidth.value)
    rightSidebarPreSnapWidth.value = null
    return
  }

  rightSidebarPreSnapWidth.value = rightSidebarWidth.value
  setRightSidebarWidth(halfWindow)
}

function cleanupAppShellLayout() {
  clearTimeout(sidebarWidthSaveTimer)
  sidebarWidthSaveTimer = null
}

export function useAppShellLayout() {
  onMounted(() => {
    window.requestAnimationFrame(() => {
      setLeftSidebarWidth(leftSidebarWidth.value)
    })
  })

  return {
    leftSidebarWidth,
    rightSidebarWidth,
    bottomPanelHeight,
    onLeftResize,
    onBottomResize,
    onRightResize,
    onRightResizeSnap,
    cleanupAppShellLayout,
  }
}
