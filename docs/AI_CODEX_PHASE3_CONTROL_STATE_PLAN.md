# AI Codex Phase 3 Control-State Parity Plan

Date: 2026-04-18
Status: Active implementation plan
Depends on: `docs/AI_CODEX_PHASE2_DESKTOP_PARITY_PLAN.md`
Related master plan: `plan/2026-04-18-codex-desktop-replication-master-plan.md`

## Goal

Make plan mode, approvals, resume, compacting, and background task progress read like one runtime control layer instead of a loose collection of banners and pills.

This phase is about higher-order task orchestration parity, not basic panel layout.

## Current baseline

The runtime already exposes the right concepts:

- permission requests
- ask-user requests
- exit-plan requests
- plan mode
- resume waiting state
- compaction state
- background tasks

The main remaining gap is presentation and hierarchy.

The current panel still mixes:

- compact status pills for some states
- full banners for others
- a custom permission card outside the same mental model

That makes the control flow harder to scan than Codex Desktop, especially when the agent is blocked or partially waiting.

## Scope

### In scope

- `src/components/panel/AiAgentPanel.vue`
- `src/components/panel/AiActiveTasksBar.vue`
- `src/components/panel/AiPlanModeBanner.vue`
- `src/components/panel/AiResumeBanner.vue`
- `src/components/panel/AiCompactingBanner.vue`
- `src/components/panel/AiAskUserBanner.vue`
- `src/components/panel/AiExitPlanBanner.vue`
- small supporting state-selection changes in `src/stores/ai.js` only if needed

### Out of scope

- MCP
- provider settings redesign
- message transcript redesign already handled in Phase 2
- runtime protocol changes unless a clear Phase 3 blocker is discovered

## Product rules

### Rule 1: one blocking state wins

When the runtime is blocked, the panel should show the blocking state first and suppress lower-priority informational noise.

### Rule 2: non-blocking state stays compact

Plan mode, resume, compacting, and running background tasks should stay visible, but they should read as one runtime layer rather than four unrelated decorations.

### Rule 3: plan approval is not a side quest

Exit-plan approval should feel like part of the same control-state system as permission approval, not a different UI family with unrelated weight.

### Rule 4: running versus waiting must be obvious

The user should be able to tell at a glance whether the agent is:

- actively running
- waiting on background work
- blocked on user approval or input
- finished

## First implementation slice

### Slice A: Unified control-state stack

Objective:
Replace the mixed status-pill plus banner approach with a single ordered control-state stack above the composer.

Tasks:

- remove low-information status pills from `AiAgentPanel`
- promote plan mode, resume, compacting, and background tasks into explicit runtime-state components
- keep permission, ask-user, and exit-plan as the primary blocking layer
- define clear ordering so the user sees the most decision-relevant state first

Acceptance criteria:

- the panel no longer mixes pills for some runtime states and banners for others
- blocked states are singular and obvious
- non-blocking runtime states stay visible without becoming clutter

## Planned follow-up slices

### Slice B: Approval-family coherence

- tighten the visual and interaction relationship between permission approval and exit-plan approval
- make approval actions feel like one system

### Slice C: Resume and background-task parity

- improve the relationship between waiting-to-resume messaging and running background task detail
- make resumed execution easier to reason about

## Validation

- `npm run lint`
- `npm run build`
- real desktop verification in the Tauri app

Key UI checks:

- permission request
- ask-user flow
- exit-plan approval
- plan mode without blocking
- resume while background tasks are running
- compact width in the right sidebar
