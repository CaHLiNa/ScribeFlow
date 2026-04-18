# Codex Desktop Replication Master Plan

Date: 2026-04-18
Status: Active
Owner: Codex

## Goal

Turn the current Altals AI panel into a Codex Desktop-like agent surface.

## Current phase status

- Phase 0: complete
- Phase 1: complete
- Phase 2: complete
- Phase 3: active
- Phase 4: pending
- Phase 5: pending

Reference documents:

- runtime boundary: `docs/AI_CODEX_PHASE1_RUNTIME_AUDIT.md`
- desktop interaction plan: `docs/AI_CODEX_PHASE2_DESKTOP_PARITY_PLAN.md`
- control-state parity plan: `docs/AI_CODEX_PHASE3_CONTROL_STATE_PLAN.md`

This is not a Codex CLI UI clone. The target is:

- use Codex CLI and Codex runtime as the lower-layer behavior reference
- reproduce Codex Desktop-like interaction and information architecture in the Altals desktop shell
- remove Altals-specific AI product concepts that do not exist in Codex
- keep the result grounded in the existing Altals desktop workbench instead of spawning a second app inside the app

## Product position

The resulting AI system should feel like Codex embedded into the Altals workbench, not like an Altals sidebar assistant inspired by Codex.

The core split is:

- CLI parity decides runtime behavior, tool contract, approvals, interrupts, plan mode, and session semantics
- Desktop parity decides panel layout, composer behavior, state presentation, visual density, and task flow
- AI implementation should live in Rust wherever possible, with the frontend limited to rendering, user intent emission, and thin state binding

## Constraints

- We do not have Codex Desktop source code.
- We do have Codex CLI source code and can use it as the implementation reference for runtime behavior and protocol shape.
- We should not rewrite unrelated Altals product surfaces while doing this work.
- We should prefer deleting obsolete AI layers over preserving compatibility glue.
- AI-related product logic should not continue growing in JavaScript. New AI runtime behavior, orchestration, persistence, approvals, tool routing, and protocol adaptation should be implemented in Rust.
- The frontend may keep minimal UI glue, but it should not remain the long-term home of AI policy or runtime state machines.

## Current assessment

The current Altals AI stack is already partially migrated toward Codex:

- default agent mode no longer depends on `workspace-agent`
- the right panel now uses a more Codex-like direct task flow
- model selection is simplified
- duplicated shell metadata and redundant provider-facing UI have been reduced
- stop and session behaviors are closer to a real runtime thread model

The main remaining gap is no longer wording. The gap is product shape.

## What still differs from Codex Desktop

### 1. Surface identity

The current panel still behaves like an AI feature inside Altals settings and inspector infrastructure. Codex Desktop feels like a first-class agent surface.

### 2. Runtime protocol parity

Codex CLI exposes first-class concepts for:

- tool execution
- approvals
- plan mode
- user input requests
- background tasks
- thread/session persistence
- apply-patch and command execution contracts

Altals has part of this, but not yet as a clean and complete Codex-like contract boundary.

### 2.5. Rust ownership is incomplete

The current Altals AI stack still splits meaningful runtime behavior between Rust and frontend JavaScript. That is not the target architecture.

The target is:

- Rust owns AI runtime behavior
- Rust owns session persistence and runtime state transitions
- Rust owns provider adaptation and tool orchestration
- Rust owns approvals, interrupts, and plan/background-task state
- frontend code renders state and forwards user intents, but does not become the second runtime

### 3. MCP parity

Codex CLI has explicit MCP client support and an experimental MCP server mode. Altals does not yet expose comparable MCP behavior in the AI surface.

### 4. Desktop interaction parity

Codex Desktop-like behavior depends on:

- denser message presentation
- stronger keyboard-first operation
- clearer task lifecycle states
- better approval and plan-mode transitions
- cleaner tool/action visualization

Altals currently approximates this but does not fully match it.

### 5. Residual Altals AI management layer

Skill management, settings organization, internal naming, and some panel assumptions still reflect Altals-first design instead of Codex-first design.

## Canonical target

The canonical target after this plan:

- one Codex-like desktop agent panel inside the right-side workbench area
- direct natural-language task entry by default
- model choice available but low-emphasis
- approvals, plan mode, background tasks, and interrupts exposed as runtime states, not as side systems
- skills treated as optional extension mechanics, not as the primary front-door concept
- future MCP support integrated into the same runtime model

## Non-goals

- cloning Codex CLI terminal visuals inside the sidebar
- rebuilding Altals into a general chat app
- preserving deprecated Altals AI workflows for compatibility
- redesigning unrelated editor, references, or document workflow surfaces
- claiming full Codex Desktop parity before runtime protocol and interaction gaps are closed

## Implementation phases

### Phase 0: Canonicalize plan and remove drift

Objective:
Make this document the only active plan baseline.

Tasks:

- delete outdated plan documents in `plan/`
- keep one canonical master plan for this replication effort
- use this file as the implementation reference for future slices

Exit criteria:

