import { describe, expect, it } from 'vitest'
import {
  resolveMaximumLeftSidebarWidth,
  resolveMaximumRightSidebarWidth,
  resolveMinimumLeftSidebarWidth,
  resolveMinimumRightSidebarWidth,
} from './useAppShellLayout.js'

describe('useAppShellLayout sizing helpers', () => {
  it('clamps left sidebar minimum width to the adaptive floor', () => {
    expect(resolveMinimumLeftSidebarWidth({
      viewportWidth: 600,
      panelCount: 2,
    })).toBe(176)
  })

  it('keeps right sidebar minimum width large enough for the shell chrome', () => {
    expect(resolveMinimumRightSidebarWidth({
      viewportWidth: 1200,
      panelCount: 1,
    })).toBe(260)
  })

  it('caps left sidebar maximum width by viewport ratio when the window is narrow', () => {
    expect(resolveMaximumLeftSidebarWidth({
      viewportWidth: 1000,
      panelCount: 2,
    })).toBe(270)
  })

  it('caps right sidebar maximum width by preferred ceiling when the window is wide', () => {
    expect(resolveMaximumRightSidebarWidth({
      viewportWidth: 2000,
      panelCount: 1,
    })).toBe(460)
  })
})
