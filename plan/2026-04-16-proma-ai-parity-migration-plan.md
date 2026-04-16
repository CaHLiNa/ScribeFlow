# Proma AI Parity Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve Altals into a Proma-style AI system by replacing the current single-thread AI panel with a sessioned agent shell and then layering richer input, runtime, and task-state primitives on top.

**Architecture:** Build parity in phases. First replace the single-session AI state model with an explicit session runtime. Then add input parity (`@`, `#`, attachments), runtime/event parity (ask-user, plan mode, background tasks), and finally mode/workspace parity. Keep Altals desktop-first and adapt Proma concepts to the existing workbench instead of cloning Electron shell chrome blindly.

**Tech Stack:** Vue, Pinia, Tauri events/invoke, existing `src/services/ai/runtime/*`, Node tests

---

## File Structure

- Create: `src/domains/ai/aiSessionRuntime.js`
  - owns session record creation and pure session update helpers
- Create: `tests/aiSessionRuntime.test.mjs`
  - verifies session runtime helpers
- Modify: `src/stores/ai.js`
  - move from single transcript state to current-session-over-session-list state
- Modify: `src/components/panel/AiWorkflowPanel.vue`
  - add session rail and active session switching
- Create: `src/components/panel/AiSessionRail.vue`
  - focused UI for session chips/actions
- Modify: `src/i18n/index.js`
  - strings for session actions and states

## Phase 1: Sessioned Agent Shell Foundation

### Task 1: Add pure AI session runtime helpers

**Files:**
- Create: `src/domains/ai/aiSessionRuntime.js`
- Test: `tests/aiSessionRuntime.test.mjs`

- [ ] Add `createAiSessionRecord()`, `ensureAiSessionsState()`, and immutable session update helpers.
- [ ] Add tests for session creation, switching, prompt updates, message replacement, and permission queue updates.

### Task 2: Refactor AI store onto sessions

**Files:**
- Modify: `src/stores/ai.js`
- Create: `src/domains/ai/aiSessionRuntime.js`

- [ ] Replace root-level `messages/artifacts/promptDraft/isRunning/lastError/permissionRequests` with a root session collection plus `currentSessionId`.
- [ ] Keep existing component API stable via getters like `messages`, `artifacts`, `promptDraft`, `isRunning`, `lastError`, and `activePermissionRequest` that proxy the active session.
- [ ] Add session actions: `createSession`, `switchSession`, `deleteSession`, `renameSession`, and `clearCurrentSession`.
- [ ] Update `runActiveSkill()` to read/write only the active session.

### Task 3: Add session rail UI

**Files:**
- Create: `src/components/panel/AiSessionRail.vue`
- Modify: `src/components/panel/AiWorkflowPanel.vue`
- Modify: `src/i18n/index.js`

- [ ] Add a compact session rail above the transcript.
- [ ] Support: create session, switch active session, rename title inline, delete non-last session.
- [ ] Keep visual language minimal and workbench-native.

### Task 4: Verify foundation slice

**Files:**
- Test: `tests/aiSessionRuntime.test.mjs`
- Modify: `src/components/panel/AiWorkflowPanel.vue`
- Modify: `src/stores/ai.js`

- [ ] Run `node --test tests/aiSessionRuntime.test.mjs tests/aiConversationRuntime.test.mjs`
- [ ] Run `npm run build`

## Phase 2: Input Parity

### Task 5: Add mention primitives

**Files:**
- Create: `src/domains/ai/aiMentionRuntime.js`
- Create: `src/components/panel/AiMentionDropdown.vue`
- Modify: `src/components/panel/AiWorkflowPanel.vue`
- Modify: `src/stores/files.js`

- [ ] Add `@file` suggestions from current workspace files.
- [ ] Add `#tool` suggestions from enabled tool registry.
- [ ] Keep `/` and `$skill` invocation working with the same dropdown system.

### Task 6: Add attachments in AI panel

**Files:**
- Create: `src/services/ai/attachmentStore.js`
- Modify: `src/stores/ai.js`
- Modify: `src/components/panel/AiWorkflowPanel.vue`

- [ ] Support file attach, remove, and send metadata with the active session prompt.
- [ ] Surface attached items in the composer and session transcript.

## Phase 3: Runtime/Event Parity

### Task 7: Expand runtime event model

**Files:**
- Modify: `src/domains/ai/aiConversationRuntime.js`
- Modify: `src/stores/ai.js`
- Modify: `src/services/ai/executor.js`
- Modify: `src/services/ai/runtime/anthropicSdkBridge.js`

- [ ] Add session-aware support for `ask_user_request`, `ask_user_resolved`, plan-mode, compacting, and background task events.
- [ ] Preserve current provider loop behavior while enriching event mapping.

### Task 8: Add task-state surfaces

**Files:**
- Create: `src/components/panel/AiTaskProgressCard.vue`
- Create: `src/components/panel/AiActiveTasksBar.vue`
- Modify: `src/components/panel/AiConversationMessage.vue`
- Modify: `src/components/panel/AiWorkflowPanel.vue`

- [ ] Aggregate task-like tool events into a task progress card.
- [ ] Show running tasks above the composer.

## Phase 4: Mode and Workspace Parity

### Task 9: Introduce lightweight chat/agent split

**Files:**
- Create: `src/stores/aiModes.js`
- Modify: `src/components/sidebar/RightSidebar.vue`
- Modify: `src/components/panel/AiWorkflowPanel.vue`

- [ ] Add a lightweight mode distinction instead of a single undifferentiated AI surface.
- [ ] Keep Altals workbench-native and avoid Proma's entire Electron shell duplication.

### Task 10: Add workspace-scoped agent sessions

**Files:**
- Modify: `src/stores/ai.js`
- Modify: `src/stores/workspace.js`
- Create: `src/services/ai/sessionPersistence.js`

- [ ] Persist session metadata per workspace identity.
- [ ] Restore sessions when reopening a workspace.

## Phase 5: Final Verification

### Task 11: Run meaningful parity verification

**Files:**
- Test: `tests/aiSessionRuntime.test.mjs`
- Test: `tests/aiConversationRuntime.test.mjs`
- Test: `tests/aiInvocationRouting.test.mjs`
- Test: `tests/aiToolRegistry.test.mjs`
- Test: `tests/workbenchInspectorPanels.test.mjs`

- [ ] Run targeted AI runtime tests.
- [ ] Run relevant workbench shell checks.
- [ ] Run `npm run build`.

## Spec Coverage Review

- Covered:
  - session model
  - richer AI input affordances
  - runtime parity primitives
  - task feedback surfaces
  - workspace-aware session behavior
- Deferred intentionally:
  - full Proma Electron app-shell replication
  - all sidebar/date-group/history UX from Proma
  - external bridge ecosystems unrelated to Altals core workbench
