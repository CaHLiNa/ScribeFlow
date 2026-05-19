# Reference Authority Rustification Checkpoint

Snapshot date: 2026-05-19.

## Purpose

This checkpoint resets the reference cleanup direction to Rust-first.

`src/domains/references/referenceStoreState.js` started as an inventory of
frontend-derived rules and has now been split so it only keeps UI state/display
helpers. Rust-returned query DTO readers live in
`src/domains/references/referenceResolvedQueryDto.js`; they must remain readers
of Rust-built lookup/search DTOs, not a new frontend query authority. Future
reference work should move canonical rules toward `src-tauri/src` unless the
rule is clearly UI-only.

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
| `references_runtime.rs` | Reference command/runtime glue, metadata refresh target lookup, and generated BibTeX document-reference target resolution. |
| `references_citation.rs` | Citation render command normalization plus `referenceId` target lookup from the current reference snapshot. |
| `references_zotero.rs` | Zotero sync and remote library flow. |
| `references_zotero_account.rs` | Zotero account, config and secret handling. |

## Helper Inventory

The current frontend reference helpers fall into three buckets.

### Keep As JS UI Helpers

These helpers can remain in JS while they only shape UI state, tabs, transient
selection, or presentation affordances:

| Area | Helpers | Boundary |
| --- | --- | --- |
| Citation UI display | `resolveReferenceCitationUsageKeys` | Converts a Rust query result into a Set for UI highlighting only. |
| PDF dock UI | `buildReferenceDockPdfOpenState`, `buildReferenceDockPdfCloseState`, `buildReferenceDockPdfResetState`, `isReferenceDockPdfSelected`, `buildReferenceDockPdfSnapshotState` | May own tab open/close/fallback UI state only. Reference existence should come from Rust-normalized snapshots. |
| Sidebar UI selection | Store-local raw intent fields plus mutually-exclusive UI filter clearing | JS may record user intent and clear incompatible filters. Canonical section/source/collection/tag/sort validity comes from Rust query output. |

### Transitional DTO And Bridge Helpers

These helpers may stay temporarily as compatibility or empty-state adapters, but
should shrink as Rust APIs return complete state:

| Area | Helpers | Exit condition |
| --- | --- | --- |
| Query DTO readers | `referenceResolvedQueryDto.js`: `resolveReferenceResolvedQueryState`, `buildReferenceQuerySelectionState`, lookup/document-reference readers | Rust query returns the complete resolved-query DTO; JS only accepts returned lookup/document-reference DTOs and maps query fields back to store selection state for existing synchronous editor APIs. It must not fall back to previous Pinia query state, current selected-reference id, filtered-row selection, or frontend search filtering. |
| Store bootstrap UI state | `buildReferenceStoreInitialState` | Synchronous JS helper now only returns an empty Pinia UI shell. `references_store_state_build` returns canonical library/source defaults, normalized snapshot fields and initial query DTOs. |
| Snapshot apply bridge | `applyLibrarySnapshot()` orchestration plus PDF dock UI reconciliation | Raw snapshot normalization and selection/filter hydration now go through `references_store_state_build`; JS keeps only field assignment, loading/error orchestration and PDF dock UI state. |
| Library snapshot write DTO | None | `references_snapshot_payload_build` now builds and normalizes persisted snapshot payloads from store state in Rust; JS keeps only a thin service call. |
| Store seed internals | None | Deleted; initial query state is not synthesized in JS. |
| Citation style display fallback | `resolveReferenceCitationStyleId`, `resolveReferenceWorkspaceCitationStyles` | Keep only if it remains a UI fallback around a Rust-normalized style registry result. |

### Migrate To Rust Runtime

These helpers encode canonical matching, mutation, import, result, asset,
Zotero, search, or snapshot policy and should move back to Rust contracts:

