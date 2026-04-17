# Task Plan: Codex Rust Runtime Replatform

## Goal
将 Altals 当前基于前端 store 与 JS provider loop 的 AI/agent 架构，重构为一个 Rust 主导的 Codex-style runtime core，并逐步把前端降级为该 runtime 的客户端。

## Phases
- [x] Phase 1: Read current Altals AI frontend/backend seams
- [x] Phase 2: Read Codex Rust runtime and app-server reference shapes
- [x] Phase 3: Write the complete implementation plan document
- [x] Phase 4: Implement Rust runtime foundation slice
- [ ] Phase 5: Verify, document, and summarize

## Key Questions
1. 哪些 Codex primitives 必须先落，才能保证后面不是继续修补旧架构？
2. 在 Altals 的 Tauri 架构中，哪些地方可以直接移植 Codex Rust 设计，哪些必须改写？
3. 第一阶段要做到什么程度，才能确保后续迁移前端时不会再次推翻协议？

## Decisions Made
- Prioritize Rust runtime parity over UI parity.
- Keep plan documents under `plan/` per repository preference.
- Start by introducing a new Rust runtime module set instead of further extending `src/services/ai/runtime/*`.
- Migrate in dual-track mode: `workspace-agent` prefers the new Rust runtime, while old JS execution stays alive temporarily for filesystem skills and Anthropic SDK special cases.

## Errors Encountered
- None yet.

## Status
**Currently in Phase 5** - Rust runtime foundation is in place, provider execution has been added for the new runtime path, and Codex-compatible skill discovery roots are now enabled. Remaining work is frontend ownership inversion, tool execution migration, persistence, and removal of old JS runtime seams.
