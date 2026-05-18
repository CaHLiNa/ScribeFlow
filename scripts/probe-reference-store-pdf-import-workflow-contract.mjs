import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const storeSource = await readFile('src/stores/references.js', 'utf8')
const domainSource = await readFile('src/domains/references/referenceStoreState.js', 'utf8')
const mutationSource = await readFile('src-tauri/src/references_mutation.rs', 'utf8')
const backendSource = await readFile('src-tauri/src/references_backend.rs', 'utf8')

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

assert.doesNotMatch(
  domainSource,
  /buildReferencePdfImportTargetState|buildReferencePdfImportResultState/,
  'referenceStoreState must not retain migrated PDF import target/result helpers',
)
assert.match(
  mutationSource,
  /apply_import_pdf_reference[\s\S]*"selectedReference"[\s\S]*"preferredSelectedReferenceId"/,
  'Rust reference mutation must return PDF import selected reference and preferred selection',
)
assert.match(
  backendSource,
  /fn resolve_reference_asset_target/,
  'Rust reference backend must own asset target resolution used by PDF import asset storage',
)

const importSource = extractActionSource(storeSource, 'importReferencePdf')
assert.match(
  importSource,
  /const importResult = importMutation\?\.result \|\| \{\}/,
  'PDF import store action must consume Rust-returned import mutation result',
)
assert.match(
  importSource,
  /const importedSnapshot = importMutation\?\.snapshot \|\| await this\.buildLibrarySnapshotPayload\(\)/,
  'PDF import store action must use the Rust-returned imported snapshot',
)
assert.match(
  importSource,
  /storeReferencePdf\(projectRoot, \{\}, sourcePath,[\s\S]*references: importedSnapshot\?\.references,[\s\S]*referenceId: selectedReferenceId,/,
  'PDF import asset storage must delegate target lookup to Rust via snapshot and referenceId',
)
assert.match(
  importSource,
  /snapshot: importedSnapshot/,
  'PDF import asset update mutation must apply against the Rust-returned imported snapshot',
)
assert.match(
  importSource,
  /fallbackSnapshot: importedSnapshot/,
  'PDF import commit must preserve imported snapshot fallback',
)
assert.match(
  importSource,
  /assetMutation\?\.result\?\.selectedReference \|\| hydratedReference/,
  'PDF import store action must consume Rust-returned update result instead of reselecting locally',
)
assert.doesNotMatch(
  importSource,
  /buildReferencePdfImportTargetState|buildReferencePdfImportResultState|resolveReferenceById|Array\.isArray\(importedSnapshot\?\.references\)|String\(importMutation\?\.result\?\.selectedReferenceId \|\| ''\)\.trim\(\)|importTarget\./,
  'PDF import store action must not duplicate target lookup or result selection rules inline',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    rustPdfImportMutationResult: true,
    rustPdfImportAssetTargetResolution: true,
    storePdfImportAvoidsSnapshotLookup: true,
  },
}, null, 2))
