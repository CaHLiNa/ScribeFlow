# AI Codex Phase 1 Runtime Audit

Date: 2026-04-18
Status: Active implementation baseline
Related master plan: `plan/2026-04-18-codex-desktop-replication-master-plan.md`

## Purpose

This document starts Phase 1 of the Codex Desktop replication effort.

Its job is to make two things explicit:

1. which parts of the current Altals AI stack are already Rust-owned
2. which parts still live in frontend JavaScript but should be migrated into Rust

This is a runtime ownership document, not a UI redesign document.

## Core rule

AI runtime behavior should be Rust-owned.

Frontend code may keep:

- rendering
- user intent emission
- small local input helpers
- panel-local visual state

Frontend code should not remain the long-term home for:

- runtime orchestration
- session state machines
- provider/runtime branching
- permission and plan flow coordination
- message shaping logic that depends on runtime semantics
- thread synchronization logic

## Current ownership map

### Rust-owned today

The backend already owns a meaningful part of the AI system:

- provider config loading and saving
- provider state resolution
- provider model listing
- skill catalog loading and support-file handling
- agent prompt construction
- agent prepare step
- agent run step
- local session mutation helpers
- agent session start/apply/complete/fail/finalize helpers
- session overlay persistence
- runtime-thread-to-session reconciliation
- runtime thread read and interrupt
- approvals, ask-user, exit-plan, plan-mode, and runtime event protocol
- tool catalog resolution
- attachment record creation

Primary backend files:

- `src-tauri/src/ai_agent_prepare.rs`
- `src-tauri/src/ai_agent_prompt.rs`
- `src-tauri/src/ai_agent_run.rs`
- `src-tauri/src/ai_agent_session_runtime.rs`
- `src-tauri/src/ai_session_local_runtime.rs`
- `src-tauri/src/ai_session_storage.rs`
- `src-tauri/src/ai_runtime_thread_client.rs`
- `src-tauri/src/ai_runtime_session_rail.rs`
- `src-tauri/src/ai_tool_catalog.rs`
- `src-tauri/src/ai_skill_catalog.rs`
- `src-tauri/src/ai_attachment_runtime.rs`
- `src-tauri/src/codex_runtime/*`

### Frontend-owned today

The frontend still owns too much runtime coordination inside:

- `src/stores/ai.js`
- `src/domains/ai/aiSessionRuntime.js`
- `src/domains/ai/aiConversationRuntime.js`

These files currently contain a mix of UI glue and runtime behavior.

## Current frontend AI code by category

### A. UI-only or mostly UI-only

These can remain in frontend code for now:

- `src/domains/ai/aiMentionRuntime.js`
  - composer token detection
  - suggestion filtering
  - insertion helpers
- view-only getters in `src/stores/ai.js`
  - current session selectors
  - current attachment/artifact selection
  - panel-readable derived state
- toast display and component event wiring

These are acceptable frontend responsibilities because they do not define the runtime contract.

### B. Borderline: currently frontend, should shrink over time

These can stay temporarily, but should move or be minimized:

- `src/domains/ai/aiContextRuntime.js`
  - context normalization is partly UI-adjacent
  - eligibility and runtime-facing context policy should eventually live in Rust
- `src/domains/ai/aiArtifactRuntime.js`
  - simple text patching is local and deterministic
  - artifact application semantics should still be defined by Rust
- model selector aggregation in `src/stores/ai.js`
  - acceptable as temporary UI glue
  - provider/model switching semantics should remain Rust-first

### C. Should be migrated to Rust

These are the main Phase 1 targets.

#### 1. Session record shaping

Current frontend ownership:

- `src/domains/ai/aiSessionRuntime.js`
- `createAiSessionRecord`
- `ensureAiSessionsState`
- `updateAiSessionRecord`
- `deriveAiSessionTitle`
- permission mode normalization

Why this should move:

- session schema is runtime contract
- session normalization should not diverge between Rust and JS
- title derivation and mode normalization affect persisted agent behavior

Target:

- Rust becomes the canonical session shaper
- frontend receives normalized session records only

#### 2. Conversation/message shaping

Current frontend ownership:

- `src/domains/ai/aiConversationRuntime.js`
- user message construction
- pending assistant message construction
- assistant message construction
- tool-part merge logic
- provider summary shaping

Why this should move:

- message structure is runtime-facing state
- tool/result merging is part of runtime protocol interpretation
- frontend should render message parts, not define the message contract

Target:

- Rust emits normalized conversation items
- frontend renders them without reconstructing runtime meaning

#### 3. Main run orchestration

Current frontend ownership:

- `src/stores/ai.js`
- `runActiveSkill()`
- `shouldUseCodexRuntimeRun()`
- thread creation sequencing
- prompt/build/run branching
- result completion/failure/finalization choreography

Why this should move:

- this is the runtime control path
- provider/runtime branching in the store creates split-brain architecture
- Codex-like runtime orchestration should be backend-owned

Target:

- one Rust command starts and coordinates a turn
- frontend sends intent and observes state

#### 4. Interrupt/stop handling

Current frontend ownership:

- `src/stores/ai.js`
- `stopCurrentRun()`
- `resolveRuntimeTurnHandle()`
- `runtimeAbortControllers`

Why this should move:

- stop semantics are runtime semantics
- the current store still tracks runtime handles and local abort state
- backend should own authoritative interrupt state

