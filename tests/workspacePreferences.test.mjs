import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createWorkspacePreferenceState,
  normalizeEditorFontSize,
  persistStoredString,
  resolvePdfCustomPageForeground,
  restoreWorkspaceTheme,
  setWorkspaceEditorFontSize,
  setWorkspacePdfCustomPageBackground,
  setWorkspacePdfPageBackgroundFollowsTheme,
  setWorkspaceTheme,
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

function createMockClassList() {
  const values = new Set()
  return {
    add(...tokens) {
      tokens.forEach((token) => values.add(token))
    },
    remove(...tokens) {
      tokens.forEach((token) => values.delete(token))
    },
    contains(token) {
      return values.has(token)
    },
  }
}

function createMockDocument() {
  return {
    documentElement: {
      classList: createMockClassList(),
      dataset: {},
      style: {
        values: new Map(),
        setProperty(key, value) {
          this.values.set(key, value)
        },
        getPropertyValue(key) {
          return this.values.get(key) || ''
        },
      },
    },
  }
}

function createMockMatchMedia(matches = false) {
  const listeners = new Set()

  return {
    matches,
    addEventListener(type, listener) {
      if (type === 'change') listeners.add(listener)
    },
    removeEventListener(type, listener) {
      if (type === 'change') listeners.delete(listener)
    },
    dispatchChange(nextMatches) {
      this.matches = nextMatches
      listeners.forEach((listener) => listener({ matches: nextMatches }))
    },
  }
}

test('createWorkspacePreferenceState defaults pdf page colors to the dark embedded preview baseline', () => {
  const previousLocalStorage = globalThis.localStorage
  globalThis.localStorage = createMockStorage()

  try {
    const state = createWorkspacePreferenceState()
    assert.equal(state.pdfPageBackgroundFollowsTheme, true)
    assert.equal(state.pdfCustomPageBackground, '#1e1e1e')
  } finally {
    globalThis.localStorage = previousLocalStorage
  }
})

test('workspace theme defaults to system and normalizes legacy theme ids', () => {
  const previousLocalStorage = globalThis.localStorage

  try {
    globalThis.localStorage = createMockStorage()
    assert.equal(createWorkspacePreferenceState().theme, 'system')

    globalThis.localStorage = createMockStorage({ theme: 'humane' })
    assert.equal(createWorkspacePreferenceState().theme, 'light')

    globalThis.localStorage = createMockStorage({ theme: 'dracula' })
    assert.equal(createWorkspacePreferenceState().theme, 'dark')

    globalThis.localStorage = createMockStorage({ theme: 'unknown-theme' })
    assert.equal(createWorkspacePreferenceState().theme, 'system')
  } finally {
    globalThis.localStorage = previousLocalStorage
  }
})

test('system theme follows device appearance changes and explicit themes stay fixed', () => {
  const previousLocalStorage = globalThis.localStorage
  const previousDocument = globalThis.document
  const previousWindow = globalThis.window
  const mediaQuery = createMockMatchMedia(false)

  globalThis.localStorage = createMockStorage()
  globalThis.document = createMockDocument()
  globalThis.window = {
    matchMedia: () => mediaQuery,
  }

  try {
    const events = []
    globalThis.window.addEventListener = (type, listener) => {
      if (type === 'workspace-theme-updated') {
        events.push(listener)
      }
    }
    globalThis.window.removeEventListener = (type, listener) => {
      if (type !== 'workspace-theme-updated') return
      const index = events.indexOf(listener)
      if (index >= 0) events.splice(index, 1)
    }
    globalThis.window.dispatchEvent = (event) => {
      if (event?.type === 'workspace-theme-updated') {
        for (const listener of [...events]) listener(event)
      }
      return true
    }

    assert.equal(setWorkspaceTheme('system'), 'system')
    assert.equal(globalThis.localStorage.getItem('theme'), 'system')
    assert.equal(globalThis.document.documentElement.dataset.themePreference, 'system')
    assert.equal(globalThis.document.documentElement.dataset.themeResolved, 'light')
    assert.equal(globalThis.document.documentElement.classList.contains('theme-system'), true)
    assert.equal(globalThis.document.documentElement.classList.contains('theme-light'), true)

    mediaQuery.dispatchChange(true)
    assert.equal(globalThis.document.documentElement.dataset.themeResolved, 'dark')
    assert.equal(globalThis.document.documentElement.classList.contains('theme-light'), false)
    assert.equal(globalThis.document.documentElement.classList.contains('theme-dark'), true)

    assert.equal(setWorkspaceTheme('dracula'), 'dark')
    mediaQuery.dispatchChange(false)
    assert.equal(globalThis.document.documentElement.dataset.themePreference, 'dark')
    assert.equal(globalThis.document.documentElement.dataset.themeResolved, 'dark')

    assert.equal(restoreWorkspaceTheme('light'), 'light')
    assert.equal(globalThis.document.documentElement.dataset.themePreference, 'light')
    assert.equal(globalThis.document.documentElement.classList.contains('theme-light'), true)
    assert.equal(globalThis.document.documentElement.classList.contains('theme-system'), false)
  } finally {
    globalThis.localStorage = previousLocalStorage
    globalThis.document = previousDocument
    globalThis.window = previousWindow
  }
})

