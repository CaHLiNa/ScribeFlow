# ScribeFlow AGENTS.md

适用范围：整个仓库。

## 0. 先读什么

在进行有实质影响的修改前，先读：

- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`

涉及预览、编译、编辑器工作流时，再读：

- `docs/DOCUMENT_WORKFLOW.md`

涉及 agent、release、仓库操作规则时，再读：

- `docs/OPERATIONS.md`

## 1. 项目目标

ScribeFlow 是一个本地优先的桌面学术研究工作台。主产品是 Tauri 桌面应用，不是 `web/`。

核心闭环：

- 打开本地项目目录
- 浏览项目文件与项目文献
- 在应用内阅读材料
- 编写 Markdown / LaTeX / Python 文档
- 插入引用并维护 bibliography
- 完成编译、预览与研究上下文检查

产品边界：

- 左侧始终是项目树优先
- 右侧始终围绕大纲与研究上下文
- 不把产品做成通用 PKM、聊天壳子或割裂的文献管理器
- 不让 `web/` 项目主导桌面端决策

## 2. 默认工作方式

这是一个长期演进项目，不按“补丁型修修补补”处理。

默认目标：

- 优先交付完整能力，不交付半闭环
- 优先建设可继续演进的结构，不堆临时逻辑
- 优先明确 system behavior，再谈最小 diff

先判断任务属于哪类：

- 新能力建设
- 架构演进
- 局部修复
- 调试排障

如果任务跨多个模块、状态流、数据模型、接口边界或工作流，按 feature / phase 思路推进，不把它误当成小修。

## 3. Karpathy 风格工作纪律

### 3.1 Think Before Coding

先理解，再动手。

- 明确写出关键假设
- 如果存在多种合理解释，不要静默选一种
- 如果有更简单的做法，要直接说明
- 如果问题关键处不清楚，先指出不清楚的点

能自己从代码和上下文确认的，不要把问题抛回给用户。只有高风险歧义才问。

### 3.2 Simplicity First

只写解决当前问题所需的最小正确实现。

- 不加未被请求的 feature
- 不为单次使用制造抽象
- 不做“也许以后会用到”的 configurability
- 不为不可能场景堆叠假错误处理

如果实现明显过度设计，应主动收紧。

### 3.3 Surgical Changes

每一处改动都必须能追溯到当前目标。

- 不顺手重写无关代码
- 不顺手清理与当前任务无关的历史债
- 保持现有风格，除非现有结构已经妨碍目标
- 只清理因本次改动而产生的 orphan

### 3.4 Goal-Driven Execution

动手前先把目标变成可验证结果。

推荐写法：

1. 做什么
2. 预期行为是什么
3. 用什么命令或路径验证

没有验证标准，就不算完成。

## 4. Rust-first 硬约束

本项目的长期方向是：**除渲染层与必要 UI 胶水外，尽可能把所有可实现的 backend / runtime authority 持续迁到 Rust。**

默认判断规则：

- 属于运行时能力、产品规则、文件系统、进程、解析、编译、同步、引用、文档状态机、workspace authority 的逻辑：必须优先 Rust
- 属于 UI 渲染、样式、交互反馈、视图层瞬时状态的逻辑：保留前端
- 只要一段逻辑可以稳定放进 Rust，就不要继续留在 Vue / JS

硬约束：

- 禁止新增任何用来承载 backend / runtime logic 的 JavaScript / TypeScript 文件
- 禁止为了迁移或扩展 backend 再新建 JS bridge、runtime、adapter、helper 文件
- 禁止把新的底层权威继续塞进 `src/services/*`、`src/stores/*`、`src/composables/*`
- 禁止制造长期双实现和双权威
- 旧 JS / TS runtime 一旦被 Rust 覆盖，应尽快删除或降权
- Vue 层默认只负责渲染、UI 交互和调用 Rust command，不再承载 backend authority

明确禁止：

- 为 Rust 迁移“临时”新建另一个 JS bridge / runtime / orchestration 文件
- 在 Vue、store、service、composable 中新增未来还要迁走的 backend logic center
- 让同一条规则同时由 Rust 和前端各维护一份真实来源

如果这次没有把可迁移逻辑下沉到 Rust，必须有明确阻塞理由；默认不接受“先放 JS 以后再迁”。

## 5. 架构落点

默认模块职责：

- `src/app`：桌面 shell 生命周期与应用编排
- `src/domains/*`：产品规则与可复用运行时决策
- `src/services/*`：副作用集成层，不做最终业务权威
- `src/stores/*`：响应式状态与轻量协调，保持薄
- `src/components/*`：UI 渲染与用户意图发射
- `src/composables/*`：可复用 UI 胶水
- `src-tauri/*`：Rust backend、文件系统、进程执行、typed desktop boundary

判断规则：

- 能放 `domains` 的，不放组件层
- 能放 Rust 的运行时权威，不留前端
- `stores` 不能继续膨胀成第二套 backend

## 6. 前端护栏

前端不是附属品，但 Vue 不是 backend。

- 保留现有桌面端视觉与交互方向，除非用户明确要求重设计
- 如果必须改前端，优先做一致、稳定、可维护的结果
- 兼顾 mobile、tablet、desktop
- 关注 contrast、focus state、semantic structure、touch target、alt text
- 动效应克制，并尊重 `prefers-reduced-motion`
- Vue 层只负责渲染、UI 状态和用户意图发射；不要继续在这里沉积可迁移的运行时逻辑

默认不为了“全 Rust”去迁移纯 UI 渲染层。

## 7. 文档规则

- 仓库正式文档默认使用中文
- 英文只保留给必要术语、命令、路径、代码标识
- 修改文档时，优先删除过时内容，而不是继续叠加旧上下文
- 新文档必须服务当前系统，不写占位符和空壳计划

## 8. 变更策略

- 先调查，再修改
- 一旦边界明确，就做完整且正确的实现，不停在临时补丁
- 允许分阶段推进，但每个阶段都必须真实减少旧系统权威
- 不做无边界大爆炸重写，除非用户明确要求

Rust 迁移类改动必须回答三个问题：

1. 这次哪些职责迁到了 Rust
2. 哪些旧 JS / TS 实现被删除或降权
3. 剩余未迁部分的阻塞点是什么

## 9. 验证规则

未验证，不说完成。

最低要求：

- 有前端或集成层改动：运行 `npm run build`
- 有 Rust / Tauri 改动：运行 `cargo check --manifest-path src-tauri/Cargo.toml`
- 有对应测试时：运行最贴近改动面的测试

优先原则：

- 运行与改动切片最相关的验证，不只跑最低门槛
- 如果能本地走真实路径，就不要只靠静态阅读
- 无法验证时，必须明确说明缺口和原因

## 10. Git 规则

- 提交信息使用 Conventional Commits
- 不做破坏性 git 操作，除非用户明确要求
- 不回滚用户已有改动
- 只要本轮改动已验证且无安全阻塞，默认自动执行 `git add`、`git commit`、`git push`

自动提交/推送的阻塞条件：

- 远端冲突
- 权限失败
- 未完成必要验证
- 工作区存在需要用户确认的冲突性改动

## 11. 输出要求

全程用中文回答，专业术语保留英文。

默认输出顺序：

1. 结论
2. 关键依据
3. 做了什么
4. 改了哪些文件
5. 如何验证
6. 当前风险和下一步

少空话，少泛化表述，优先给可执行结论。
