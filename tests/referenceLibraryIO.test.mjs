import test from 'node:test'
import assert from 'node:assert/strict'

import {
  REFERENCE_LIBRARY_FILENAME,
  buildDefaultReferenceLibrarySnapshot,
  readOrCreateReferenceLibrarySnapshot,
  normalizeReferenceLibrarySnapshot,
  resolveReferenceLibraryFile,
  resolveReferencesDataDir,
} from '../src/services/references/referenceLibraryIO.js'

test('reference library paths resolve inside the app global config directory', () => {
  assert.equal(resolveReferencesDataDir('/tmp/.altals'), '/tmp/.altals/references')
  assert.equal(
    resolveReferenceLibraryFile('/tmp/.altals'),
    `/tmp/.altals/references/${REFERENCE_LIBRARY_FILENAME}`
  )
})

test('default reference library snapshot has the expected top-level fields', () => {
  const snapshot = buildDefaultReferenceLibrarySnapshot()

  assert.equal(snapshot.version, 2)
  assert.equal(snapshot.legacyMigrationComplete, false)
  assert.equal(snapshot.citationStyle, 'apa')
  assert.equal(Array.isArray(snapshot.collections), true)
  assert.equal(Array.isArray(snapshot.tags), true)
  assert.equal(Array.isArray(snapshot.references), true)
  assert.equal(snapshot.references.length, 0)
})

test('normalizing a saved library snapshot removes legacy demo references and backfills type keys', () => {
  const snapshot = normalizeReferenceLibrarySnapshot({
    references: [
      {
        id: 'ref-1',
        title: 'CBF-based safety design for adaptive control of uncertain nonlinear strict-feedback systems',
        typeLabel: '期刊论文',
      },
      {
        id: 'user-1',
        title: 'Real Paper',
        typeLabel: '会议论文',
      },
    ],
  })

  assert.equal(snapshot.references.length, 1)
  assert.equal(snapshot.references[0].id, 'user-1')
  assert.equal(snapshot.references[0].typeKey, 'conference-paper')
})

test('normalizing a saved library snapshot derives hasPdf from pdfPath', () => {
  const snapshot = normalizeReferenceLibrarySnapshot({
    references: [
      {
        id: 'user-2',
        title: 'PDF-backed paper',
        typeLabel: '期刊论文',
        pdfPath: '/tmp/paper.pdf',
        hasPdf: false,
      },
    ],
  })

  assert.equal(snapshot.references[0].pdfPath, '/tmp/paper.pdf')
  assert.equal(snapshot.references[0].hasPdf, true)
})

test('normalizing a saved library snapshot backfills citation style', () => {
  const snapshot = normalizeReferenceLibrarySnapshot({
    version: 1,
    references: [],
  })

  assert.equal(snapshot.citationStyle, 'apa')
  assert.equal(snapshot.legacyMigrationComplete, false)
})

