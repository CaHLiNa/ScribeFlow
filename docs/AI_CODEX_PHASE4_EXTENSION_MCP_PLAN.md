# AI Codex Phase 4 Extension and MCP Plan

Date: 2026-04-19
Status: Active implementation plan
Depends on: `docs/AI_CODEX_PHASE3_CONTROL_STATE_PLAN.md`
Related master plan: `plan/2026-04-18-codex-desktop-replication-master-plan.md`

## Goal

Close the main ecosystem gap between the current Altals AI panel and Codex-style extension workflows by defining and implementing a first working MCP client path.

This phase is about extension parity and desktop presentation rules, not another panel redesign.

## Current baseline

The panel now has:

- a coherent control-state layer
- explicit plan mode and permission controls
- denser session and composer behavior
- a Rust-owned runtime spine for the main execution path

The main remaining gap is extension reach:

- no first-class MCP client flow in the current desktop AI path
- unclear coexistence rules between built-in skills and external MCP-backed capabilities
- no settled desktop presentation model for extension availability, status, and invocation

### Current implementation note

The active Phase 4 slice now includes:

- Rust-owned MCP config discovery across workspace and user roots
- Rust-owned stdio probe and runtime tool-call wiring
- a Rust-owned runtime extension status summary used by the desktop UI
- low-emphasis desktop visibility for ready versus degraded MCP state in Settings and the AI panel
- a Rust-owned runtime tool catalog that can surface MCP-backed tools alongside built-in tools
- unified `#tool` suggestion plumbing so agent-mode composer suggestions no longer stop at built-in tools

Still pending:

- skills versus MCP precedence and presentation rules
- richer transport support beyond the current stdio-first slice
- deeper failure recovery and invocation UX beyond summary visibility

## Scope

### In scope

- MCP client integration design for the Altals desktop AI runtime
- Rust-first seams for MCP discovery, connection state, and invocation routing
- desktop presentation rules for extension availability and user-facing affordances
- coexistence rules between skills and MCP-backed tools
- one first working MCP slice that proves the architecture

### Out of scope

- broad settings redesign unrelated to extension parity
- extension marketplace UX
- turning the right panel into a tool browser
- speculative MCP server-mode work unless required by a concrete desktop use case

## Product rules

### Rule 1: extensions stay low-emphasis

The default task-entry path remains natural language. MCP capability should support that flow, not replace it with registry-first UI.

### Rule 2: MCP and skills need one mental model

Users should not have to reason about two unrelated extension systems. The product needs clear rules for what is built-in, what is local skill-based, and what is externally connected.

### Rule 3: runtime truth lives in Rust

Connection state, availability, capability mapping, and invocation routing should live in Rust-owned runtime seams by default.

### Rule 4: desktop surface only shows decision-relevant state

Only expose extension state when it changes what the user can do, what the agent can access, or why a run is blocked or degraded.

## First implementation slice

### Slice A: MCP client contract and desktop surface entry

Objective:
Define the minimum MCP client architecture and ship the first usable desktop-facing integration slice.

Tasks:

- audit current extension-related code paths and identify the right Rust seam for MCP client ownership
- define a minimal MCP capability model for the desktop AI runtime
- decide how MCP-backed capabilities appear in runtime state and user-facing tool availability
- implement one working MCP client slice with end-to-end runtime wiring

Acceptance criteria:

- the codebase has a documented MCP client contract for Altals
- the desktop AI runtime can detect and use at least one MCP-backed capability path
- the panel does not regress into registry-heavy UI just to expose MCP support

## Planned follow-up slices

### Slice B: Skills and MCP coexistence rules

- define presentation and precedence rules between skills, built-in tools, and MCP-backed tools
- reduce duplication in extension-facing language and settings

### Slice C: Runtime state and failure clarity

- expose extension connection and degradation state where user decisions depend on it
- keep failures understandable without overloading the composer surface

## Validation

- `npm run lint`
- `npm run build`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- one real desktop task flow that exercises the first MCP-backed slice

Key checks:

- extension availability is understandable from the desktop surface
- missing or disconnected MCP capability degrades cleanly
- MCP presence does not overload the default composer path
- skills and MCP do not present contradictory mental models
