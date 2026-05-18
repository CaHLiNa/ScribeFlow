import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const storeSource = await readFile('src/stores/references.js', 'utf8')

function extractFunctionSource(source, functionName, endMarker) {
  const start = source.indexOf(`async function ${functionName}(`)
  assert.notEqual(start, -1, `${functionName} helper must exist`)
  const end = source.indexOf(endMarker, start + 1)
  assert.notEqual(end, -1, `${functionName} helper end must be found`)
  return source.slice(start, end)
}

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

const helperSource = extractFunctionSource(
  storeSource,
  'commitReferenceMutationSnapshot',
  '\n\nasync function commitImportedReferences',
)

assert.match(
  helperSource,
  /mutation\?\.snapshot \|\| fallbackSnapshot \|\| store\.buildLibrarySnapshotPayload\(\)/,
  'commitReferenceMutationSnapshot must centralize mutation snapshot fallback handling',
)
assert.match(
  helperSource,
  /store\.commitLibrarySnapshot\(projectRoot, snapshot, commitOptions\)/,
  'commitReferenceMutationSnapshot must preserve the existing snapshot commit boundary',
)
assert.doesNotMatch(
  helperSource,
  /applyReferenceMutation|type:|mergeImportedReferences|writeReferenceLibrarySnapshot|normalizeReferenceLibrarySnapshotWithBackend|new Set\(|findIndex\(|\.push\(|\.splice\(/,
  'commitReferenceMutationSnapshot must not own mutation, merge, dedupe, or persistence policy',
)

for (const actionName of [
  'createCollection',
  'renameCollection',
  'removeCollection',
  'setDocumentReferenceIds',
  'addReference',
  'updateReference',
  'removeReference',
  'toggleReferenceCollection',
]) {
  const actionSource = extractActionSource(storeSource, actionName)
  assert.match(
    actionSource,
    /commitReferenceMutationSnapshot\(this, projectRoot, mutation/,
    `${actionName} must use the shared mutation snapshot commit workflow`,
  )
  assert.doesNotMatch(
    actionSource,
    /this\.commitLibrarySnapshot\(/,
    `${actionName} must not duplicate mutation snapshot commit wiring inline`,
  )
}

const importPdfSource = extractActionSource(storeSource, 'importReferencePdf')
assert.match(
  importPdfSource,
  /commitReferenceMutationSnapshot\(this, projectRoot, assetMutation,/,
  'importReferencePdf must reuse the shared mutation snapshot commit workflow for the asset update mutation',
)
assert.match(
  importPdfSource,
  /fallbackSnapshot: importedSnapshot/,
  'importReferencePdf must preserve imported snapshot fallback for the asset update mutation',
)

const persistSnapshotSource = extractActionSource(storeSource, 'persistLibrarySnapshot')
assert.match(
  persistSnapshotSource,
  /this\.commitLibrarySnapshot\(projectRoot, this\.buildLibrarySnapshotPayload\(\)\)/,
  'persistLibrarySnapshot should remain the direct local snapshot persistence entrypoint',
)

const directStoreCommitCallCount = [...storeSource.matchAll(/this\.commitLibrarySnapshot\(/g)].length
assert.equal(
  directStoreCommitCallCount,
  1,
  'only persistLibrarySnapshot should call this.commitLibrarySnapshot directly',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    sharedMutationSnapshotCommitWorkflow: true,
    mutationActionsAvoidDuplicateCommitWiring: true,
    rustMutationRemainsPolicyAuthority: true,
    directCommitCallsRemainLimited: true,
  },
}, null, 2))
