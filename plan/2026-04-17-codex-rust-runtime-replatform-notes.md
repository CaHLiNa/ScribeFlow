# Notes: Codex Rust Runtime Replatform

## Sources

### Source 1: Altals current backend seams
- Files:
  - `src-tauri/src/lib.rs`
  - `src-tauri/src/network.rs`
  - `src-tauri/src/ai_runtime.rs`
  - `src-tauri/Cargo.toml`
- Key points:
  - Current Rust backend exposes a thin Tauri command layer.
  - `network.rs` owns generic provider HTTP/SSE proxying.
  - `ai_runtime.rs` is Anthropic-SDK-specific and shells out to a Node bridge.
  - There is no Rust-native thread/turn/item runtime yet.

### Source 2: Altals current frontend agent orchestration
- Files:
  - `src/stores/ai.js`
  - `src/services/ai/agentOrchestrator.js`
  - `src/services/ai/executor.js`
  - `src/services/ai/runtime/providerRuntime.js`
  - `src/components/panel/AiAgentPanel.vue`
- Key points:
  - Frontend owns session state, prompt assembly, tool loop, and most transient agent semantics.
  - The agent panel is currently a right-sidebar client with local session tabs.
  - Runtime semantics such as permissions, ask-user, and plan mode are normalized in JS after provider events arrive.

### Source 3: Codex reference implementation
- Artifact:
  - `/Users/math173sr/Downloads/codex-main.zip`
- Key points:
  - Codex app-server is protocol-first: `thread`, `turn`, and `item` are primary runtime entities.
  - The protocol exposes approvals, collaboration modes, skills, command execution, plugin/MCP integration, and streaming notifications.
  - Skills carry richer metadata than Altals currently models.
  - Codex uses Rust as the runtime center of gravity, with clients consuming JSON-RPC style events.

## Synthesized Findings

### Current mismatch
- Altals is still “frontend orchestrates, backend proxies”.
- Codex is “backend runtime orchestrates, frontend is a client”.

### Required architectural inversion
- Move state ownership for conversation progression, tool execution, approvals, and plan/task lifecycle into Rust.
- Retain the existing Vue panel initially, but make it consume Rust-emitted runtime events.
- Gradually delete or shrink JS runtime files once parity modules exist in Rust.

### Direct copy vs adaptation
- Codex concepts that can be ported with limited translation:
  - thread/turn/item primitives
  - approval policy concepts
  - collaboration mode concepts
  - skills metadata model
  - event streaming vocabulary
- Codex parts that require Altals-specific adaptation:
  - transport layer should be Tauri command/event based instead of the full standalone app-server process
  - file/tool integrations must respect Altals workspace boundaries and current desktop shell
  - frontend UX remains Altals-native even when runtime semantics become Codex-like
