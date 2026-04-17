# Agent Runtime Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Altals 的 AI 从 `grounded workflow assistant` 重构成 `agent-first` 结构，并逐步接近真正的 workspace coding agent。

**Architecture:** 第一阶段先保留现有 provider/runtime 能力，但把默认 built-in action、prompt 身份、默认路由和 UI 文案统一切到 `workspace-agent`。`skill` 保留为 agent 的能力层，由 agent 根据消息自动路由，也允许用户显式手动调用；它不再作为旧式 workflow 主入口。随后把执行链从 `skill-first brief execution` 拆到 `agent orchestrator + prompt builder + session runtime`，最后再扩文件工具和 UI 事件流。

---

### Task 1: 建立 agent-first 默认入口并保留兼容别名

**Files:**

- Create: `plan/2026-04-16-agent-runtime-refactor.md`
- Create: `src/services/ai/builtInActions.js`
- Modify: `src/services/ai/skillRegistry.js`
- Modify: `src/services/ai/invocationRouting.js`
- Modify: `src/stores/ai.js`
- Modify: `src/domains/ai/aiContextRuntime.js`
- Modify: `src/domains/ai/aiArtifactRuntime.js`
- Modify: `src/domains/ai/aiConversationRuntime.js`
- Modify: `src/services/ai/executor.js`
- Modify: `src/i18n/index.js`

- [x] 引入 built-in action id 规范化层，把 `grounded-chat` 兼容映射到新的 `workspace-agent`
- [x] 把默认 active skill / invocation fallback / built-in brief builder 切到 `workspace-agent`
- [x] 把 agent mode 的前台交互固定为 `workspace-agent`，不再让用户显式运行 `$skill`
- [x] 把 executor 的默认系统提示从 research assistant 改成 workspace agent
- [x] 移除首屏与消息里最显眼的 `Grounded chat / grounded` 文案
- [x] 跑与 AI 路由、上下文、消息、artifact 相关的测试

### Task 2: 拆出 agent prompt builder 和 agent execution seam

**Files:**

- Create: `src/services/ai/agentPromptBuilder.js`
- Create: `src/services/ai/agentExecutionRuntime.js`
- Modify: `src/services/ai/executor.js`
- Modify: `src/stores/ai.js`

- [x] 把现有 `buildSystemPrompt / buildUserPrompt / response contract` 从 executor 中拆出
- [x] 引入显式 `runtimeIntent: chat | agent | skill`
- [x] 让 agent mode 默认走 agent prompt builder，而不是 skill brief builder
- [x] 保持 filesystem skill 调用链兼容

### Task 3: 扩展 workspace agent 的工具能力

**Files:**

- Modify: `src/services/ai/runtime/toolLoop.js`
- Modify: `src/stores/ai.js`
- Modify: `src/services/ai/toolRegistry.js`
- Create: `src/services/ai/runtime/workspaceFileTools.js`

- [x] 增加显式 workspace file tools：读取文件、列目录、读取活动文档、读取选区
- [x] 让 agent mode 可基于 workspace files 工作，而不是只围绕文档/文献
- [x] 对非 Anthropic SDK provider 保持有限但一致的工具回路

### Task 4: 重做 AI panel 的 agent UI 心智

**Files:**

- Modify: `src/components/panel/AiWorkflowPanel.vue`
- Modify: `src/components/panel/AiConversationMessage.vue`
- Modify: `src/components/panel/AiSessionRail.vue`
- Modify: `src/components/settings/SettingsAi.vue`

- [x] 把 `skills-first` 的入口文案改成 `task-first`
- [x] 明确展示当前 agent runtime、工具活动、权限、workspace 范围
- [x] 降低 research-only 上下文标签权重，把它们降级成附加上下文

### Task 5: 引入真正的 agent orchestrator 骨架

**Files:**

- Create: `src/services/ai/agentOrchestrator.js`
- Create: `src/services/ai/agentSessionManager.js`
- Create: `src/domains/ai/aiAgentRunSessionRuntime.js`
- Create: `src/domains/ai/aiAgentRunEventState.js`
- Create: `src/services/ai/runtime/anthropicSdkEventStream.js`
- Modify: `src/stores/ai.js`
- Modify: `src/services/ai/runtime/anthropicSdkBridge.js`
- Modify: `src/services/ai/runtime/providerRuntime.js`

- [x] 建立长期目标骨架：orchestrator、session manager、event streaming seam
- [x] 先复用当前 store，再逐步把事件处理从 store 下沉
- [x] 为后续多 agent / background task / task queue 留出结构边界
- [x] 把 Anthropic SDK bridge 的事件解析抽成独立 seam，并把 transport 暴露到 runtime / session / UI
- [x] 调整 skill 定位：保留 skill discovery，但默认通过 agent 自动路由，且继续支持显式手动调用

### 当前执行策略

- 当前回合直接实施 **Task 1**，先完成默认入口、prompt 身份和主要 UI 词汇切换。
- `skill` 在 agent mode 中属于次级能力层：默认自动路由，必要时允许显式调用，但不再是旧式 workflow 主入口。
- Task 2 以后按最小可验证切片继续推进，避免一次性改爆现有运行链路。