test('pdf custom color preferences restore, normalize, and persist eye-care overrides', () => {
  const previousLocalStorage = globalThis.localStorage
  globalThis.localStorage = createMockStorage({
    pdfCustomPageBackground: '#ABC',
    pdfCustomPageForegroundMode: 'custom',
    pdfCustomPageForeground: '#DEF',
  })

  try {
    const restored = createWorkspacePreferenceState()
    assert.equal(restored.pdfPageBackgroundFollowsTheme, true)
    assert.equal(restored.pdfCustomPageBackground, '#aabbcc')
    assert.equal(globalThis.localStorage.getItem('pdfCustomPageForegroundMode'), null)
    assert.equal(globalThis.localStorage.getItem('pdfCustomPageForeground'), null)

    assert.equal(setWorkspacePdfPageBackgroundFollowsTheme(false), false)
    assert.equal(globalThis.localStorage.getItem('pdfPageBackgroundFollowsTheme'), 'false')

    assert.equal(setWorkspacePdfCustomPageBackground('#EAF'), '#eeaaff')
    assert.equal(globalThis.localStorage.getItem('pdfCustomPageBackground'), '#eeaaff')
  } finally {
    globalThis.localStorage = previousLocalStorage
  }
})

test('pdf custom page foreground picks a readable contrast color from the stored background', () => {
  assert.equal(resolvePdfCustomPageForeground('#eaf4e4'), '#1f2a1f')
  assert.equal(resolvePdfCustomPageForeground('#1e1e1e'), '#f5faef')
  assert.equal(resolvePdfCustomPageForeground('#1f2a1f'), '#f5faef')
})

test('left sidebar panel preference defaults to files and restores the current valid mode', () => {
  const previousLocalStorage = globalThis.localStorage
  globalThis.localStorage = createMockStorage()

  try {
    const defaults = createWorkspacePreferenceState()
    assert.equal(defaults.leftSidebarPanel, 'files')

    persistStoredString('leftSidebarPanel', 'files')
    const restored = createWorkspacePreferenceState()
    assert.equal(restored.leftSidebarPanel, 'files')

    persistStoredString('leftSidebarPanel', 'references')
    const restoredReferences = createWorkspacePreferenceState()
    assert.equal(restoredReferences.leftSidebarPanel, 'references')
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

test('workspace preferences normalize any removed shell state onto the document workspace', () => {
  const previousLocalStorage = globalThis.localStorage
  globalThis.localStorage = createMockStorage({
    primarySurface: 'removed-surface',
    leftSidebarPanel: 'removed-panel',
  })

  try {
    const restored = createWorkspacePreferenceState()
    assert.equal(restored.primarySurface, 'workspace')
    assert.equal(restored.leftSidebarPanel, 'files')
  } finally {
    globalThis.localStorage = previousLocalStorage
  }
})

test('editor font size preference restores from storage and clamps invalid values', () => {
  const previousLocalStorage = globalThis.localStorage

  try {
    globalThis.localStorage = createMockStorage({ editorFontSize: '16' })
    assert.equal(createWorkspacePreferenceState().editorFontSize, 16)

    globalThis.localStorage = createMockStorage({ editorFontSize: '99' })
    assert.equal(createWorkspacePreferenceState().editorFontSize, 20)

    globalThis.localStorage = createMockStorage({ editorFontSize: '0' })
    assert.equal(createWorkspacePreferenceState().editorFontSize, 14)
  } finally {
    globalThis.localStorage = previousLocalStorage
  }
})

test('setWorkspaceEditorFontSize persists and applies the editor font size variable', () => {
  const previousLocalStorage = globalThis.localStorage
  const previousDocument = globalThis.document

  globalThis.localStorage = createMockStorage()
  globalThis.document = createMockDocument()

  try {
    assert.equal(normalizeEditorFontSize(11), 12)
    assert.equal(normalizeEditorFontSize(21), 20)

    const nextValue = setWorkspaceEditorFontSize(16)
    assert.equal(nextValue, 16)
    assert.equal(globalThis.localStorage.getItem('editorFontSize'), '16')
    assert.equal(
      globalThis.document.documentElement.style.getPropertyValue('--editor-font-size'),
      '16px'
    )
  } finally {
    globalThis.localStorage = previousLocalStorage
    globalThis.document = previousDocument
  }
})

test('right sidebar panel preference defaults to outline and restores the current valid mode', () => {
  const previousLocalStorage = globalThis.localStorage
  globalThis.localStorage = createMockStorage()

  try {
    const defaults = createWorkspacePreferenceState()
    assert.equal(defaults.rightSidebarPanel, 'outline')

    persistStoredString('rightSidebarPanel', 'document-run')
    const restored = createWorkspacePreferenceState()
    assert.equal(restored.rightSidebarPanel, 'outline')
  } finally {
    globalThis.localStorage = previousLocalStorage
  }
})

test('invalid right sidebar panel preference falls back to outline', () => {
  const previousLocalStorage = globalThis.localStorage
  globalThis.localStorage = createMockStorage({ rightSidebarPanel: 'invalid' })

  try {
    const restored = createWorkspacePreferenceState()
    assert.equal(restored.rightSidebarPanel, 'outline')

    globalThis.localStorage = createMockStorage({
      primarySurface: 'removed-surface',
      rightSidebarPanel: 'invalid',
    })
    const restoredWorkspacePanel = createWorkspacePreferenceState()
    assert.equal(restoredWorkspacePanel.rightSidebarPanel, 'outline')
  } finally {
    globalThis.localStorage = previousLocalStorage
  }
})