| Area | Helpers | Rust target |
| --- | --- | --- |
| Canonical key normalization | None | `references_query.rs` owns sidebar/sort query validity, cleanup uses Rust snapshot/query normalization, and JS no longer keeps collection/tag/sort/default-query normalization helpers. |
| Reference lookup/selection targets | None for store row selection validation | Rust query now returns selected reference, collection/tag targets and reference lookup maps; citation-format target lookup has moved to `references_citation.rs`; export target resolution has moved to `references_import.rs`; metadata refresh target lookup has moved to `references_runtime.rs`. Store row selection uses Rust-returned lookup DTOs for immediate UI affordance, then reconciles through Rust query. |
| Import input preflight | None | Rust mutation now owns non-array/empty import intent fallback and the empty import result shape. |
| Mutation target preflight | None for remove-reference target and Zotero delete side-effect gating | Rust mutation result now returns removed target state, `removedReference`, `zoteroDeleteReference`, removed flag and preferred selection without JS performing canonical lookup. |
| PDF import and assets | None for metadata refresh, PDF asset attach/rename, and PDF import target/result shaping | Rust now owns metadata refresh target lookup, PDF asset attach/rename target resolution, PDF import target/result shaping, and post-mutation selected reference for those flows. |
| Zotero sync result | None for skipped/success result classification | Rust now owns sync counts, skipped state, selected id, last-sync timestamp and skipped/success result classification. JS still owns local error presentation classification for thrown failures. |
| Document-reference selection | `resolveDocumentReferenceSelections` | Rust mutation owns TeX path normalization, selected id list pruning, dedupe, add/remove duplicate guards and changed gating. Rust query now returns document-reference selected ids/references/key lookup and available-reference targets, and generated BibTeX sync resolves selected document references in Rust before writing `.bib`; JS helpers only adapt the Rust DTO for existing synchronous editor APIs. |
| Search and filtering | None | Rust query now owns reference search filtering, document selected-reference DTOs, document available-reference search filtering and lookup maps through `references_query_search`; JS only requests async search DTOs and renders returned results. |

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
     Generated document `.bib` sync now also resolves TeX document-reference
     targets in Rust: `syncBibFileForTex()` passes the current snapshot and
     `documentReferenceSelections` to `references_write_bib_file`, which filters
     selected references before writing.
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
   - Status: sidebar/sort selection validity now comes from
     `references_query_resolve`; raw snapshot apply and bootstrap state assembly
     now come from `references_store_state_build`. Cleanup resets through the
     same Rust state-builder path, JS no longer builds default resolved-query
     DTOs, and persisted snapshot payload assembly now goes through
     `references_snapshot_payload_build`. The remaining lifecycle cleanup area
     is the small JS assignment adapter around the Rust-built state.

6. Shrink `referenceStoreState.js`
   - Status: query/document-reference lookup DTO readers moved to
     `referenceResolvedQueryDto.js`; `referenceStoreState.js` keeps only UI
     state/display helpers and the initial Pinia UI shell. The DTO reader no
     longer falls back to prior Pinia state, current selected-reference id, or
     the first filtered row when Rust does not return those fields.
     Search filtering has moved to `references_query_search`, and CitationPalette
     plus DocumentReferencesPanel consume async Rust search DTOs. DocumentReferencesPanel
     now also gets selected document references and missing-citation library links
     from the Rust search DTO instead of synchronous store DTO readers.
     The extra `hasReferenceById` query DTO helper is gone; PDF dock stale-tab
     pruning uses the Rust-normalized snapshot in the UI dock helper instead of
     `referenceLookup.byId`.
     The `resolveSelectedReference` DTO wrapper is gone too; the store consumes
     Rust's returned `selectedReference` field directly.
     The exact-id `resolveReferenceById` DTO reader is gone too; `selectReference`
     now stores raw selection intent and waits for Rust query normalization.
   - Remaining: keep shrinking or deleting transitional DTO readers as callers
     move to async Rust query APIs or Rust returns more UI-ready command results.
   - Probes now guard both that `referenceStoreState.js` cannot regain query
     DTO readers and that `referenceResolvedQueryDto.js` cannot reconstruct
     search haystacks, scan canonical reference arrays, or filter search
     results.

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

- `referenceStoreState.js` is now UI-only, but transitional Rust query lookup
  DTO readers still exist in `referenceResolvedQueryDto.js` for synchronous
  editor and citation APIs. The exact-id presence/helper lookup path has been
  removed from that DTO layer, and selected-reference access no longer has a DTO
  wrapper.
- Generic mutation result shaping, citation-format target lookup, metadata
  refresh target lookup, remove target/Zotero delete side-effect gating,
  document-reference mutation derivation, import input preflight,
  export target validation, PDF asset attach/rename
  target resolution, generated `.bib` document target resolution, PDF import
  target/result shaping and Zotero
  skipped/success result classification have moved to Rust.
- Remaining query work is now narrower: selection-id UI affordances and
  returned-query DTO mapping are explicitly isolated as DTO readers without
  stale store-state, filtered-row fallback, or frontend search filtering, but
  should keep shrinking as synchronous editor/citation APIs become
  Rust-query-backed. Initial store shell is UI-only; canonical defaults and
  query DTOs now come from `references_store_state_build`.
- UI dock/sidebar helpers are lower risk and can remain while they stay
  presentation-only.
