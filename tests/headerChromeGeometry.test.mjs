import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveHeaderChromeLayout,
  resolveLeftSidebarChromeAnchor,
  resolveRightHeaderChromeAnchor,
} from '../src/shared/headerChromeGeometry.js'

test('left sidebar chrome anchor snaps to the mac traffic-light safe padding in windowed mode', () => {
  assert.equal(resolveLeftSidebarChromeAnchor({
    hasVisibleTrafficLights: true,
    macSafePadding: 72,
    railBoundary: 44,
  }), 72)
})

test('left sidebar chrome anchor falls back to the rail boundary in fullscreen', () => {
  assert.equal(resolveLeftSidebarChromeAnchor({
    hasVisibleTrafficLights: false,
    macSafePadding: 72,
    railBoundary: 44,
  }), 44)
})

test('right header chrome anchor stays pinned to the fixed inset', () => {
  assert.equal(resolveRightHeaderChromeAnchor({
    buttonInset: 8,
  }), 8)
})

test('header chrome layout keeps the left toggle aligned with the mac traffic-light safe padding', () => {
  assert.deepEqual(resolveHeaderChromeLayout({
    hasVisibleTrafficLights: true,
    macSafePadding: 72,
    railBoundary: 44,
    buttonInset: 8,
  }), {
    leftToggleLeft: 72,
    rightToggleRight: 8,
  })
})

test('header chrome layout falls back to the rail boundary when traffic lights are hidden', () => {
  assert.deepEqual(resolveHeaderChromeLayout({
    hasVisibleTrafficLights: false,
    macSafePadding: 72,
    railBoundary: 44,
    buttonInset: 8,
  }), {
    leftToggleLeft: 44,
    rightToggleRight: 8,
  })
})