test('readOrCreateReferenceLibrarySnapshot migrates legacy project references into an existing empty global library', async () => {
  const files = new Map()
  const dirs = new Set()

  const globalLibrary = '/tmp/.altals/references/library.json'
  const projectLibrary = '/tmp/project/references/library.json'

  files.set(
    globalLibrary,
    JSON.stringify({
      version: 2,
      citationStyle: 'apa',
      collections: [],
      tags: [],
      references: [],
    })
  )
  files.set(
    projectLibrary,
    JSON.stringify({
      version: 2,
      citationStyle: 'apa',
      collections: [{ key: 'control-theory', label: '控制理论' }],
      tags: [],
      references: [
        {
          id: 'legacy-ref-1',
          typeKey: 'journal-article',
          title: 'Legacy Paper',
          authors: ['Author One'],
          authorLine: 'Author One',
          year: 2024,
          source: 'Journal',
          identifier: '10.1000/legacy',
          pages: '',
          citationKey: 'legacy2024',
          collections: ['control-theory'],
          tags: [],
          abstract: '',
          annotations: [],
        },
      ],
    })
  )

  globalThis.window = globalThis.window || {}
  window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {}
  const previousInvoke = window.__TAURI_INTERNALS__.invoke
  window.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
    if (command === 'create_dir') {
      dirs.add(args.path)
      return null
    }
    if (command === 'path_exists') {
      return files.has(args.path) || dirs.has(args.path)
    }
    if (command === 'read_file') {
      return files.get(args.path)
    }
    if (command === 'write_file') {
      files.set(args.path, args.content)
      return null
    }
    if (command === 'copy_file') {
      const source = files.get(args.src)
      if (source != null) files.set(args.dest, source)
      return null
    }
    throw new Error(`Unexpected invoke command: ${command}`)
  }

  try {
    const snapshot = await readOrCreateReferenceLibrarySnapshot('/tmp/.altals', {
      legacyProjectRoot: '/tmp/project',
    })
    assert.equal(snapshot.references.length, 1)
    assert.equal(snapshot.references[0].id, 'legacy-ref-1')
    assert.equal(snapshot.collections.length, 1)
    assert.equal(snapshot.legacyMigrationComplete, true)

    const persisted = JSON.parse(files.get(globalLibrary))
    assert.equal(persisted.references.length, 1)
    assert.equal(persisted.references[0].id, 'legacy-ref-1')
    assert.equal(persisted.legacyMigrationComplete, true)
  } finally {
    window.__TAURI_INTERNALS__.invoke = previousInvoke
  }
})

test('readOrCreateReferenceLibrarySnapshot does not re-import legacy entries after migration completed', async () => {
  const files = new Map()
  const dirs = new Set()

  const globalLibrary = '/tmp/.altals/references/library.json'
  const projectLibrary = '/tmp/project/references/library.json'

  files.set(
    globalLibrary,
    JSON.stringify({
      version: 2,
      legacyMigrationComplete: true,
      citationStyle: 'apa',
      collections: [],
      tags: [],
      references: [],
    })
  )
  files.set(
    projectLibrary,
    JSON.stringify({
      version: 2,
      citationStyle: 'apa',
      collections: [{ key: 'control-theory', label: '控制理论' }],
      tags: [],
      references: [
        {
          id: 'legacy-ref-1',
          typeKey: 'journal-article',
          title: 'Legacy Paper',
          authors: ['Author One'],
          authorLine: 'Author One',
          year: 2024,
          source: 'Journal',
          identifier: '10.1000/legacy',
          pages: '',
          citationKey: 'legacy2024',
          collections: ['control-theory'],
          tags: [],
          abstract: '',
          annotations: [],
        },
      ],
    })
  )

  globalThis.window = globalThis.window || {}
  window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {}
  const previousInvoke = window.__TAURI_INTERNALS__.invoke
  window.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
    if (command === 'create_dir') {
      dirs.add(args.path)
      return null
    }
    if (command === 'path_exists') {
      return files.has(args.path) || dirs.has(args.path)
    }
    if (command === 'read_file') {
      return files.get(args.path)
    }
    if (command === 'write_file') {
      files.set(args.path, args.content)
      return null
    }
    if (command === 'copy_file') {
      const source = files.get(args.src)
      if (source != null) files.set(args.dest, source)
      return null
    }
    throw new Error(`Unexpected invoke command: ${command}`)
  }

  try {
    const snapshot = await readOrCreateReferenceLibrarySnapshot('/tmp/.altals', {
      legacyProjectRoot: '/tmp/project',
    })

    assert.equal(snapshot.references.length, 0)
    assert.equal(snapshot.collections.length, 0)
    assert.equal(snapshot.legacyMigrationComplete, true)

    const persisted = JSON.parse(files.get(globalLibrary))
    assert.equal(persisted.references.length, 0)
    assert.equal(persisted.collections.length, 0)
    assert.equal(persisted.legacyMigrationComplete, true)
  } finally {
    window.__TAURI_INTERNALS__.invoke = previousInvoke
  }
})
