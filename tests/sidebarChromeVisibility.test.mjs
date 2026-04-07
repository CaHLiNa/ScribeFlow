import test from 'node:test'
import assert from 'node:assert/strict'

import { shouldRenderSidebarChrome } from '../src/shared/sidebarChromeVisibility.js'

test('sidebar chrome stays visible when trailing actions exist without multiple entries', () => {
  assert.equal(shouldRenderSidebarChrome([{ key: 'files' }], true), true)
  assert.equal(shouldRenderSidebarChrome([{ key: 'outline' }], false), false)
})

test('sidebar chrome remains visible for multi-panel sidebars', () => {
  assert.equal(
    shouldRenderSidebarChrome(
      [
        { key: 'outline' },
        { key: 'document-run' },
      ],
      false
    ),
    true
  )
})
