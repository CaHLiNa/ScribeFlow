import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const storeSource = await readFile('src/stores/references.js', 'utf8')

assert.match(
  storeSource,
  /async function commitImportedReferences\(store, projectRoot = '', importedReferences = \[\]\)/,
  'references store must centralize imported-reference commit workflow',
)

const helperMatch = storeSource.match(
  /async function commitImportedReferences[\s\S]*?\n}\n\nexport const useReferencesStore/
)
assert.ok(helperMatch, 'commitImportedReferences helper must be defined before the Pinia store')
const helperSource = helperMatch[0]

function extractActionSource(source, actionName) {
  const start = source.indexOf(`async ${actionName}(`)
  assert.notEqual(start, -1, `${actionName} action must exist`)

  const endCandidates = [
    source.indexOf('\n    async ', start + 1),
    source.indexOf('\n    cleanup()', start + 1),
  ].filter((index) => index !== -1)
  assert.ok(endCandidates.length > 0, `${actionName} action end must be found`)

  return source.slice(start, Math.min(...endCandidates))
}

assert.match(
  helperSource,
  /type: 'mergeImportedReferences'/,
  'commitImportedReferences must delegate merge and duplicate policy to the Rust-backed mutation bridge',
)
assert.match(
  helperSource,
  /markForZoteroPush: true/,
  'commitImportedReferences must preserve imported-reference Zotero push intent',
)
assert.match(
  helperSource,
  /commitReferenceMutationSnapshot\(store, projectRoot, mutation,/,
  'commitImportedReferences must preserve the shared mutation snapshot commit boundary',
)
assert.match(
  helperSource,
  /preferredSelectedReferenceId: selectedReferenceId/,
  'commitImportedReferences must preserve selected-reference restoration after commit',
)
assert.match(
  helperSource,
  /reusedExisting: mutation\?\.result\?\.reusedExisting === true/,
  'commitImportedReferences must preserve duplicate-reuse result semantics',
)
assert.doesNotMatch(
  helperSource,
  /\.push\(|\.splice\(|new Set\(|findIndex\(|writeReferenceLibrarySnapshot|normalizeReferenceLibrarySnapshotWithBackend/,
  'commitImportedReferences must not perform local merge, dedupe, or persistence policy itself',
)

for (const actionName of ['importParsedReferences', 'importResolvedReferenceText']) {
  const actionSource = extractActionSource(storeSource, actionName)
  assert.match(
    actionSource,
    /return commitImportedReferences\(this, projectRoot, importedReferences\)/,
    `${actionName} must reuse the shared imported-reference commit workflow`,
  )
  assert.doesNotMatch(
    actionSource,
    /type: 'mergeImportedReferences'|markForZoteroPush: true|mutation\?\.result\?\.selectedReferenceId/,
    `${actionName} must not duplicate imported-reference merge result handling inline`,
  )
}

console.log(JSON.stringify({
  ok: true,
  summary: {
    sharedImportCommitWorkflow: true,
    rustMutationRemainsMergeAuthority: true,
    snapshotCommitBoundaryPreserved: true,
    importActionsAvoidDuplicateMergeHandling: true,
  },
}, null, 2))
