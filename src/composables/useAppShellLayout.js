import { onMounted, ref } from 'vue'
import { MAX_WORKBENCH_SIDEBAR_PANEL_COUNT } from '../shared/workbenchSidebarPanels.js'
import { MAX_WORKBENCH_INSPECTOR_PANEL_COUNT } from '../shared/workbenchInspectorPanels.js'

const DEFAULT_LEFT_SIDEBAR_WIDTH = 240
const DEFAULT_RIGHT_SIDEBAR_WIDTH = 360
const DEFAULT_BOTTOM_PANEL_HEIGHT = 250
const MIN_MAIN_WORKBENCH_WIDTH = 320
const FALLBACK_LEFT_SIDEBAR_MIN_WIDTH = 220
const FALLBACK_RIGHT_SIDEBAR_MIN_WIDTH = 260
const FALLBACK_LEFT_SIDEBAR_MIN_FLOOR_WIDTH = 176
const FALLBACK_RIGHT_SIDEBAR_MIN_FLOOR_WIDTH = 208
const LEFT_SIDEBAR_MIN_VIEWPORT_RATIO = 0.2
const RIGHT_SIDEBAR_MIN_VIEWPORT_RATIO = 0.22
const FALLBACK_LEFT_SIDEBAR_MAX_WIDTH = 420
const FALLBACK_RIGHT_SIDEBAR_MAX_WIDTH = 460
const LEFT_SIDEBAR_MAX_VIEWPORT_RATIO = 0.27
const RIGHT_SIDEBAR_MAX_VIEWPORT_RATIO = 0.3
const SHELL_CHROME_BUTTON_SIZE = 30
const SHELL_CHROME_BUTTON_GAP = 4
const SHELL_CHROME_HORIZONTAL_PADDING = 16

const leftSidebarWidth = ref(readNumberFromStorage('leftSidebarWidth', DEFAULT_LEFT_SIDEBAR_WIDTH))
const rightSidebarWidth = ref(
  readNumberFromStorage('rightSidebarWidth', DEFAULT_RIGHT_SIDEBAR_WIDTH)
)
const bottomPanelHeight = ref(
  readNumberFromStorage('bottomPanelHeight', DEFAULT_BOTTOM_PANEL_HEIGHT)
)
const rightSidebarPreSnapWidth = ref(null)
const isLeftSidebarResizing = ref(false)
const isRightSidebarResizing = ref(false)

let sidebarWidthSaveTimer = null
let leftSidebarFrame = null
let rightSidebarFrame = null
let viewportResizeFrame = null
let pendingLeftSidebarWidth = leftSidebarWidth.value
let pendingRightSidebarWidth = rightSidebarWidth.value

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum)
}

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

function normalizeMinimumWidth(value, fallback) {
  const normalizedValue = Number(value)
  if (!Number.isFinite(normalizedValue)) return fallback
  return Math.max(normalizedValue, 0)
}

function normalizePanelCount(value, fallback) {
  const normalizedValue = Number(value)
  if (!Number.isFinite(normalizedValue) || normalizedValue <= 0) return fallback
  return Math.max(Math.round(normalizedValue), 1)
}

function normalizeMaximumWidth(value, fallback) {
  const normalizedValue = Number(value)
  if (!Number.isFinite(normalizedValue)) return fallback
  return Math.max(normalizedValue, 0)
}

function resolveViewportWidth(value) {
  const normalizedValue = Number(value)
  if (Number.isFinite(normalizedValue) && normalizedValue > 0) return normalizedValue
  if (
    typeof window !== 'undefined' &&
    Number.isFinite(window.innerWidth) &&
    window.innerWidth > 0
  ) {
    return window.innerWidth
  }
  return 0
}

function resolveAdaptiveMinimumWidth({
  viewportWidth,
  ratio,
  minimumFloorWidth,
  preferredMinimumWidth,
}) {
  const resolvedViewportWidth = resolveViewportWidth(viewportWidth)
  if (!resolvedViewportWidth) return preferredMinimumWidth

  return Math.round(clamp(resolvedViewportWidth * ratio, minimumFloorWidth, preferredMinimumWidth))
}

function resolveAdaptiveMaximumWidth({
  viewportWidth,
  ratio,
  minimumWidth,
  preferredMaximumWidth,
}) {
  const resolvedViewportWidth = resolveViewportWidth(viewportWidth)
  if (!resolvedViewportWidth) return preferredMaximumWidth

  const ratioCap = Math.round(resolvedViewportWidth * ratio)
  const centerPreservingCap = Math.round(
    Math.max(minimumWidth, resolvedViewportWidth - MIN_MAIN_WORKBENCH_WIDTH)
  )

  return Math.max(minimumWidth, Math.min(preferredMaximumWidth, ratioCap, centerPreservingCap))
}

