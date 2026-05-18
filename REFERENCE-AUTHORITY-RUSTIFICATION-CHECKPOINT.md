# Reference Authority Rustification Checkpoint

Snapshot date: 2026-05-18.

## Purpose

This checkpoint resets the reference cleanup direction to Rust-first.

`src/domains/references/referenceStoreState.js` is now treated as an inventory of
frontend-derived rules that must be split deliberately. It is not the default
destination for more reference behavior. Future reference work should move
canonical rules toward `src-tauri/src` unless the rule is clearly UI-only.

## Rust-first Contract

Rust runtime owns:

- reference truth and snapshot normalization
- filesystem and workspace-scoped storage authority
- library persistence shape and cleanup
- mutation acceptance, merge, dedupe, and result normalization
- import, PDF metadata/PDF asset, and Zotero sync authority
- citation rendering targets and render output normalization
- document-reference id pruning and mutation semantics

JavaScript owns:

- Vue rendering, form drafts, transient UI layout, and interaction state
- Pinia loading/error lifecycle and short-term screen coordination
- `src/services` Tauri bridge wrappers and DTO compatibility adapters
- UI-only presentation helpers, labels, local selection affordances, and dock/tab
  state that does not decide persisted reference truth

## Existing Rust Authority Surface

| Rust module | Current authority |
| --- | --- |
| `references_snapshot.rs` | Canonical snapshot/reference normalization and persisted snapshot cleanup. |
| `references_backend.rs` | Workspace library load/write, storage roots, asset store and rename. |
| `references_mutation.rs` | Add/update/remove, collection mutations, import merge, PDF import, document-reference ids, duplicate policy and Zotero push marking. |
| `references_query.rs` | Query resolution, collection/tag matching, sorting, citation usage index and details. |
| `references_import.rs` | Reference import parsing and import DTO normalization. |
| `references_pdf.rs` | PDF metadata/text extraction under workspace/runtime authority. |
| `references_runtime.rs` | Reference command/runtime glue. |
| `references_citation.rs` | Citation render command normalization plus `referenceId` target lookup from the current reference snapshot. |
| `references_zotero.rs` | Zotero sync and remote library flow. |
| `references_zotero_account.rs` | Zotero account, config and secret handling. |

## Helper Inventory

The current `referenceStoreState.js` helpers fall into three buckets.

### Keep As JS UI Helpers

These helpers can remain in JS while they only shape UI state, tabs, transient
selection, or presentation affordances:

| Area | Helpers | Boundary |
| --- | --- | --- |
| Citation UI display | `resolveReferenceCitationUsageKeys` | Converts a Rust query result into a Set for UI highlighting only. |
| Selected row fallback | `resolveSelectedReference` | Acceptable as a getter fallback for visible rows; must not become persistence or query authority. |
| PDF dock UI | `buildReferenceDockPdfOpenState`, `buildReferenceDockPdfCloseState`, `buildReferenceDockPdfResetState`, `isReferenceDockPdfSelected`, `buildReferenceDockPdfSnapshotState` | May own tab open/close/fallback UI state only. Reference existence should come from Rust-normalized snapshots. |
| Sidebar UI selection | `buildReferenceSectionSelectionState`, `buildReferenceSourceSelectionState`, `buildReferenceCollectionSelectionState`, `buildReferenceTagSelectionState`, `buildReferenceSortSelectionState` | Keep only as user-intent shaping. Canonical collection/tag/sort validity should come from Rust query output or normalized snapshot data. |

### Transitional DTO And Bridge Helpers

These helpers may stay temporarily as compatibility or empty-state adapters, but
should shrink as Rust APIs return complete state:

| Area | Helpers | Exit condition |
| --- | --- | --- |
| Query hydration fallback | `resolveReferenceResolvedQueryState`, `buildReferenceQuerySelectionState`, `buildDefaultResolvedQueryState` | Rust query always returns a complete resolved-query DTO; JS only maps field casing and empty UI defaults. |
| Store bootstrap UI state | `buildReferenceStoreInitialState`, `buildReferenceStoreCleanupState` | Rust-backed load/close lifecycle returns canonical library defaults; JS keeps only loading/error/Zotero UI flags. |
| Snapshot apply bridge | `buildReferenceSnapshotApplyState`, `buildReferenceSnapshotSelectionState` | Rust snapshot/query result returns normalized selection, pruned filters, and canonical document-reference selections. |
| Library snapshot write DTO | `buildReferenceLibrarySnapshotPayload` | Persisted snapshot payload is built in Rust or by a service adapter with no schema policy. |
| Store seed internals | `resolveReferenceStoreSeed`, `buildReferenceStoreResetQueryState` | Deleted once initial/cleanup/query defaults are Rust-returned. |
| Citation style display fallback | `resolveReferenceCitationStyleId`, `resolveReferenceWorkspaceCitationStyles` | Keep only if it remains a UI fallback around a Rust-normalized style registry result. |

### Migrate To Rust Runtime

These helpers encode canonical matching, mutation, import, result, asset,
Zotero, search, or snapshot policy and should move back to Rust contracts:

