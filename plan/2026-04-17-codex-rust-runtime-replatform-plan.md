# Codex Rust Runtime Replatform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Altals’s current JS-centric AI orchestration with a Rust-native Codex-style runtime core that owns threads, turns, items, tools, approvals, skills, and runtime event streaming.

**Architecture:** Introduce a new Rust runtime subsystem under `src-tauri/src/codex_runtime/` that mirrors the Codex app-server mental model but is embedded directly into Altals’s Tauri backend. The Vue frontend becomes a thin client over Tauri commands and emitted runtime notifications, while existing JS orchestration code is progressively retired behind compatibility shims until the migration is complete.

**Tech Stack:** Rust, Tauri 2, Tokio, Serde, existing Altals Vue/Pinia frontend, Codex reference repo as architecture/implementation source material

---

## Summary

This replatform is a bottom-up rewrite of the AI runtime, not a UI refresh. The implementation should shift ownership of conversation state, turn execution, approval requests, task progress, tool invocation, and skill metadata from the frontend into Rust. The migration should happen in slices, but every slice must move the center of gravity toward a Codex-style runtime instead of adding more JS glue.

## Target Runtime Shape

### Rust-owned core
- Add a new `src-tauri/src/codex_runtime/` module family with focused files:
  - `mod.rs`: public entry points and re-exports
  - `protocol.rs`: thread/turn/item ids, request/response/event payload types
  - `state.rs`: top-level runtime state container
  - `threads.rs`: thread lifecycle, current-thread lookup, archive/read/list primitives
  - `turns.rs`: turn start/interrupt/complete state machine
  - `items.rs`: persistent model-visible history items
  - `events.rs`: normalized event emission helpers for Tauri
  - `approvals.rs`: approval policy, pending approval state, resolution flow
  - `skills.rs`: Codex-style skill discovery and metadata normalization
  - `tools.rs`: Rust-native tool registry and execution adapter
  - `providers.rs`: model/provider abstraction and streaming bridge
  - `storage.rs`: thread persistence and runtime restoration

### Frontend role after migration
- The frontend keeps rendering:
  - thread list
  - transcript
  - banners for approval / ask-user / exit-plan / compaction / tasks
  - composer and attachments
- The frontend stops owning:
  - canonical session state
  - turn lifecycle
  - tool loop orchestration
  - provider event semantics
  - prompt-mode state machines that should live in Rust

### Compatibility boundary
- Keep current UI surfaces operational during the migration.
- Add compatibility functions in JS that call new Tauri runtime commands first, then fall back only where the Rust path is not yet implemented.
- Delete old JS runtime seams only after equivalent Rust-backed behavior is verified.

## Implementation Changes

### Phase 1: Establish Rust runtime foundation

