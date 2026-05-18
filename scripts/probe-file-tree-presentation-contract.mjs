import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  appendTypedFileExtension,
  buildFileTreeRenameState,
  buildTypedFileNameCandidate,
  deriveTypedFileNameCandidates,
  listFileTreeRecentWorkspaces,
  normalizeTypedFileExtension,
  resetFileTreeRenameState,
  resolveFileTreeWorkspaceName,
  resolveNewMenuStyle,
  resolveWorkspaceMenuPosition,
  resolveWorkspaceMenuStyle,
} from '../src/domains/files/fileTreePresentation.js'

assert.equal(
  resolveFileTreeWorkspaceName({ translate: (key) => `t:${key}` }),
  't:Explorer',
)
assert.equal(
  resolveFileTreeWorkspaceName({
    workspacePath: '/tmp/workspace',
    workspaceBasename: 'workspace',
    translate: (key) => `t:${key}`,
  }),
  'workspace',
)
assert.equal(
  resolveFileTreeWorkspaceName({
    workspacePath: '/tmp/workspace',
    workspaceBasename: ' ',
    translate: (key) => `t:${key}`,
  }),
  't:Explorer',
)

assert.deepEqual(
  listFileTreeRecentWorkspaces(['a', 'b', 'c', 'd', 'e', 'f']),
  ['a', 'b', 'c', 'd', 'e'],
)
assert.deepEqual(listFileTreeRecentWorkspaces(['a', 'b'], 1), ['a'])
assert.deepEqual(listFileTreeRecentWorkspaces('not-array'), [])

assert.deepEqual(
  resolveWorkspaceMenuStyle({ right: 4, bottom: Number.NaN }),
  { right: '8px', bottom: '8px' },
)
assert.deepEqual(
  resolveWorkspaceMenuPosition({
    anchorRect: { right: 312, top: 740 },
    viewportWidth: 1280,
    viewportHeight: 900,
  }),
  { right: 968, bottom: 162 },
)
assert.deepEqual(
  resolveWorkspaceMenuPosition({
    anchorRect: { right: 1279, top: 899 },
    viewportWidth: 1280,
    viewportHeight: 900,
  }),
  { right: 8, bottom: 8 },
)

assert.deepEqual(
  resolveNewMenuStyle({
    anchorRect: { bottom: 110, left: 24, top: 82 },
    menuRect: { height: 160 },
    viewportHeight: 500,
  }),
  { top: '114px', left: '24px' },
)
assert.deepEqual(
  resolveNewMenuStyle({
    anchorRect: { bottom: 470, left: 24, top: 442 },
    menuRect: { height: 160 },
    viewportHeight: 500,
  }),
  { top: '278px', left: '24px' },
)

assert.equal(normalizeTypedFileExtension('tex'), '.tex')
assert.equal(normalizeTypedFileExtension(' .md '), '.md')
assert.equal(appendTypedFileExtension('paper', 'tex'), 'paper.tex')
assert.equal(appendTypedFileExtension('paper.md', 'tex'), 'paper.md')
assert.equal(appendTypedFileExtension(' ', 'tex'), '')

assert.equal(
  buildTypedFileNameCandidate({
    suggestedName: 'paper',
    extension: 'tex',
    fallbackBaseName: 'Untitled',
  }),
  'paper.tex',
)
assert.equal(
  buildTypedFileNameCandidate({
    suggestedName: 'paper.tex',
    extension: '.tex',
    fallbackBaseName: 'Untitled',
    index: 2,
  }),
  'paper 3.tex',
)
assert.deepEqual(
  deriveTypedFileNameCandidates({
    suggestedName: '',
    extension: '.md',
    fallbackBaseName: 'Untitled',
    maxAttempts: 4,
  }),
  ['Untitled.md', 'Untitled 2.md', 'Untitled 3.md', 'Untitled 4.md'],
)
assert.deepEqual(
  deriveTypedFileNameCandidates({
    suggestedName: 'notes.md',
    extension: '.md',
    fallbackBaseName: 'Untitled',
    maxAttempts: 3,
  }),
  ['notes.md', 'notes 2.md', 'notes 3.md'],
)

assert.deepEqual(
  buildFileTreeRenameState({
    isNew: true,
    isDir: false,
    parentDir: ' /tmp/workspace ',
    value: 'draft',
    autoExtension: 'md',
  }),
  {
    active: true,
    value: 'draft',
    originalPath: '',
    isNew: true,
    isDir: false,
    autoExtension: '.md',
    parentDir: '/tmp/workspace',
  },
)
assert.deepEqual(
  buildFileTreeRenameState({
    entry: { name: 'paper.md', path: '/tmp/workspace/paper.md' },
  }),
  {
    active: true,
    value: 'paper.md',
    originalPath: '/tmp/workspace/paper.md',
    isNew: false,
    isDir: false,
    autoExtension: '',
    parentDir: '',
  },
)
assert.deepEqual(resetFileTreeRenameState(), {
  active: false,
  value: '',
  originalPath: '',
  isNew: false,
  isDir: false,
  autoExtension: '',
  parentDir: '',
})

const fileTreeSource = await readFile('src/components/sidebar/FileTree.vue', 'utf8')
const fileTreeActionsSource = await readFile('src/composables/files/useFileTreeActions.js', 'utf8')

assert.match(
  fileTreeSource,
  /from '..\/..\/domains\/files\/fileTreePresentation\.js'/,
  'FileTree.vue must import deterministic presentation rules from the file domain',
)
assert.match(
  fileTreeSource,
  /resolveFileTreeWorkspaceName/,
  'FileTree.vue must derive the workspace label through the file tree presentation helper',
)
assert.match(
  fileTreeSource,
  /resolveWorkspaceMenuPosition/,
  'FileTree.vue must derive workspace menu positioning through the presentation helper',
)
assert.match(
  fileTreeActionsSource,
  /buildTypedFileNameCandidate/,
  'File tree action workflow must keep typed file suffix fallback deterministic after the initial candidate list',
)
assert.match(
  fileTreeActionsSource,
  /deriveTypedFileNameCandidates/,
  'File tree action workflow must derive typed file candidate names through the file domain',
)
assert.doesNotMatch(
  fileTreeSource,
  /buildTypedFileNameCandidate|deriveTypedFileNameCandidates|appendTypedFileExtension|buildFileTreeRenameState|resetFileTreeRenameState/,
  'FileTree.vue must not directly own typed file candidate or rename-state presentation helpers',
)
assert.doesNotMatch(
  fileTreeSource,
  /Date\.now\(\).*extension|Date\.now\(\).*ext|workspace\.recentWorkspaces\.slice\(0,\s*5\)/s,
  'FileTree.vue must not use timestamp names or duplicate the recent-workspace limit inline',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    workspaceLabelDerived: true,
    recentWorkspaceLimitDerived: true,
    menuPositionDerived: true,
    typedFileNamesDeterministic: true,
    renameStateDerived: true,
    componentUsesDomainHelper: true,
  },
}, null, 2))
