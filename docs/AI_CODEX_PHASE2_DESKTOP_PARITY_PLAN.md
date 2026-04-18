# AI Codex Phase 2 Desktop Parity Plan

Date: 2026-04-18
Status: Completed
Depends on: `docs/AI_CODEX_PHASE1_RUNTIME_AUDIT.md`
Related master plan: `plan/2026-04-18-codex-desktop-replication-master-plan.md`

## Completion note

Phase 2 should now be treated as complete.

The right-side AI surface now has the intended Phase 2 shape:

- session switching is lighter and more operational
- the thread reads more like a dense agent work log
- the composer is the dominant native control surface
- the panel reads like an agent workspace inside the right rail instead of an inspector addon

The next gap is no longer baseline desktop identity.
It is higher-order runtime control flow, which moves to Phase 3.

## Goal

Rebuild the current right-side AI panel so it feels like a Codex Desktop task surface, not an outline inspector with an AI widget attached.

This phase is about desktop interaction parity, not runtime architecture.

## Design stance

The target surface should feel:

- direct
- keyboard-first
- low-ceremony
- dense but readable
- quiet by default, explicit when user intervention is needed

The panel should not feel:

- like a generic chat app
- like a settings-driven assistant shell
- like a badge-heavy status dashboard
- like a second product hidden inside the inspector rail

## Current baseline

The current panel is already materially cleaner than before:

- provider-facing UI has been reduced
- duplicate shell metadata has been removed
- model choice is low-emphasis
- send and stop are now one primary control
- sessions are cleaner than the original Altals shell version

But the surface still differs from Codex Desktop in five visible ways:

1. session switching still reads like a dropdown widget rather than a task/work thread selector
2. the thread area is still visually closer to a chat transcript than a dense agent run log
3. the composer is cleaner, but still reads as a card inside a card rather than the panel's native control bar
4. approval and waiting states are functionally present but still too banner-like and fragmented
5. the panel hierarchy still feels like “AI inside inspector chrome” instead of “agent workspace inside the right rail”

## Scope

### In scope

- `src/components/panel/AiAgentPanel.vue`
- `src/components/panel/AiSessionRail.vue`
- `src/components/panel/AiConversationMessage.vue`
- AI panel companion components directly affecting visible task flow, such as:
  - `AiActiveTasksBar.vue`
  - `AiAskUserBanner.vue`
  - `AiExitPlanBanner.vue`
  - `AiPlanModeBanner.vue`
  - `AiResumeBanner.vue`
  - `AiCompactingBanner.vue`
- minimal supporting style adjustments in the right sidebar shell if needed for parity

### Out of scope

- runtime protocol changes
- MCP work
- provider settings redesign
- unrelated editor, references, or document workflow surfaces
- broad visual redesign of the rest of Altals

## Product rules for Phase 2

### Rule 1: one dominant path

The default path must remain:

- select or keep current session
- type a task
- send
- observe
- intervene only when the runtime explicitly needs input

No secondary control should compete with the composer and primary action button during the default path.

### Rule 2: session chrome should shrink

Session switching should feel lightweight and operational.

That means:

- fewer badges
- less visual weight
- faster switch/rename behavior
- more popover-like presentation, less “dropdown widget” feel

### Rule 3: messages should read like an agent work log

The transcript should emphasize:

- actual assistant output
- user instructions
- tool/task progress when meaningful

The transcript should de-emphasize:

- decorative wrappers
- repeated labels
- metadata that does not affect user decisions

### Rule 4: intervention states must be obvious and singular

If the runtime is waiting for:

- approval
- ask-user input
- exit-plan confirmation

the panel should make that state unmistakable, but without stacking too many unrelated banners at once.

### Rule 5: the composer belongs to the panel, not to a nested card

The bottom control area should feel like the native control surface of the panel.

It should not feel like:

- a floating form card
- a separate sub-panel
- a mini app embedded inside the AI panel

## Implementation slices

### Slice A: Session rail simplification

Objective:
Make session switching feel closer to a native work-thread selector.

Tasks:

- reduce the visual weight of the current-session chip
- keep only the most decision-relevant state in the rail
- tighten menu spacing, row height, and hit targets
- make rename and delete affordances feel explicit but unobtrusive
- ensure the menu reads like a popover, not a detached card

Acceptance criteria:

- the rail occupies less visual attention than the thread and composer
- switching sessions feels operational, not ornamental
- session status is still legible without repeated noise

### Slice B: Thread density and message hierarchy

Objective:
Make the conversation area feel more like a Codex Desktop run log.

Tasks:

- tighten vertical rhythm in `AiConversationMessage`
- reduce surface treatment around ordinary text messages
- keep tool/task progress visually subordinate to actual assistant output
- preserve artifact application affordances without making them dominate the transcript
- remove any remaining decorative metadata that does not change decisions

Acceptance criteria:

- more content fits in one panel height without feeling cramped
- assistant output is the visual primary element
- the thread reads like work happening, not bubbles being exchanged

### Slice C: Composer as native control bar

Objective:
Make the bottom area feel like the primary task-entry surface.

Tasks:

- reduce card-in-card feeling in `AiAgentPanel`
- integrate model chip and attachment control into one compact tool strip
- keep the primary send/stop button singular and visually decisive
- tighten empty-state and placeholder copy so the composer carries the panel's main intention
- preserve keyboard send and multiline behavior

Acceptance criteria:

- the composer feels anchored to the panel shell
- there is one obvious primary action
- supporting controls remain available but low-emphasis

### Slice D: Intervention-state consolidation

Objective:
Make runtime waiting states legible without turning the top of the composer into a stack of banners.

Tasks:

- define ordering and collapse rules for:
  - plan mode
  - resume state
  - compacting state
  - ask-user
  - exit-plan
  - permission request
  - active background tasks
- keep the currently blocking state most prominent
- demote non-blocking runtime status into compact strips where possible

Acceptance criteria:

- when the agent is blocked, the user can tell immediately why
- when the agent is not blocked, the composer area stays visually calm
- multiple runtime states do not produce a noisy stack

### Slice E: Final panel identity pass

Objective:
Make the whole right rail read as an agent workspace.

Tasks:

- check spacing and hierarchy across header, thread, and composer together
- ensure the empty state, session rail, transcript, and composer feel like one system
- remove any remaining inspector-specific or Altals-first visual leftovers in this panel

Acceptance criteria:

- the panel no longer feels like “outline inspector plus AI addon”
- the AI panel has one clear operational rhythm from top to bottom

## Validation plan

Each implemented slice should be validated with:

- `node scripts/frontendBaselineTooling.mjs lint`
- `npm run build`
- real desktop verification in the running Tauri app

UI verification checklist:

- empty state
- active session switch
- session rename
- send task
- stop task
- approval / ask-user / exit-plan visibility
- long transcript scroll behavior
- compact width behavior in the right rail

If the slice materially changes visible hierarchy or density, capture a before/after screenshot for review.

## Done definition for Phase 2

Phase 2 is complete when:

- the panel reads as an agent workspace, not a chat widget in the inspector
- the session rail is lighter and more operational
- the thread is denser and more work-log-like
- the composer feels like one native control bar
- intervention states are explicit without becoming banner clutter
- the default send/observe flow is visually dominant

## First implementation order

Recommended order:

1. Slice C: composer
2. Slice A: session rail
3. Slice B: message density
4. Slice D: intervention-state consolidation
5. Slice E: final identity pass

Reason:

- the composer defines the main interaction rhythm
- the session rail is the second most visible recurring control
- transcript density should be tuned after the top and bottom rails settle
- intervention-state cleanup works best after the baseline structure is stable