**Files:**
- Create: `src-tauri/src/codex_runtime/mod.rs`
- Create: `src-tauri/src/codex_runtime/protocol.rs`
- Create: `src-tauri/src/codex_runtime/state.rs`
- Create: `src-tauri/src/codex_runtime/events.rs`
- Create: `src-tauri/src/codex_runtime/threads.rs`
- Create: `src-tauri/src/codex_runtime/turns.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] Define core Rust entities:
  - `RuntimeThreadId`, `RuntimeTurnId`, `RuntimeItemId`
  - `RuntimeThread`, `RuntimeTurn`, `RuntimeItem`
  - `ThreadStatus`, `TurnStatus`, `ItemKind`
- [ ] Add a global runtime state store managed by Tauri:
  - loaded threads
  - active turn per thread
  - pending approvals
  - active background tasks
- [ ] Add normalized Tauri event payloads for:
  - thread started/updated
  - turn started/completed/interrupted
  - item started/completed/delta
  - approval requested/resolved
  - task progress/finished
  - plan delta / reasoning summary delta
- [ ] Register foundation commands in `src-tauri/src/lib.rs`:
  - `runtime_thread_start`
  - `runtime_thread_list`
  - `runtime_thread_read`
  - `runtime_turn_start`
  - `runtime_turn_interrupt`
- [ ] Keep first slice in-memory only if needed, but shape APIs for later persistence so the frontend contract does not change again.

### Phase 2: Move provider execution and streaming semantics into Rust

**Files:**
- Create: `src-tauri/src/codex_runtime/providers.rs`
- Create: `src-tauri/src/codex_runtime/streaming.rs`
- Modify: `src-tauri/src/network.rs`
- Modify: `src-tauri/src/ai_runtime.rs`
- Modify: `src/services/ai/runtime/providerRuntime.js`

- [ ] Add a Rust-side provider runner abstraction that can drive:
  - OpenAI-compatible HTTP/SSE
  - Anthropic HTTP/SSE
  - Anthropic SDK bridge path as a provider implementation detail
- [ ] Normalize streamed provider output into runtime events rather than raw provider chunks.
- [ ] Move tool-call round orchestration to Rust for providers that support tool use.
- [ ] Keep JS provider runtime only as a temporary bridge layer until the panel reads Rust runtime events directly.
- [ ] Preserve current Anthropic SDK bridge temporarily, but hide it behind the new Rust runtime provider trait instead of exposing it as a special UI path.

### Phase 3: Rebuild approvals, ask-user, and plan mode as backend state machines

**Files:**
- Create: `src-tauri/src/codex_runtime/approvals.rs`
- Create: `src-tauri/src/codex_runtime/collaboration.rs`
- Modify: `src-tauri/src/ai_runtime.rs`
- Modify: `src/stores/ai.js`
- Modify: `src/components/panel/AiAgentPanel.vue`

- [ ] Define explicit approval policy types in Rust:
  - approval policy
  - sandbox policy
  - permission mode
  - reviewer mode
- [ ] Represent pending approval, ask-user, exit-plan, compacting, and waiting-resume as Rust-owned runtime records.
- [ ] Expose Tauri commands to resolve those records from the UI.
- [ ] Make the frontend banners render backend state instead of patching local session objects.
- [ ] Add plan/default collaboration mode configuration to runtime startup and turn-start payloads.

### Phase 4: Make skills Codex-compatible

**Files:**
- Create: `src-tauri/src/codex_runtime/skills.rs`
- Modify: `src/services/ai/skillDiscovery.js`
- Modify: `src/services/ai/skillRegistry.js`
- Modify: `src/components/panel/AiAgentPanel.vue`
- Test: `tests/aiSkillDiscovery.test.mjs`

- [ ] Expand discovery roots to include real Codex-compatible directories:
  - `~/.codex/skills`
  - `<repo>/.codex/skills`
  - optional repo/user/system scopes as Altals-compatible extensions
- [ ] Add richer skill metadata:
  - scope
  - enabled state
  - parse/load errors
  - dependency metadata
  - interface metadata if available
- [ ] Prefer Rust as the source of truth for discovered skill metadata, with JS only rendering what Rust reports.
- [ ] Preserve Altals-managed skill roots as additional sources, not the primary contract.

### Phase 5: Replace frontend session ownership with runtime-backed threads

**Files:**
- Modify: `src/stores/ai.js`
- Modify: `src/services/ai/agentOrchestrator.js`
- Modify: `src/services/ai/executor.js`
- Modify: `src/components/panel/AiSessionRail.vue`
- Modify: `src/components/panel/AiAgentPanel.vue`

- [ ] Replace local “session” semantics with runtime-backed thread semantics:
  - create thread
  - list threads
  - resume thread
  - fork thread
  - archive/unarchive thread
- [ ] Move canonical transcript/history storage out of Pinia and into the Rust runtime.
- [ ] Convert composer submission to `turn_start` over Tauri, not direct executor invocation.
- [ ] Make local Pinia state a cache/view-model over runtime snapshots rather than the system of record.

### Phase 6: Move tools and file effects behind Rust-owned execution

**Files:**
- Create: `src-tauri/src/codex_runtime/tools.rs`
- Create: `src-tauri/src/codex_runtime/workspace_tools.rs`
- Modify: `src/services/ai/toolRegistry.js`
- Modify: `src/services/ai/runtime/toolLoop.js`
- Modify: `src/stores/ai.js`

- [ ] Introduce a Rust-side tool registry for workspace/file/document operations.
- [ ] Normalize tool descriptors and invocation payloads so frontend and provider layers stop inventing parallel schemas.
- [ ] Route file read/write/open/delete and active-document/selection/reference tools through a unified runtime adapter.
- [ ] Retire the JS tool loop once Rust can execute and emit tool lifecycle events directly.

### Phase 7: Add persistence and recovery

**Files:**
- Create: `src-tauri/src/codex_runtime/storage.rs`
- Modify: `src-tauri/src/app_dirs.rs`
- Modify: `src/services/ai/sessionPersistence.js`
- Modify: `src/stores/ai.js`

- [ ] Persist threads, turns, and runtime-visible items under Altals-managed app storage.
- [ ] Restore threads on app or workspace reopen.
- [ ] Add archive/read/list behavior consistent with the new runtime model.
- [ ] Keep workspace-scoped restoration behavior for Altals, but do not couple core runtime semantics to Pinia serialization.

### Phase 8: Remove obsolete JS runtime seams

**Files:**
- Modify/Delete: `src/services/ai/runtime/providerRuntime.js`
- Modify/Delete: `src/services/ai/runtime/toolLoop.js`
- Modify/Delete: `src/services/ai/agentOrchestrator.js`
- Modify/Delete: `src/services/ai/executor.js`
- Modify: `src/stores/ai.js`
- Modify: related tests under `tests/ai*.test.mjs`

- [ ] Remove frontend ownership over provider loop orchestration.
- [ ] Remove duplicated JS-only runtime state that is now emitted by Rust.
- [ ] Keep only frontend adapter code needed to call Tauri commands and map Tauri events into reactive UI state.

## Testing and Verification

- Rust unit tests for:
  - thread/turn/item state transitions
  - approval state handling
  - skill discovery normalization
  - runtime event serialization
- Existing JS tests should be migrated or replaced where ownership moves into Rust.
- Minimum verification per substantial slice:
  - targeted `cargo test` for the touched runtime modules
  - targeted `node --test` for affected frontend adapters/stores
  - `npm run build` after meaningful frontend integration changes
  - `cargo build --manifest-path src-tauri/Cargo.toml` after meaningful Rust integration changes

## Assumptions and Defaults

- The goal is architectural parity with Codex runtime semantics, not a line-for-line transplant of the entire Codex repository.
- Direct code reuse from Codex should be selective and attribution-safe; prefer porting core concepts and small implementation slices over dropping in unrelated CLI/app-server surface area wholesale.
- The right sidebar remains the initial client surface during migration, but it should behave like a runtime client instead of a JS-owned orchestrator.
- Existing dirty frontend AI changes in the worktree should be preserved unless they directly block the Rust runtime migration.
