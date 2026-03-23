import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createWorkspacePreferenceState,
  persistStoredString,
  toggleStoredBoolean,
} from '../src/services/workspacePreferences.js'

function createMockStorage(initial = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
}

test('createWorkspacePreferenceState defaults pdf themed pages to disabled', () => {
  const previousLocalStorage = globalThis.localStorage
  globalThis.localStorage = createMockStorage()

  try {
    const state = createWorkspacePreferenceState()
    assert.equal(state.pdfThemedPages, false)
  } finally {
    globalThis.localStorage = previousLocalStorage
  }
})

test('pdf themed pages preference is restored and persisted through the shared boolean helper', () => {
  const previousLocalStorage = globalThis.localStorage
  globalThis.localStorage = createMockStorage({ pdfThemedPages: 'true' })

  try {
    const restored = createWorkspacePreferenceState()
    assert.equal(restored.pdfThemedPages, true)

    const toggled = toggleStoredBoolean(restored.pdfThemedPages, 'pdfThemedPages')
    assert.equal(toggled, false)
    assert.equal(globalThis.localStorage.getItem('pdfThemedPages'), 'false')
  } finally {
    globalThis.localStorage = previousLocalStorage
  }
})

test('left sidebar panel preference defaults to files and restores valid saved modes', () => {
  const previousLocalStorage = globalThis.localStorage
  globalThis.localStorage = createMockStorage()

  try {
    const defaults = createWorkspacePreferenceState()
    assert.equal(defaults.leftSidebarPanel, 'files')

    persistStoredString('leftSidebarPanel', 'outline')
    const restored = createWorkspacePreferenceState()
    assert.equal(restored.leftSidebarPanel, 'outline')
  } finally {
    globalThis.localStorage = previousLocalStorage
  }
})

test('invalid left sidebar panel preference falls back to files', () => {
  const previousLocalStorage = globalThis.localStorage
  globalThis.localStorage = createMockStorage({ leftSidebarPanel: 'invalid' })

  try {
    const restored = createWorkspacePreferenceState()
    assert.equal(restored.leftSidebarPanel, 'files')
  } finally {
    globalThis.localStorage = previousLocalStorage
  }
})