function resolveSidebarChromeMinimumWidth(panelCount) {
  const normalizedPanelCount = normalizePanelCount(panelCount, 1)
  return (
    SHELL_CHROME_HORIZONTAL_PADDING +
    normalizedPanelCount * SHELL_CHROME_BUTTON_SIZE +
    Math.max(normalizedPanelCount - 1, 0) * SHELL_CHROME_BUTTON_GAP
  )
}

export function resolveMinimumLeftSidebarWidth(options = {}) {
  const adaptiveMinimumWidth = resolveAdaptiveMinimumWidth({
    viewportWidth: options.viewportWidth,
    ratio: LEFT_SIDEBAR_MIN_VIEWPORT_RATIO,
    minimumFloorWidth: FALLBACK_LEFT_SIDEBAR_MIN_FLOOR_WIDTH,
    preferredMinimumWidth: FALLBACK_LEFT_SIDEBAR_MIN_WIDTH,
  })
  const minimumWidth = normalizeMinimumWidth(options.minimumWidth, adaptiveMinimumWidth)
  const panelCount = normalizePanelCount(options.panelCount, MAX_WORKBENCH_SIDEBAR_PANEL_COUNT)

  return Math.max(minimumWidth, resolveSidebarChromeMinimumWidth(panelCount))
}

export function resolveMinimumRightSidebarWidth(options = {}) {
  const adaptiveMinimumWidth = resolveAdaptiveMinimumWidth({
    viewportWidth: options.viewportWidth,
    ratio: RIGHT_SIDEBAR_MIN_VIEWPORT_RATIO,
    minimumFloorWidth: FALLBACK_RIGHT_SIDEBAR_MIN_FLOOR_WIDTH,
    preferredMinimumWidth: FALLBACK_RIGHT_SIDEBAR_MIN_WIDTH,
  })
  const minimumWidth = normalizeMinimumWidth(options.minimumWidth, adaptiveMinimumWidth)
  const panelCount = normalizePanelCount(options.panelCount, MAX_WORKBENCH_INSPECTOR_PANEL_COUNT)

  return Math.max(minimumWidth, resolveSidebarChromeMinimumWidth(panelCount))
}

export function resolveMaximumLeftSidebarWidth(options = {}) {
  const minimumWidth = resolveMinimumLeftSidebarWidth(options)
  const adaptiveMaximumWidth = resolveAdaptiveMaximumWidth({
    viewportWidth: options.viewportWidth,
    ratio: LEFT_SIDEBAR_MAX_VIEWPORT_RATIO,
    minimumWidth,
    preferredMaximumWidth: FALLBACK_LEFT_SIDEBAR_MAX_WIDTH,
  })
  const maximumWidth = normalizeMaximumWidth(options.maximumWidth, adaptiveMaximumWidth)
  return Math.max(minimumWidth, Math.min(maximumWidth, adaptiveMaximumWidth))
}

export function resolveMaximumRightSidebarWidth(options = {}) {
  const minimumWidth = resolveMinimumRightSidebarWidth(options)
  const adaptiveMaximumWidth = resolveAdaptiveMaximumWidth({
    viewportWidth: options.viewportWidth,
    ratio: RIGHT_SIDEBAR_MAX_VIEWPORT_RATIO,
    minimumWidth,
    preferredMaximumWidth: FALLBACK_RIGHT_SIDEBAR_MAX_WIDTH,
  })
  const maximumWidth = normalizeMaximumWidth(options.maximumWidth, adaptiveMaximumWidth)
  return Math.max(minimumWidth, Math.min(maximumWidth, adaptiveMaximumWidth))
}

function normalizeSidebarWidth(value, fallback) {
  const normalizedValue = Number(value)
  if (!Number.isFinite(normalizedValue)) return fallback
  return normalizedValue
}

function commitLeftSidebarWidth(value) {
  const minWidth = resolveMinimumLeftSidebarWidth()
  const maxWidth = resolveMaximumLeftSidebarWidth()
  const nextWidth = normalizeSidebarWidth(value, DEFAULT_LEFT_SIDEBAR_WIDTH)
  leftSidebarWidth.value = Math.max(minWidth, Math.min(maxWidth, nextWidth))
  debounceSidebarWidthSave()
}

