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
  /mutation\?\.snapshot \|\| fallbackSnapshot \|\| await store\.buildLibrarySnapshotPayload\(\)/,
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
  'addDocumentReference',
  'removeDocumentReference',
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

for (const actionName of [
  'createCollection',
  'renameCollection',
  'removeCollection',
  'setDocumentReferenceIds',
  'addDocumentReference',
  'removeDocumentReference',
  'addReference',
  'updateReference',
  'removeReference',
  'toggleReferenceCollection',
]) {
  const actionSource = extractActionSource(storeSource, actionName)
  assert.match(
    actionSource,
    /selectedReferenceId: this\.selectedReferenceId/,
    `${actionName} must pass current selection to Rust mutation authority`,
  )
}

assert.match(
  extractActionSource(storeSource, 'updateReference'),
  /mutation\?\.result\?\.preferredSelectedReferenceId \|\| ''/,
  'updateReference must consume Rust-returned preferred selection for snapshot commit',
)
assert.match(
  extractActionSource(storeSource, 'removeReference'),
  /mutation\?\.result\?\.preferredSelectedReferenceId \|\| ''/,
  'removeReference must consume Rust-returned preferred selection for snapshot commit',
)
assert.match(
  extractActionSource(storeSource, 'removeReference'),
  /mutation\?\.result\?\.zoteroDeleteReference[\s\S]*deleteFromZotero\(zoteroDeleteReference\)/,
  'removeReference must consume the Rust-returned Zotero delete target',
)
assert.doesNotMatch(
  extractActionSource(storeSource, 'removeReference'),
  /_pushedByApp|_zoteroKey|buildReferenceRemoveTargetState|targetState\./,
  'removeReference must not inline remove-target lookup or Zotero side-effect gating',
)
for (const actionName of ['setDocumentReferenceIds', 'addDocumentReference', 'removeDocumentReference']) {
  const documentReferenceSource = extractActionSource(storeSource, actionName)
  assert.match(
    documentReferenceSource,
    /mutation\?\.result\?\.changed !== true[\s\S]*return false[\s\S]*commitReferenceMutationSnapshot\(this, projectRoot, mutation,/,
    `${actionName} must consume Rust-returned document-reference mutation outcome`,
  )
  assert.doesNotMatch(
    documentReferenceSource,
    /buildDocumentReferenceIdsMutationState|buildAddDocumentReferenceMutationState|buildRemoveDocumentReferenceMutationState|String\(texPath \|\| ''\)\.trim\(\)|String\(referenceId \|\| ''\)\.trim\(\)|resolveDocumentReferenceIds\(this\.documentReferenceSelections|\.includes\(|\.filter\(\(id\) => id !==/,
    `${actionName} must not inline document-reference mutation derivation`,
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
assert.match(
  importPdfSource,
  /snapshot: importedSnapshot/,
  'importReferencePdf must use the imported snapshot for the asset update mutation',
)

const persistSnapshotSource = extractActionSource(storeSource, 'persistLibrarySnapshot')
assert.match(
  persistSnapshotSource,
  /this\.commitLibrarySnapshot\(projectRoot, await this\.buildLibrarySnapshotPayload\(\)\)/,
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
