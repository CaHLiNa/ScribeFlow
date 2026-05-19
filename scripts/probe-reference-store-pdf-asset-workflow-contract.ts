import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const storeSource = await readFile('src/stores/references.ts', 'utf8')
const domainSource = await readFile('src/domains/references/referenceStoreState.ts', 'utf8')
const serviceSource = await readFile('src/services/references/referenceAssets.ts', 'utf8')
const rustSource = await readFile('src-tauri/src/references_backend.rs', 'utf8')

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
  /buildReferencePdfAssetTargetState|buildReferencePdfAssetResultState/,
  'referenceStoreState must not retain migrated PDF asset target/result helpers',
)
assert.match(
  rustSource,
  /fn resolve_reference_asset_target/,
  'Rust reference backend must own PDF asset target resolution',
)
assert.match(
  rustSource,
  /reference_id: String/,
  'Rust reference asset params must accept target reference id',
)
assert.match(
  rustSource,
  /references: Vec<Value>/,
  'Rust reference asset params must accept current reference snapshot',
)
assert.match(
  rustSource,
  /Reference not found/,
  'Rust reference asset target resolution must report missing targets',
)
assert.match(
  serviceSource,
  /const references = Array\.isArray\(options\.references\) \? options\.references : \[\][\s\S]*references,/,
  'reference asset bridge must pass references through without resolving targets locally',
)
assert.match(
  serviceSource,
  /referenceId: options\.referenceId \|\| ''/,
  'reference asset bridge must pass target referenceId through to Rust',
)

const attachSource = extractActionSource(storeSource, 'attachReferencePdf')
assert.match(
  attachSource,
  /storeReferencePdf\(projectRoot, \{\}, sourcePath,[\s\S]*references: this\.references,[\s\S]*referenceId,/,
  'attachReferencePdf must pass current references and referenceId to the Rust asset bridge',
)
assert.match(
  attachSource,
  /const targetReferenceId = updatedReference\?\.id \|\| referenceId/,
  'attachReferencePdf must use the Rust-returned reference id for the update mutation',
)
assert.match(
  attachSource,
  /String\(error\?\.message \|\| error\) === 'Reference not found'[\s\S]*return null/,
  'attachReferencePdf must preserve missing-target null semantics from Rust errors',
)

const renameSource = extractActionSource(storeSource, 'renameReferencePdfAsset')
assert.match(
  renameSource,
  /renameReferencePdfAssetWithBackend\(projectRoot, \{\}, nextBaseName,[\s\S]*references: this\.references,[\s\S]*referenceId,/,
  'renameReferencePdfAsset must pass current references and referenceId to the Rust asset bridge',
)
assert.match(
  renameSource,
  /const targetReferenceId = updatedReference\?\.id \|\| referenceId/,
  'renameReferencePdfAsset must use the Rust-returned reference id for the update mutation',
)
assert.match(
  renameSource,
  /String\(error\?\.message \|\| error\) === 'Reference not found'[\s\S]*return null/,
  'renameReferencePdfAsset must preserve missing-target null semantics from Rust errors',
)

assert.doesNotMatch(
  `${attachSource}\n${renameSource}`,
  /buildReferencePdfAssetTargetState|buildReferencePdfAssetResultState|resolveReferenceById\(this\.references|String\(referenceId \|\| ''\)\.trim\(\)|targetState\./,
  'PDF asset store actions must not duplicate target lookup or result selection rules inline',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    rustPdfAssetTargetResolution: true,
    referenceAssetBridgeRemainsThin: true,
    storePdfAssetActionsAvoidDuplicateTargetRules: true,
    missingPdfAssetReferencePreserved: true,
  },
}, null, 2))
