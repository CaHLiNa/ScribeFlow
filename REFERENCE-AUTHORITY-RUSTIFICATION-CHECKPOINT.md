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
| `references_backend.rs` | Workspace library load/write, storage roots, asset store/rename and PDF asset target resolution. |
| `references_mutation.rs` | Add/update/remove, collection mutations, import merge, PDF import, document-reference ids, duplicate policy and Zotero push marking. |
| `references_query.rs` | Query resolution, collection/tag matching, sorting, citation usage index and details. |
| `references_import.rs` | Reference import parsing, import DTO normalization, and export target resolution/count reporting. |
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
| Reference lookup/selection targets | `resolveReferenceByKey`, `resolveReferenceById`, `hasReferenceById`, `resolveReferenceSelectionId` | Rust query commands should validate target ids and return normalized target state or clear errors. Citation-format target lookup has moved to `references_citation.rs`; export target resolution has moved to `references_import.rs`; metadata refresh target lookup has moved to `references_runtime.rs`. |
| Import input preflight | None | Rust mutation now owns non-array/empty import intent fallback and the empty import result shape. |
| Mutation target preflight | None for remove-reference target and Zotero delete side-effect gating | Rust mutation result now returns removed target state, `removedReference`, `zoteroDeleteReference`, removed flag and preferred selection without JS performing canonical lookup. |
| PDF import and assets | None for metadata refresh, PDF asset attach/rename, and PDF import target/result shaping | Rust now owns metadata refresh target lookup, PDF asset attach/rename target resolution, PDF import target/result shaping, and post-mutation selected reference for those flows. |
| Zotero sync result | None for skipped/success result classification | Rust now owns sync counts, skipped state, selected id, last-sync timestamp and skipped/success result classification. JS still owns local error presentation classification for thrown failures. |
| Document-reference selection | `resolveDocumentReferenceSelections`, `resolveDocumentReferenceIds`, `resolveDocumentReferences`, `resolveDocumentReferenceByKey`, `isReferenceSelectedForDocument`, `resolveAvailableDocumentReferences` | Rust mutation now owns TeX path normalization, selected id list pruning, dedupe, add/remove duplicate guards and changed gating. Query/search availability helpers still need Rust-owned lookup/search contracts. |
| Search and filtering | `searchReferences` | Rust query should own search matching once search participates in reference truth, citation insertion, or workspace-scale behavior. |

## Migration Priority

1. Mutation/import result contract
   - Status: import/add/update/remove/collection/document-reference/toggle
     outcomes are migrated. Rust now returns imported count, reused-existing
     state, changed/removed/toggled flags, collection payloads,
     selected-reference payloads and preferred selection hints, and JS consumes
     the returned `mutation.result` directly.
   - Remaining: add Rust-owned target/preflight DTOs for import preflight and
     remove target side effects.
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

2a. Export target authority
   - Status: BibTeX and JSON export target resolution now live in
     `references_import.rs`. The store passes the current references snapshot
     plus `referenceIds` or `referenceId` through `src/services/references/bibtexExport.js`,
     and Rust owns ordered id filtering, JSON target validation, missing-id
     handling and exported-count reporting.
   - Remaining: keep export serialization and target validation in Rust when
     adding future export formats.

3. PDF asset and PDF import authority
   - Status: PDF asset attach/rename target lookup now lives in
     `references_backend.rs`. The store passes the current references snapshot
     plus `referenceId` through `src/services/references/referenceAssets.js`,
     and Rust resolves the target before doing filesystem asset store/rename.
     PDF import target/result shaping now lives in Rust too:
     `references_mutation_apply(importPdfReference)` returns the imported
     snapshot, selected id, selected reference payload and preferred selection;
     `importReferencePdf()` then passes the imported snapshot plus selected id
     to `references_asset_store`, so the asset target lookup also stays in Rust.
   - Remaining: keep extending Rust-owned import/PDF contracts when adding
     richer PDF metadata extraction or attachment outcomes.
   - JS store keeps dialog orchestration and loading/error UI only.
   - Probes now catch JS import target/result derivation and asset target lookup
     regressions.

4. Zotero result and error authority
   - Status: Rust now returns normalized skipped/success sync status, counts,
     timestamp, selected id and snapshot. JS store records the returned UI state
     and applies snapshots without classifying sync semantics.
   - Remaining: thrown error classification still lives in JS presentation code;
     move canonical error type into Rust if error handling becomes part of the
     reference authority contract.

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
- Generic mutation result shaping, citation-format target lookup, metadata
  refresh target lookup, remove target/Zotero delete side-effect gating,
  document-reference mutation derivation, import input preflight,
  export target validation, PDF asset attach/rename
  target resolution, PDF import target/result shaping and Zotero
  skipped/success result classification have moved to Rust.
- Query/search/document-reference lookup helpers are next because Rust
  already has `references_query.rs` and mutation support for the same canonical
  concepts.
- UI dock/sidebar helpers are lower risk and can remain while they stay
  presentation-only.
