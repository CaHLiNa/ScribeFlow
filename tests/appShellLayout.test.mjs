import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveMaximumLeftSidebarWidth,
  resolveMaximumRightSidebarWidth,
  resolveMinimumLeftSidebarWidth,
  resolveMinimumRightSidebarWidth,
} from '../src/composables/useAppShellLayout.js'

test('left sidebar minimum width matches the references-to-files gap on standard chrome', () => {
  const width = resolveMinimumLeftSidebarWidth()

  assert.equal(width, 220)
})

test('left sidebar minimum width respects explicit larger overrides', () => {
  const width = resolveMinimumLeftSidebarWidth({
    minimumWidth: 220,
  })

  assert.equal(width, 220)
})

test('left sidebar minimum width still expands to fit wider shared chrome strips', () => {
  const width = resolveMinimumLeftSidebarWidth({
    minimumWidth: 40,
    panelCount: 4,
  })

  assert.equal(width, 148)
})

test('left sidebar minimum width falls back when overrides are invalid', () => {
  const width = resolveMinimumLeftSidebarWidth({
    minimumWidth: Number.NaN,
    panelCount: 0,
  })

  assert.equal(width, 220)
})

test('left sidebar maximum width uses the shared clamp ceiling', () => {
  const width = resolveMaximumLeftSidebarWidth()

  assert.equal(width, 420)
})

test('left sidebar maximum width never drops below the minimum width', () => {
  const width = resolveMaximumLeftSidebarWidth({
    minimumWidth: 220,
    maximumWidth: 180,
  })

  assert.equal(width, 220)
})

test('right sidebar minimum width mirrors the workspace inspector chrome width', () => {
  const width = resolveMinimumRightSidebarWidth()

  assert.equal(width, 260)
})

test('right sidebar minimum width respects explicit larger overrides', () => {
  const width = resolveMinimumRightSidebarWidth({
    minimumWidth: 280,
  })

  assert.equal(width, 280)
})

test('right sidebar minimum width still expands to fit wider chrome strips', () => {
  const width = resolveMinimumRightSidebarWidth({
    minimumWidth: 20,
    panelCount: 3,
  })

  assert.equal(width, 114)
})

test('right sidebar minimum width falls back when overrides are invalid', () => {
  const width = resolveMinimumRightSidebarWidth({
    minimumWidth: Number.NaN,
    panelCount: 0,
  })

  assert.equal(width, 260)
})

test('right sidebar maximum width uses the shared clamp ceiling', () => {
  const width = resolveMaximumRightSidebarWidth()

  assert.equal(width, 460)
})

test('right sidebar maximum width never drops below the minimum width', () => {
  const width = resolveMaximumRightSidebarWidth({
    minimumWidth: 260,
    maximumWidth: 220,
  })

  assert.equal(width, 260)
})