| Area | Helpers | Rust target |
| --- | --- | --- |
| Canonical key normalization | `normalizeCollectionMembershipValue`, `normalizeTagKey`, `normalizeReferenceSortKey`, `resolveCollection`, `resolveTag`, `resolveReferenceSectionKey` | `references_query.rs` and snapshot/query DTOs should own canonical keys and valid filter state. |
| Reference lookup/export targets | `resolveReferenceByKey`, `resolveReferenceById`, `hasReferenceById`, `resolveReferencesForExport`, `buildReferenceJsonExportTargetState`, `resolveReferenceSelectionId` | Rust query/export commands should validate target ids and return normalized target state or clear errors. Citation-format target lookup has moved to `references_citation.rs`. |
| Import input preflight | `buildReferenceEmptyImportResult`, `buildReferenceImportInputState` | Rust should eventually expose import-intent/preflight defaults if empty-state semantics stop being purely UI-local. |
| Mutation target preflight | `buildReferenceRemoveTargetState` | Rust mutation/result APIs should eventually expose enough target state for UI/Zotero side-effect gating without JS performing canonical lookup. |
| PDF import and assets | `buildReferenceMetadataRefreshTargetState`, `buildReferencePdfImportTargetState`, `buildReferencePdfImportResultState`, `buildReferencePdfAssetTargetState`, `buildReferencePdfAssetResultState` | Rust should own target validation, PDF import outcome, asset attachment/rename, and post-mutation selected reference. |
| Zotero sync result | `buildReferenceZoteroSyncResultState` | Rust should own sync counts, skipped state, selected id, last-sync timestamp and error/result classification. |
| Document-reference selection | `resolveDocumentReferenceSelections`, `resolveDocumentReferenceIds`, `resolveDocumentReferences`, `resolveDocumentReferenceByKey`, `isReferenceSelectedForDocument`, `resolveAvailableDocumentReferences`, `buildDocumentReferenceIdsMutationState`, `buildAddDocumentReferenceMutationState`, `buildRemoveDocumentReferenceMutationState` | Rust query/mutation commands should own TeX path normalization, selected id lists, dedupe and availability. |
| Search and filtering | `searchReferences` | Rust query should own search matching once search participates in reference truth, citation insertion, or workspace-scale behavior. |

## Migration Priority

1. Mutation/import result contract
   - Status: import/add/update/remove/collection/document-reference/toggle
     outcomes are migrated. Rust now returns imported count, reused-existing
     state, changed/removed/toggled flags, collection payloads,
     selected-reference payloads and preferred selection hints, and JS consumes
     the returned `mutation.result` directly.
   - Remaining: add Rust-owned target/preflight DTOs for import preflight,
     remove target side effects and PDF import/asset mutations.
   - JS store should consume returned `snapshot`, `result`,
     `preferredSelectedReferenceId` and `selectedReferenceId` without
     re-deriving changed/removed/imported flags.
   - Probes should fail if `src/stores/references.js` or
     `referenceStoreState.js` reintroduces merge, dedupe or mutation-result policy.

2. Citation/render target authority
   - Status: citation-format target validation and render-target lookup now live
     in `references_citation.rs`. The store passes `referenceId` plus the current
     `references` snapshot through `formatReferenceCitationById`, and missing
     ids preserve the previous empty-output behavior.
   - Remaining: keep citation output normalization in Rust and avoid adding
     store/domain target lookup back when future style rendering paths change.
   - Probe target: missing ids, workspace path, style fallback and rendered
     output are Rust-owned.

3. PDF asset and PDF import authority
   - Rust owns PDF import target lookup, duplicate add-or-attach decision, asset
     storage/rename target validation and returned selected reference.
   - JS store keeps dialog orchestration and loading/error UI only.
   - Existing PDF import authority probe should be extended to catch JS target
     derivation.

4. Zotero result and error authority
   - Rust returns normalized sync status, counts, timestamp, selected id, skipped
     state and categorized errors.
   - JS store records UI state and surfaces errors without classifying sync
     semantics.

5. Persisted snapshot and lifecycle defaults
   - Rust returns canonical initial, cleanup, apply-snapshot and persisted-payload
     shapes.
   - JS store keeps only view filters, loading/error flags and dock/tab state that
     has no persisted reference meaning.

6. Shrink `referenceStoreState.js`
   - Remove migrated helpers.
   - Keep only UI helpers listed above plus explicit DTO adapters when necessary.
   - Update probes so the remaining module cannot regain Rust-owned policy.

## Acceptance Criteria

For each migration slice:

- No Tauri command name or payload shape is changed without updating Rust, JS
  bridge, store call sites and probes in the same commit.
- Rust tests or focused probes cover the moved rule before the JS duplicate is
  removed.
- `npm run verify` passes before commit.
- `CURRENT-STATE.md` and this checkpoint are updated when the ownership boundary
  changes.
- Commit and push the slice with a Conventional Commit message.

## Current Gap Summary

- `referenceStoreState.js` still contains too many canonical target, query and
  selection rules for the Rust-first target.
- Generic mutation result shaping and citation-format target lookup have moved to
  Rust, but PDF import/assets, Zotero result classification and export target
  validation still duplicate Rust-owned concepts in JS.
- Query/search/document-reference presentation helpers are next because Rust
  already has `references_query.rs` and mutation support for the same canonical
  concepts.
- UI dock/sidebar helpers are lower risk and can remain while they stay
  presentation-only.
