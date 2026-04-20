# AI Codex Desktop 复刻记录

日期：2026-04-19  
状态：活跃合并记录  
关联主计划：`plan/2026-04-18-codex-desktop-replication-master-plan.md`

本文档把原先 Phase 1 到 Phase 4 的 Codex 复刻文档合并到一处，避免仓库里同时维护四份互相重叠的 AI 桌面一致性文档。

---

## 总体意图

把当前的 ScribeFlow AI 界面演进成更接近 Codex Desktop 的 agent 工作空间，同时仍然扎根于现有的桌面研究工作台。

稳定的职责分层如下：

- Rust 负责运行时行为、session 语义、审批、interrupt、tool orchestration 与持久化
- 前端负责渲染、用户意图发射、面板局部交互与低层 UI 胶水

---

## 阶段状态快照

- Phase 1：已完成
- Phase 2：已完成
- Phase 3：已完成
- Phase 4：进行中

---

## Phase 1：运行时边界

### 最终规则

AI 运行时权威由 Rust 持有。

前端可以保留：

- 渲染
- 用户意图发射
- 面板局部派生视图状态
- 轻量 input / composer helper
- launcher defaults 设置 UI

前端不应持有：

- turn 编排
- session schema 权威
- runtime event 路由
- stop 或 interrupt resolution
- approval、ask-user、exit-plan 协议语义
- runtime thread 同步
- 基于运行时语义的 message shaping

### Phase 1 达成内容

当前 AI 主路径已经是 Rust-first：

- prepare 在 Rust 中执行
- send 在 Rust 中执行
- runtime thread bootstrap 在 Rust 中执行
- stop 与 interrupt resolution 在 Rust 中执行
- runtime event routing 与 reduction 在 Rust 中执行
- session normalization 在 Rust 中执行
- local session mutation semantics 在 Rust 中执行

### 标准职责归属

Rust 持有的接缝包括：

- `codex` launcher config 读写
- `codex` 命令可用性解析
- `codex-acp` bridge 启动与 session 管理
- skill catalog 加载
- prompt dispatch
- turn prepare
- turn run
- runtime thread creation 与 waiting
- session start / complete / fail / finalize / interrupt 生命周期
- runtime event routing 与 reduction
- runtime-thread-to-session 同步
- session 归一化
- session 本地 mutation 语义
- session overlay 持久化
- attachment 记录创建
- approval / ask-user / exit-plan / plan-mode / background-task runtime 协议

前端持有且可接受的部分：

- AI 面板渲染
- session rail 渲染
- composer input 绑定
- 文件附件选择器接线
- launcher defaults 设置 UI
- toast
- 编辑器选区归一化与面板可读的派生状态

### 可选项，不是阻塞项

以下属于未来可选迁移，而不是运行时主干必须完成的工作：

- 待发送 message id 生成
- `src/domains/ai/aiContextRuntime.js` 中的 context normalization policy
- 更丰富的 ACP/MCP 扩展展示

### 执行规则

从现在开始：

- 新的 AI 运行时行为默认先落在 Rust
- 前端改动应调用稳定的 Rust seam
- 如果职责归属不清晰，默认归 Rust

---

## Phase 2：桌面交互一致性

### 目标

让右侧 AI 面板更像 Codex Desktop 的任务界面，而不是“一个带 AI 小部件的大纲检查栏”。

### 完成结果

Phase 2 已完成。当前已交付结果包括：

- 更轻量、更偏操作型的 session 切换
- 更密集的 agent work log 线程
- 更占主导地位的 composer 控制面
- 更像 agent workspace 的面板层级

### 设计立场

面板应具备以下感受：

- 直接
- 键盘优先
- low-ceremony
- 密集但可读
- 默认安静，仅在需要用户介入时显式发声

它不应让人感觉像：

- 通用聊天应用
- 以设置驱动的 assistant 壳子
- 徽章堆叠的 dashboard
- 藏在 inspector rail 里的第二个产品

### Phase 2 稳定规则

- 只保留一条占主导的默认路径：选 session、输入任务、发送、观察，只在需要时介入
- session chrome 保持轻量
- message 要更像 agent work log
- intervention state 必须明显且唯一
- composer 应属于 panel shell，而不是嵌在卡片中的子组件

---

## Phase 3：控制状态一致性

### 目标

让 plan mode、approval、resume、compacting 与 background task progress 表现成同一层运行时控制系统，而不是松散的 banner 和 pill 集合。

### 完成结果

Phase 3 已完成。当前已交付结果包括：

- 位于 composer 上方的统一 runtime control-state layer
- 针对 `ask-user`、`permission` 与 `exit-plan` 的阻塞态一致性
- 针对 `plan`、`resume`、`compacting` 与 `background tasks` 的非阻塞状态卡片
- runtime summary 与状态卡的密度控制
- 针对 plan mode 与 permission policy 的 composer 侧显式控件

### Phase 3 稳定规则

- 只能有一个阻塞态获胜
- 非阻塞态保持紧凑
- plan approval 必须与 permission approval 属于同一控制系统
- 用户必须能一眼区分 running、waiting、blocked 与 finished 状态

---

## Phase 4：扩展与 MCP 一致性

### 目标

通过定义并实现第一条可工作的 MCP client 路径，补齐当前 ScribeFlow AI 面板与 Codex 风格扩展工作流之间的主要生态差距。

### 当前基线

当前面板已经具备：

- 一套连贯的 control-state layer
- 显式的 plan mode 与 permission 控制
- 更高密度的 session 与 composer 行为
- 一条由 Rust 持有的主执行路径 runtime spine

### 当前实现状态

当前激活的 Phase 4 切片已经包括：

- Rust 持有的 workspace 与 user root 级 MCP config discovery
- Rust 持有的 stdio probe 与 runtime tool-call 接线
- Rust 持有的、供桌面 UI 使用的 runtime extension status summary
- 在 Settings 与 AI panel 中，以低强调方式展示 ready / degraded MCP 状态
- Rust 持有的 runtime extension discovery，与 ACP 主路径共享同一状态来源

仍待完成：

- skills 与 MCP 的优先级及展示规则
- 超出当前 stdio-first 切片之外的更丰富 transport 支持
- 比摘要可见性更深入的 failure recovery 与 invocation UX

### Phase 4 稳定规则

- 扩展保持低强调
- MCP 与 skills 必须共享同一套心智模型
- runtime truth 必须在 Rust
- 桌面界面只展示与决策相关的 extension 状态

### 验证重点

- `npm run lint`
- `npm run build`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- 至少跑一条真实桌面任务流，覆盖第一条 MCP-backed 切片

关键检查项：

- 用户能从桌面界面理解 extension availability
- MCP 缺失或断连时能优雅退化
- MCP 的存在不会压垮默认 composer 路径
- skills 与 MCP 不会呈现彼此冲突的心智模型

---

## 未来 AI 工作的实用规则

如果改动会影响以下内容，应放到 Rust：

- runtime 状态迁移
- session schema
- turn 执行
- tool 行为
- approval 语义
- event 解释
- thread 同步
- persistence 形态

如果改动只影响以下内容，可以保留在前端：

- 面板渲染
- 本地 UI affordance
- 用户输入控件
- 纯展示型派生状态
- launcher 状态展示