Target:

- Rust owns turn handle lookup and interrupt transitions
- frontend sends one stop intent only

#### 5. Runtime event routing

Current frontend ownership:

- `src/stores/ai.js`
- `handleCodexRuntimeEvent()`
- event-type branching
- thread/session matching
- turn-start synchronization
- session patch application from runtime events

Why this should move:

- runtime event interpretation belongs to the runtime layer
- frontend should not decode protocol-level event semantics

Target:

- Rust maps runtime events directly into session snapshots or incremental UI-ready updates
- frontend consumes normalized events

#### 6. Approval / ask-user / exit-plan routing logic

Current frontend ownership:

- request lookup across sessions
- runtimeManaged branching
- request queue/clear helpers
- response dispatch coordination

Why this should move:

- approval flow is core runtime behavior
- frontend should show requests and submit user decisions, not orchestrate queue semantics

Target:

- Rust owns request lifecycle
- frontend reads current pending request state from session/runtime snapshot

#### 7. Background task / compaction / plan state mutation helpers

Current frontend ownership:

- `queueAskUserRequest`
- `queueExitPlanRequest`
- `queuePermissionRequest`
- `setPlanModeState`
- `setWaitingResumeState`
- `setCompactionState`
- `upsertBackgroundTask`
- `clearBackgroundTask`

Why this should move:

- these are runtime state-machine transitions
- they should not be hand-authored from frontend helper functions

Target:

- Rust emits these states as part of the session or runtime snapshot

## Runtime parity checklist

### Session contract

- Rust is canonical session schema owner: partial
- Frontend only renders normalized sessions: no
- Session title derivation centralized in Rust: partial
- Session persistence and restore in Rust: yes

### Conversation contract

- Rust is canonical message schema owner: partial
- Tool/result merge semantics owned by Rust: partial
- Frontend reconstructs runtime meaning: yes, still too much

### Turn lifecycle

- Prepare step in Rust: yes
- Prompt build in Rust: yes
- Run dispatch in Rust: partial
- Final lifecycle orchestration fully in Rust: no
- Interrupt lifecycle fully in Rust: no

### Runtime event handling

- Runtime protocol emitted from Rust: yes
- Event interpretation centralized in Rust: partial
- Frontend directly branches on event types: yes

### Approval and planning

- Approval protocol in Rust: yes
- Approval lifecycle fully Rust-owned: partial
- Plan mode state in Rust: yes
- Frontend approval/plan routing still stateful: yes

### Tool contract

- Tool catalog resolution in Rust: yes
- Tool events merge in Rust: yes
- Frontend still owns some tool-facing coordination: yes

### Extension model

- Skills catalog in Rust: yes
- MCP parity present: no
- Codex-like extension boundary complete: no

## Required migration order

### Wave 1: Move orchestration spine into Rust

Highest priority:

- replace `runActiveSkill()` orchestration with one Rust-owned turn-run command
- move interrupt resolution and turn-handle lookup into Rust
- stop storing authoritative runtime handles in `runtimeAbortControllers`

Expected outcome:

- the store becomes a caller of Rust runtime commands, not the conductor

### Wave 2: Move session/message shaping into Rust

Tasks:

- fold `aiSessionRuntime.js` normalization into Rust
- fold `aiConversationRuntime.js` message shaping into Rust
- treat frontend message rendering as a pure view layer

Expected outcome:

- one canonical session/message schema exists

### Wave 3: Move request lifecycle state into Rust

Tasks:

- queue/clear logic for permission, ask-user, exit-plan, background task, compaction, and waiting-resume should come from Rust snapshots
- remove frontend-authored runtime queue semantics

Expected outcome:

- the UI only submits user decisions and renders current runtime state

### Wave 4: Shrink frontend AI helpers to UI glue

Tasks:

- keep mention/composer suggestion helpers local
- keep local visual helpers only
- audit remaining AI code in `src/stores/ai.js` and split UI-only logic from runtime logic

Expected outcome:

- frontend AI code becomes mostly presentation and intent glue

## Files to target first

### Rust

- `src-tauri/src/ai_agent_session_runtime.rs`
- `src-tauri/src/ai_runtime_thread_client.rs`
- `src-tauri/src/ai_session_local_runtime.rs`
- `src-tauri/src/codex_runtime/mod.rs`
- `src-tauri/src/codex_runtime/events.rs`
- `src-tauri/src/codex_runtime/threads.rs`
- `src-tauri/src/codex_runtime/turns.rs`
- `src-tauri/src/codex_runtime/approvals.rs`

### Frontend

- `src/stores/ai.js`
- `src/domains/ai/aiSessionRuntime.js`
- `src/domains/ai/aiConversationRuntime.js`

## Phase 1 completion standard

Phase 1 is complete when:

- a new AI turn can be started without frontend orchestration logic deciding the runtime path
- stop/interrupt no longer depends on frontend-owned runtime handle logic
- session and message normalization are Rust-owned
- approval and plan-mode request lifecycle is backend-owned
- frontend AI code is mostly reduced to rendering, input helpers, and intent dispatch

## Immediate next slice

The first implementation slice after this audit should be:

1. design one Rust-owned turn orchestration command
2. reduce `runActiveSkill()` to input collection plus one backend call
3. move stop/interrupt handle resolution behind Rust

This is the highest leverage change because it breaks the current split-brain architecture at the runtime spine.
