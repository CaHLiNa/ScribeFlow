# Notes: Proma AI Parity Inventory

## Source Repositories

### Source 1: Altals current AI slice
- Paths:
  - `src/stores/ai.js`
  - `src/components/panel/AiWorkflowPanel.vue`
  - `src/components/panel/AiConversationMessage.vue`
  - `src/services/ai/runtime/*`
- Current shape:
  - single embedded AI transcript
  - single current session only
  - provider switching
  - filesystem skill discovery
  - tool loop for provider adapters
  - artifact application
  - permission request handling for Anthropic SDK

### Source 2: Proma AI system
- Paths:
  - `apps/electron/src/renderer/components/agent/*`
  - `apps/electron/src/renderer/components/chat/*`
  - `apps/electron/src/renderer/hooks/useGlobalAgentListeners.ts`
  - `apps/electron/src/main/lib/agent-orchestrator.ts`
  - `apps/electron/src/main/lib/agent-session-manager.ts`
  - `packages/shared/src/types/agent.ts`
  - `packages/shared/src/types/chat.ts`

## Proma AI Capability Groups

### 1. Mode Architecture
- separate Chat mode and Agent mode
- explicit mode switcher
- chat-to-agent recommendation and migration
- per-mode settings and tooling

### 2. Session and Workspace Model
- multiple agent sessions
- workspace-scoped sessions
- session list/sidebar organization
- pin/archive/delete/fork/move/resume semantics
- per-session model/channel state

### 3. Input Ergonomics
- rich input surface
- `@` file mention
- `#` MCP/tool mention
- `/` skill and command invocation
- file attachments and drag/drop
- prompt editor sidebar
- thinking toggle
- permission mode selector

### 4. Runtime and Event Model
- global streaming listeners
- SDK-native message/event persistence
- permission request queue
- ask-user queue
- plan mode enter/exit flow
- compacting state
- background task tracking
- richer tool activity lifecycle

### 5. Rendering and Agent Feedback
- grouped message turns
- explicit tool activity blocks
- task progress card aggregation
- active tasks bar
- background tasks panel
- inline image/tool result rendering
- minimap/sticky user message/scroll memory

### 6. Settings and Onboarding
- provider/channel matrix
- tool settings
- memory settings
- environment readiness checks
- workspace selector
- shortcuts and tips oriented around Agent mode

## Altals Gap Summary

### Structural gaps
- no multi-session agent model
- no chat/agent split
- no workspace-scoped agent sessions
- no persisted agent session metadata

### Input gaps
- no `@file` mention flow
- no `#tool` mention flow
- no attachments in AI surface
- no permission mode selector
- no plan mode affordance

### Runtime gaps
- no ask-user event handling
- no background task model
- no plan-mode enter/exit lifecycle
- no compact/rewind/fork/session history primitives

### Presentation gaps
- no task aggregation cards
- no active tasks summary
- no workspace/session navigation in AI
- no migration path from lightweight chat to full agent execution

## Selected First Slice

### Sessioned agent shell foundation
- add explicit AI session objects to Altals state
- switch panel rendering/actions from one global transcript to one active session among many
- expose a lightweight session rail in the AI panel
- keep provider/tool/runtime integration working while changing the state model

## Why This First
- Proma's AI experience is session-first
- every later parity feature depends on addressing the single-session bottleneck
- adding more UI before this would continue making Altals AI feel bolted on