- `plan/` contains only the active master plan for this effort
- no old AI migration plans remain to compete with current direction

### Phase 1: Lock the runtime contract to Codex semantics

Objective:
Make the backend and store layer behave like a Codex-style runtime, independent of UI chrome.

Tasks:

- audit current runtime thread, approval, interrupt, session, and plan-mode behavior against Codex CLI concepts
- normalize tool execution around a small set of first-class runtime events and state transitions
- keep direct agent mode as the default path
- reduce Altals-specific naming and compatibility branches in runtime-facing code
- move AI runtime ownership decisively toward Rust instead of keeping split-brain logic across Rust and frontend stores
- define which Codex CLI concepts are required now and which are deferred

Deliverables:

- a documented runtime parity checklist
- cleaned runtime state transitions for send, stop, approve, deny, plan enter, plan exit, and background task updates
- a Rust-ownership migration list for current frontend AI logic

Exit criteria:

- the runtime layer can be described in Codex-like terms without relying on Altals-only abstractions
- no default-user path requires legacy shell-action logic
- newly added AI runtime behavior lands in Rust by default

### Phase 2: Rebuild the right panel around Codex Desktop interaction

Objective:
Make the panel feel like a Codex Desktop task surface rather than an inspector with AI bolted on.

Tasks:

- refine header, session switching, composer, and bottom action area
- make the send/stop/task lifecycle feel singular and direct
- compress message density toward a more Codex-like desktop rhythm
- keep runtime state visible only where it changes user decisions
- remove remaining redundant explanatory copy and low-value badges

Deliverables:

- a simplified right-panel information architecture
- a Codex Desktop-like composer and task flow

Exit criteria:

- the panel reads as an agent workspace, not a generic chat inspector
- the primary path is: type task -> run -> observe state -> intervene only when needed

### Phase 3: Plan mode, approvals, and background task parity

Objective:
Bring higher-order agent control flows closer to Codex Desktop.

Tasks:

- tighten plan-mode entry, display, approval, and resume behavior
- unify per-tool approval and plan approval UX
- improve interruption feedback and pending-state clarity
- surface background task progress in a way that matches Codex-like task orchestration

Deliverables:

- a coherent control-state layer for approvals and planning
- cleaner transitions between active run, waiting state, plan review, and resumed execution

Exit criteria:

- approval and planning states feel like part of one runtime, not separate features
- user can always tell whether the agent is thinking, waiting, blocked, or finished

### Phase 4: Extension parity and MCP entry

Objective:
Close the biggest ecosystem gap relative to Codex.

Tasks:

- evaluate and implement MCP client support appropriate for Altals
- decide how skills and MCP should coexist in the desktop surface
- keep extensions low-emphasis unless the user explicitly needs them
- avoid turning the right panel into a tool registry browser

Deliverables:

- MCP integration design and first working slice
- extension model rules for desktop presentation

Exit criteria:

- Altals can participate in the same class of extension workflows expected from modern Codex tooling

### Phase 5: Final parity polish and removal of dead layers

Objective:
Delete the remaining Altals-first AI leftovers once the new path is stable.

Tasks:

- remove dead runtime branches, dead recommendation logic, and obsolete copy
- rename internal APIs where Altals-first names create maintenance drag
- audit settings and management pages for concepts that should be hidden, merged, or simplified
- remove or shrink frontend AI logic that should be folded into Rust-owned runtime seams
- run a final UX and behavior review focused on Codex Desktop parity

Exit criteria:

- the default AI path is structurally simple
- stale AI architecture no longer competes with the current implementation
- frontend AI code is mostly UI-only, with runtime ownership concentrated in Rust

## Order of execution

Recommended near-term order:

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 5
5. Phase 4

Reasoning:

- runtime contract comes first
- Rust ownership must be established early or the architecture will keep drifting
- UI parity without runtime clarity will create churn
- MCP matters, but it should not block the core desktop replication path

## Verification standard

Each implementation slice should verify:

- runtime state correctness
- interrupt correctness
- approval correctness
- session persistence behavior
- `npm run lint`
- `npm run build`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- one real task flow through the desktop AI panel

For UI-heavy slices, also verify:

- narrow right-sidebar layout
- default empty state
- active run state
- plan review state
- permission request state

## Open decisions

These decisions should be made explicitly during implementation, not implicitly in code drift:

- how much of Codex CLI skill exposure should remain visible in the desktop surface
- whether settings should still expose dedicated skill management at the same prominence
- how MCP should appear in a desktop-first product
- whether the session rail should stay as a custom Altals control or move closer to Codex Desktop behavior
- which remaining frontend AI modules are temporary glue versus mandatory UI-only code

## Success criteria

This effort is successful when:

- the default user path feels like Codex embedded in Altals
- the runtime behaves like a Codex-style agent runtime
- AI implementation ownership is concentrated in Rust instead of split across Rust and JS
- Altals-specific AI shell concepts are no longer shaping the main experience
- the panel is calm, direct, and desktop-native
- future work can implement against one clear plan instead of many competing migration notes
