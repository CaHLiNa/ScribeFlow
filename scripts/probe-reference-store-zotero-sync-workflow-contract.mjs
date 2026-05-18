import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const storeSource = await readFile('src/stores/references.js', 'utf8')
const domainSource = await readFile('src/domains/references/referenceStoreState.js', 'utf8')
const serviceSource = await readFile('src/services/references/zoteroSync.js', 'utf8')
const rustSource = await readFile('src-tauri/src/references_zotero.rs', 'utf8')

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
  /buildReferenceZoteroSyncResultState/,
  'referenceStoreState must not retain migrated Zotero sync result helper',
)
assert.match(
  rustSource,
  /fn canonical_zotero_sync_persist_result[\s\S]*"zoteroSyncStatus": "synced"[\s\S]*"zoteroSyncLastSyncTime"[\s\S]*"counts": counts/,
  'Rust Zotero sync must return frontend-ready successful sync state',
)
assert.match(
  rustSource,
  /fn canonical_zotero_sync_skipped_result[\s\S]*"zoteroSyncStatus": "disconnected"[\s\S]*"counts": counts/,
  'Rust Zotero sync must return frontend-ready skipped sync state',
)
assert.match(
  serviceSource,
  /references_zotero_sync_persist_with_account/,
  'Zotero sync service must remain the thin bridge to the Rust account command',
)

const syncSource = extractActionSource(storeSource, 'syncZoteroNow')
assert.match(
  syncSource,
  /const syncState = result \|\| \{\}/,
  'syncZoteroNow must consume Rust-returned sync state directly',
)
assert.match(
  syncSource,
  /this\.zoteroSyncStatus = syncState\.zoteroSyncStatus[\s\S]*this\.zoteroSyncLastSyncTime = syncState\.zoteroSyncLastSyncTime/,
  'syncZoteroNow must use Rust-returned sync status and last-sync timestamp',
)
assert.match(
  syncSource,
  /return syncState\.counts/,
  'syncZoteroNow must use Rust-returned count object',
)
assert.doesNotMatch(
  syncSource,
  /buildReferenceZoteroSyncResultState|Number\(result\?\.(?:imported|linked|updated) \|\| 0\)|result\?\.skipped === true|this\.zoteroSyncStatus = 'synced'|this\.zoteroSyncStatus = 'disconnected'|new Date\(\)\.toISOString\(\)|fallbackLastSyncTime/,
  'syncZoteroNow must not duplicate Zotero result classification or count normalization inline',
)

console.log(JSON.stringify({
  ok: true,
  summary: {
    rustZoteroSyncResultState: true,
    zoteroSyncBridgeRemainsThin: true,
    storeAvoidsZoteroResultClassification: true,
  },
}, null, 2))
