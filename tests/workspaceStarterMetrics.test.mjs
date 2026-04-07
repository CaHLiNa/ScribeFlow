import test from 'node:test'
import assert from 'node:assert/strict'

import {
  WORKSPACE_STARTER_COMPUTATION_EXTENSIONS,
  WORKSPACE_STARTER_DRAFT_EXTENSIONS,
  countWorkspaceStarterFilesByExtension,
  getWorkspaceStarterDirectory,
  getWorkspaceStarterFileExtension,
  getWorkspaceStarterRelativePath,
  normalizeWorkspaceStarterPath,
} from '../src/domains/workspace/workspaceStarterMetrics.js'
import {
  countWorkspaceFlatFilesByExtension,
  filterWorkspaceFlatFilesByExtension,
  filterExistingRecentFiles,
  listWorkspaceFlatFileEntries,
  listWorkspaceFlatFilePaths,
} from '../src/domains/files/workspaceSnapshotFlatFilesRuntime.js'

test('workspace starter metrics normalizes paths and resolves extensions', () => {
  assert.equal(
    normalizeWorkspaceStarterPath('C:\\Research\\paper\\draft.tex'),
    'C:/Research/paper/draft.tex'
  )
  assert.equal(getWorkspaceStarterFileExtension('/workspace/notes/intro.MD'), '.md')
  assert.equal(getWorkspaceStarterFileExtension('/workspace/archive'), '')
})

test('workspace starter metrics counts draft and computation artifacts by extension', () => {
  const files = [
    { path: '/workspace/intro.md' },
    { path: '/workspace/paper/main.tex' },
    { path: '/workspace/slides/main.typ' },
    { path: '/workspace/archive/draft.pdf' },
    { path: '/workspace/assets/figure.png' },
    { path: '/workspace/data/table.csv' },
  ]

  assert.equal(countWorkspaceStarterFilesByExtension(files, WORKSPACE_STARTER_DRAFT_EXTENSIONS), 3)
  assert.equal(
    countWorkspaceStarterFilesByExtension(files, WORKSPACE_STARTER_COMPUTATION_EXTENSIONS),
    0
  )
})

test('workspace starter metrics resolves relative paths and project-root directories', () => {
  assert.equal(
    getWorkspaceStarterRelativePath('/workspace/sections/intro.md', '/workspace'),
    'sections/intro.md'
  )
  assert.equal(
    getWorkspaceStarterDirectory('/workspace/sections/intro.md', '/workspace'),
    'sections'
  )
  assert.equal(getWorkspaceStarterDirectory('/workspace/intro.md', '/workspace'), '')
})

test('workspace snapshot flat-file runtime lists and counts flat files from snapshots', () => {
  const snapshot = {
    flatFiles: [
      { path: '/workspace/intro.md' },
      { path: '/workspace/paper/main.tex' },
      { path: '/workspace/slides/main.typ' },
      { path: '/workspace/archive/draft.pdf' },
    ],
  }

  assert.deepEqual(listWorkspaceFlatFileEntries(snapshot), [
    { path: '/workspace/intro.md', name: 'intro.md' },
    { path: '/workspace/paper/main.tex', name: 'main.tex' },
    { path: '/workspace/slides/main.typ', name: 'main.typ' },
    { path: '/workspace/archive/draft.pdf', name: 'draft.pdf' },
  ])
  assert.deepEqual(listWorkspaceFlatFilePaths(snapshot), [
    '/workspace/intro.md',
    '/workspace/paper/main.tex',
    '/workspace/slides/main.typ',
    '/workspace/archive/draft.pdf',
  ])
  assert.equal(
    countWorkspaceFlatFilesByExtension(snapshot, WORKSPACE_STARTER_DRAFT_EXTENSIONS),
    3,
  )
  assert.equal(
    countWorkspaceFlatFilesByExtension(snapshot, WORKSPACE_STARTER_COMPUTATION_EXTENSIONS),
    0,
  )
})

test('workspace snapshot flat-file runtime normalizes mixed entries and filters by extension', () => {
  const snapshot = {
    flatFiles: [
      '/workspace/intro.md',
      { path: '/workspace/paper/main.tex', is_dir: false },
      { path: '/workspace/assets', is_dir: true, name: 'assets' },
      { path: '/workspace/slides/main.typ', name: 'Slides main.typ', is_dir: false },
    ],
  }

  assert.deepEqual(listWorkspaceFlatFileEntries(snapshot), [
    { path: '/workspace/intro.md', name: 'intro.md', is_dir: false },
    { path: '/workspace/paper/main.tex', name: 'main.tex', is_dir: false },
    { path: '/workspace/slides/main.typ', name: 'Slides main.typ', is_dir: false },
  ])
  assert.deepEqual(
    filterWorkspaceFlatFilesByExtension(snapshot, ['.md', '.typ']).map((entry) => entry.path),
    ['/workspace/intro.md', '/workspace/slides/main.typ'],
  )
})

test('workspace snapshot flat-file runtime filters recent files by snapshot membership', () => {
  const snapshot = {
    flatFiles: [
      { path: '/workspace/intro.md' },
      { path: '/workspace/paper/main.tex' },
    ],
  }

  const recentFiles = [
    { path: '/workspace/intro.md', openedAt: '2026-04-08T10:00:00.000Z' },
    { path: '/workspace/missing.md', openedAt: '2026-04-08T09:00:00.000Z' },
    { path: '/workspace/paper/main.tex', openedAt: '2026-04-08T08:00:00.000Z' },
  ]

  assert.deepEqual(filterExistingRecentFiles(recentFiles, snapshot), [
    { path: '/workspace/intro.md', openedAt: '2026-04-08T10:00:00.000Z' },
    { path: '/workspace/paper/main.tex', openedAt: '2026-04-08T08:00:00.000Z' },
  ])
})
