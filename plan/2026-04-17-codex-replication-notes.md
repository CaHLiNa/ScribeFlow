# Notes: Codex Replication

## Sources

### Source 1: Altals product and architecture docs
- Files:
  - `docs/PRODUCT.md`
  - `docs/ARCHITECTURE.md`
  - `docs/OPERATIONS.md`
- Key points:
  - Altals positions AI as a grounded workbench shell inside the desktop app.
  - The repo already wants a provider runtime, tools, and filesystem-native skills.
  - Current architecture emphasizes local-first desktop workflows and explicit UI approval.

### Source 2: Altals AI implementation
- Files:
  - `src/services/ai/agentOrchestrator.js`
  - `src/services/ai/agentExecutionRuntime.js`
  - `src/services/ai/runtime/toolLoop.js`
  - `src/stores/ai.js`
  - `plan/2026-04-15-agent-shell-skill-rearchitecture-plan.md`
- Key points:
  - `src/components/panel/AiAgentPanel.vue` hard-codes an embedded right-rail agent shell; `isAgentMode` is always `true`.
  - `src/services/ai/skillRegistry.js` exposes only one built-in action: `workspace-agent`.
  - `src/services/ai/runtime/providerRuntime.js` is still an adapter + SSE/tool-loop executor with `MAX_TOOL_ROUNDS = 6`, not a durable thread/turn/item runtime.
  - `src/services/ai/executor.js` and `src/services/ai/agentPromptBuilder.js` rely on prompt assembly and structured JSON response contracts; this is closer to “prompted tool runner” than Codex’s protocol-backed agent state machine.
  - `src/services/ai/skillDiscovery.js` only discovers Altals-managed skills from Altals paths. It does not actually ingest `.codex/skills`, `.claude/skills`, `.agents/skills`, or `.goose/skills` despite earlier plan intent.
  - `src/stores/ai.js` already has useful transient concepts such as permission requests, ask-user, exit-plan, compaction, and background tasks, but they are store-local UI state rather than first-class backend protocol primitives.

### Source 3: Codex reference repo
- Artifact:
  - `/Users/math173sr/Downloads/codex-main.zip`
- Key points:
  - Codex is organized around a formal app-server contract: thread, turn, and item are top-level primitives.
  - `codex-rs/app-server/README.md` defines a bidirectional JSON-RPC lifecycle with `thread/start`, `thread/resume`, `thread/fork`, `turn/start`, `turn/interrupt`, `thread/archive`, `skills/list`, `plugin/*`, `mcpServer/*`, and `command/exec`.
  - The app-server protocol exposes fine-grained notifications such as `item/started`, `turn/completed`, `plan` deltas, reasoning-summary deltas, filesystem change events, and skill change events.
  - Codex has explicit approval-policy and sandbox-policy concepts, plus approval reviewers and protocol-level approval requests.
  - Codex skills are not just markdown snippets: `SkillsListResponse.json` shows scope, enabled state, interface metadata, errors, and dependency metadata.
  - The reference repo contains both user-facing `.codex/skills/*` packs and system/core skill infrastructure in `codex-rs/core-skills` and `codex-rs/skills`.
  - Collaboration mode is a real runtime concept with shipped templates like `default.md` and `plan.md`, not a UI-only toggle.

## Synthesized Findings

### Working hypotheses
- Confirmed: Altals has pieces of a Codex-like shell, but the current center of gravity is still “provider-backed sidebar agent” rather than “Codex runtime surfaced in a desktop client”.
- The biggest mismatch is contract depth: Codex is protocol-first, while Altals is prompt/store-first.

### Concrete gap list
- Product mental model:
  - Altals presents one `workspace-agent` inside the right sidebar.
  - Codex presents a thread-oriented agent runtime that can be surfaced by multiple clients.
- Session model:
  - Altals has local sessions in Pinia.
  - Codex has durable threads, turns, items, forking, archive/unarchive, rollback, and resume semantics.
- Tool/runtime model:
  - Altals runs a local SSE loop and folds tool calls into a short normalized event list.
  - Codex has protocol-addressable tool execution, command execution, diff/file events, realtime notifications, and persistent turn output.
- Approval model:
  - Altals shows local permission banners and provider-specific callbacks.
  - Codex has approval policy, sandbox policy, approval reviewer, and approval request types as first-class runtime inputs and outputs.
- Skills model:
  - Altals currently only trusts Altals-managed skill roots.
  - Codex supports real Codex skill directories and richer skill metadata, dependency, scope, enablement, and change notifications.
- Collaboration model:
  - Altals has an `agent/chat` distinction and some plan-mode UI state.
  - Codex has formal collaboration modes with default instructions and explicit mode-specific behavior.
- Extensibility model:
  - Altals runtime is still primarily provider adapters plus built-in tools.
  - Codex already treats plugins, MCP, dynamic tools, apps, and external config import as protocol-level citizens.