function scheduleLeftSidebarWidth(value) {
  pendingLeftSidebarWidth = value
  if (leftSidebarFrame !== null) return

  leftSidebarFrame = window.requestAnimationFrame(() => {
    leftSidebarFrame = null
    commitLeftSidebarWidth(pendingLeftSidebarWidth)
  })
}

function commitRightSidebarWidth(value) {
  const minWidth = resolveMinimumRightSidebarWidth()
  const maxWidth = resolveMaximumRightSidebarWidth()
  const nextWidth = normalizeSidebarWidth(value, DEFAULT_RIGHT_SIDEBAR_WIDTH)
  rightSidebarWidth.value = Math.max(minWidth, Math.min(maxWidth, nextWidth))
  debounceSidebarWidthSave()
}

function scheduleRightSidebarWidth(value) {
  pendingRightSidebarWidth = value
  if (rightSidebarFrame !== null) return

  rightSidebarFrame = window.requestAnimationFrame(() => {
    rightSidebarFrame = null
    commitRightSidebarWidth(pendingRightSidebarWidth)
  })
}

function flushScheduledSidebarWidths() {
  if (leftSidebarFrame !== null) {
    window.cancelAnimationFrame(leftSidebarFrame)
    leftSidebarFrame = null
    commitLeftSidebarWidth(pendingLeftSidebarWidth)
  }

  if (rightSidebarFrame !== null) {
    window.cancelAnimationFrame(rightSidebarFrame)
    rightSidebarFrame = null
    commitRightSidebarWidth(pendingRightSidebarWidth)
  }
}

function commitSidebarWidthsToViewport() {
  commitLeftSidebarWidth(leftSidebarWidth.value)
  commitRightSidebarWidth(rightSidebarWidth.value)
}

function scheduleViewportSidebarClamp() {
  if (typeof window === 'undefined') return
  if (viewportResizeFrame !== null) return

  viewportResizeFrame = window.requestAnimationFrame(() => {
    viewportResizeFrame = null
    commitSidebarWidthsToViewport()
  })
}

function setBottomPanelHeight(value) {
  bottomPanelHeight.value = Math.max(100, Math.min(600, value))
  saveNumberToStorage('bottomPanelHeight', bottomPanelHeight.value)
}

function onLeftResize(event) {
  scheduleLeftSidebarWidth(event.x)
}

function onBottomResize(event) {
  setBottomPanelHeight(window.innerHeight - event.y)
}

function onRightResize(event) {
  scheduleRightSidebarWidth(window.innerWidth - event.x)
  rightSidebarPreSnapWidth.value = null
}

function onRightResizeSnap() {
  const halfWindow = Math.floor(window.innerWidth / 2)
  if (rightSidebarPreSnapWidth.value !== null) {
    commitRightSidebarWidth(rightSidebarPreSnapWidth.value)
    rightSidebarPreSnapWidth.value = null
    return
  }

  rightSidebarPreSnapWidth.value = rightSidebarWidth.value
  commitRightSidebarWidth(halfWindow)
}

function startLeftSidebarResize() {
  isLeftSidebarResizing.value = true
}

function endLeftSidebarResize() {
  isLeftSidebarResizing.value = false
  flushScheduledSidebarWidths()
}

function startRightSidebarResize() {
  isRightSidebarResizing.value = true
}

function endRightSidebarResize() {
  isRightSidebarResizing.value = false
  flushScheduledSidebarWidths()
}

function onWindowResize() {
  scheduleViewportSidebarClamp()
}

function cleanupAppShellLayout() {
  clearTimeout(sidebarWidthSaveTimer)
  sidebarWidthSaveTimer = null
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', onWindowResize)
  }
  if (viewportResizeFrame !== null) {
    window.cancelAnimationFrame(viewportResizeFrame)
    viewportResizeFrame = null
  }
  flushScheduledSidebarWidths()
}

export function useAppShellLayout() {
  onMounted(() => {
    window.addEventListener('resize', onWindowResize)
    scheduleViewportSidebarClamp()
  })

  return {
    leftSidebarWidth,
    rightSidebarWidth,
    bottomPanelHeight,
    isLeftSidebarResizing,
    isRightSidebarResizing,
    onLeftResize,
    startLeftSidebarResize,
    endLeftSidebarResize,
    onBottomResize,
    onRightResize,
    startRightSidebarResize,
    endRightSidebarResize,
    onRightResizeSnap,
    cleanupAppShellLayout,
  }
}
