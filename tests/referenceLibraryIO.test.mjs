import test from 'node:test'
import assert from 'node:assert/strict'

import {
  REFERENCE_LIBRARY_FILENAME,
  buildDefaultReferenceLibrarySnapshot,
  readOrCreateReferenceLibrarySnapshot,
  normalizeReferenceLibrarySnapshot,
  resolveReferenceLibraryFile,
  resolveReferencesDataDir,
  writeReferenceLibrarySnapshot,
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

test('readOrCreateReferenceLibrarySnapshot forwards params to the Rust backend', async () => {
  const calls = []
  globalThis.window = globalThis.window || {}
  window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {}
  const previousInvoke = window.__TAURI_INTERNALS__.invoke
  window.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
    calls.push({ command, args })
    if (command === 'references_library_read_or_create') {
      return {
        version: 2,
        legacyMigrationComplete: true,
        citationStyle: 'apa',
        collections: [{ key: 'control-theory', label: '控制理论' }],
        tags: [],
        references: [
          {
            id: 'legacy-ref-1',
            typeKey: 'journal-article',
            title: 'Legacy Paper',
            authors: ['Author One'],
            citationKey: 'legacy2024',
          },
        ],
      }
    }
    if (command === 'references_assets_migrate') {
      return args.params?.references || []
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
    assert.deepEqual(calls[0], {
      command: 'references_library_read_or_create',
      args: {
        params: {
          globalConfigDir: '/tmp/.altals',
          legacyWorkspaceDataDir: '',
          legacyProjectRoot: '/tmp/project',
        },
      },
    })
  } finally {
    window.__TAURI_INTERNALS__.invoke = previousInvoke
  }
})

test('writeReferenceLibrarySnapshot sends normalized snapshots to the Rust backend', async () => {
  const calls = []
  globalThis.window = globalThis.window || {}
  window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {}
  const previousInvoke = window.__TAURI_INTERNALS__.invoke
  window.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
    calls.push({ command, args })
    if (command === 'references_library_write') {
      return null
    }
    throw new Error(`Unexpected invoke command: ${command}`)
  }

  try {
    await writeReferenceLibrarySnapshot('/tmp/.altals', {
      version: 2,
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

    assert.equal(calls.length, 1)
    assert.equal(calls[0].command, 'references_library_write')
    assert.equal(calls[0].args.params.globalConfigDir, '/tmp/.altals')
    assert.equal(calls[0].args.params.snapshot.references[0].typeKey, 'journal-article')
    assert.equal(calls[0].args.params.snapshot.references[0].hasPdf, true)
  } finally {
    window.__TAURI_INTERNALS__.invoke = previousInvoke
  }
})
