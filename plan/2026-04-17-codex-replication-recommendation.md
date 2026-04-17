# Codex Replication Recommendation

## Summary

Altals 现在复刻到的是“Codex 风格侧栏 agent”，不是“Codex runtime + 客户端表面”。如果目标是让用户真正觉得这是 Codex 的复刻，优先级应该从 UI 微调切到 runtime contract 重建。

## What To Change First

### Phase 1: Stop faking skills
- Make skill discovery truly Codex-compatible:
  - support `~/.codex/skills`, `./.codex/skills`, and repo/user/system scopes
  - preserve Altals-only roots as an extension, not the primary contract
- Add skill metadata shape beyond `name/description/path`:
  - enabled state
  - scope
  - dependency metadata
  - parse/load errors
  - optional interface metadata

### Phase 2: Replace store-first sessions with protocol-first threads
- Introduce a backend-owned thread model:
  - thread start/resume/fork/archive/read/list
  - turn start/interrupt/steer
  - persisted items as the source of truth for transcript state
- Make the frontend consume notifications rather than synthesize most state locally.

### Phase 3: Promote approvals and sandbox to first-class runtime config
- Define explicit runtime inputs for:
  - sandbox mode
  - approval policy
  - permission mode
  - reviewer policy
- Normalize all permission/ask-user/exit-plan/background-task events through one backend protocol instead of provider-specific patches.

### Phase 4: Rebuild the client mental model around Codex
- The panel should feel like a thread client:
  - thread identity
  - turn lifecycle
  - item stream
  - reasoning/plan/task deltas
- Reduce the feeling of “choose a built-in action and run it”.
- Keep Altals desktop-native, but let the shell behave like a Codex client embedded into the research workbench.

## What To Delay

- Do not start with UI skinning.
- Do not start with more first-party academic skills.
- Do not start with provider proliferation.
- Do not start with speculative multi-agent UX before the thread/turn/item contract exists.

## Recommended Implementation Order

1. Codex-compatible skill roots + metadata contract
2. Tauri-side `app-server-lite` protocol for threads/turns/items/events
3. Frontend refactor from Pinia-owned transcript state to protocol-fed thread state
4. Approval/sandbox/runtime policy normalization
5. Collaboration mode + plan/default mode parity
6. MCP/plugin/dynamic-tool expansion

## Success Criteria

- A skill folder dropped into `.codex/skills/` can be discovered and represented with Codex-like metadata.
- A conversation can be resumed/forked as a durable thread instead of only switching local tabs.
- Turns stream structured lifecycle events instead of only assistant text plus folded tool markers.
- Approval and plan-mode events come from one runtime protocol and are not special cases bolted onto a provider.
- The user perceives Altals AI as “Codex embedded into the workbench”, not “a sidebar assistant inspired by Codex”.
