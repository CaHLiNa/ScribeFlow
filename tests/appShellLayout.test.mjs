import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveMinimumLeftSidebarWidth } from '../src/composables/useAppShellLayout.js'

test('left sidebar minimum width matches the outline-to-references gap on standard chrome', () => {
  const width = resolveMinimumLeftSidebarWidth({
    railWidth: 44,
    currentSidebarWidth: 240,
    collapseButtonLeft: 246,
    collapseButtonWidth: 30,
    rightmostPanelRight: 150,
    panelGap: 4,
  })

  assert.equal(width, 148)
})

test('left sidebar minimum width expands when the fixed panel group starts after mac traffic lights', () => {
  const width = resolveMinimumLeftSidebarWidth({
    railWidth: 44,
    currentSidebarWidth: 240,
    collapseButtonLeft: 246,
    collapseButtonWidth: 30,
    rightmostPanelRight: 170,
    panelGap: 4,
  })

  assert.equal(width, 168)
})

test('left sidebar minimum width falls back when chrome measurements are incomplete', () => {
  const width = resolveMinimumLeftSidebarWidth({
    railWidth: 44,
    currentSidebarWidth: 240,
    collapseButtonLeft: NaN,
    collapseButtonWidth: 30,
    rightmostPanelRight: 170,
    panelGap: 4,
  })

  assert.equal(width, 160)
})
