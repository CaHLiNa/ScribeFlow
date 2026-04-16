# Task Plan: Proma AI Parity Migration

## Goal
Migrate Altals from a single-thread embedded AI panel to a Proma-style AI system with agent sessions, richer event handling, tool/task state, and parity-oriented input/runtime features.

## Phases
- [x] Phase 1: Inventory Proma AI capabilities and Altals gaps
- [x] Phase 2: Write migration notes and a parity implementation plan
- [x] Phase 3: Implement sessioned agent shell foundation in Altals
- [x] Phase 4: Implement input parity primitives (`@file`, `#tool`, attachments, richer invocation)
- [x] Phase 5: Implement runtime parity primitives (ask-user, plan mode, background tasks, richer tool events)
- [x] Phase 6: Implement chat/agent split, migration flows, and workspace-scoped agent sessions
- [ ] Phase 7: Verification, docs, and cleanup

## Key Questions
1. Which Proma AI features are foundational versus surface polish?
2. Which Proma concepts map cleanly into Altals' desktop workbench, and which need adaptation?
3. What is the smallest first implementation slice that makes Altals structurally capable of Proma-style AI parity?
4. How do we avoid piling more UI onto a store/runtime that is still single-session and under-modeled?

## Decisions Made
- This will be treated as a staged parity migration, not another round of cosmetic panel tweaks.
- The first implementation slice is the session model because Proma's AI UX is built around multi-session agent state, not a single global transcript.
- Proma's AI feature set will be grouped into six subsystems: mode architecture, session/workspace model, input ergonomics, runtime/event model, rendering/task surfaces, and settings/onboarding.
- Altals will adapt Proma's concepts into its desktop research workbench instead of copying Electron-specific shell chrome blindly.
- Phase 4 is considered implemented once composer mentions and file attachments materially affect prompt construction, not only the UI.
- Phase 5 now includes end-to-end ask-user handling plus session-aware plan mode / background task state and task progress rendering, but the Anthropic SDK bridge still emits only a subset of Proma-style lifecycle events.
- Workspace-scoped session persistence is now in place, and the AI panel now has an explicit chat/agent mode split plus chat→agent migration flow.
- Chat mode now forces a lighter runtime path by avoiding Anthropic SDK mode even when the provider is configured for SDK in agent mode.
- SDK bridge parity improved by emitting plan/background/tool completion signals from more raw SDK messages, and ask-user now round-trips user answers back into the SDK tool flow via `updatedInput.answers`.
- SDK bridge parity now also covers `compacting`, `compact_complete`, `task_started`, `task_progress`, and `task_notification`, with Altals session state and panel UI reflecting compacting and richer background task progress.
- AI sessions are no longer split by `chat` vs `agent` rails; the active session now keeps its own runtime profile while session-level permission state is tracked separately, which makes room for Proma-style `permission_mode_changed`, `waiting_resume`, `resume_start`, and exit-plan lifecycle events.

## Errors Encountered
- `scripts/codex_hook_emulation.py` is not present in this repository, so the AGENTS session-start helper could not be run.

## Status
**Currently in Phase 7 cleanup/verification territory** - input parity, unified session runtime profiles, workspace-scoped sessions, ask-user round-trip, compacting state, richer task lifecycle parity, and the first long-tail permission/resume/exit-plan lifecycle events are implemented. The main remaining gap is the deeper long-tail of SDK parity and follow-on cleanup rather than missing core product loops.
