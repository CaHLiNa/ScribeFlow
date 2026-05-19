# ScribeFlow 当前状态

最后更新：2026-05-19

## 产品

ScribeFlow 是一个 local-first 的 Tauri 桌面学术写作与研究工作台。

当前桌面主路径：

- 打开、关闭并重新打开本地 workspace
- 浏览和修改 workspace 文件树
- 恢复 editor tabs、document dock tabs 和 recent files
- 编辑 Markdown、LaTeX 和 Python 文档
- 预览 Markdown、编译 LaTeX、查看 PDF 输出并运行 Python
- 管理来自 BibTeX、PDF metadata 和 Zotero 的 references
- 插入 Markdown 和 LaTeX citations
- 将选中文档 references 同步到 LaTeX bibliography files
- 检查 references 在 workspace 中的引用位置
- 配置 editor、workspace、PDF、citation、environment、Zotero、extensions 和 update settings
- 发现本地 plugin packages，启用或禁用它们，并在 Settings 中配置 host-managed plugin settings
- 立即激活已启用 plugins，使 runtime-only commands、menus 和 views 不必等待后续用户操作即可可用
- 通过 host runtime 停用 disabled plugins，让 plugin-local `deactivate()` 逻辑能释放资源，而不是只依赖 frontend state cleanup
- host process 崩溃后自动重启 persistent extension host，使下一次 activation 或 command request 可以恢复，而不必重启桌面应用
- 将 plugin surfaces 渲染为 document right sidebar tabs，从 plugin host 解析 tree roots 和 child nodes，支持 reveal 与 selection events，并展示 host-rendered quick input flows
- 强制每个 plugin 只有一个 activitybar view container，使每个常规 plugin 映射到一个 document right sidebar tab/container
- 默认把 PDF actions、command invocations、capability invocations 和 view reveal requests 路由到对应 plugin-owned right sidebar tab
- 让 document-action plugin tasks 保持显示在同一个 right sidebar tab 内，使运行进度、取消和结果条目在 action 启动后仍可访问
- 将 right-sidebar task surface 拆成父级 timeline/orchestration shell、row presentation component 和 truncated-history footer presentation component，并用 focused probe 守住 scoped style ownership
- 通过 `context.workspace`、`context.documents`、`context.invocation`、`context.references`、`context.pdf` 和 `context.process` 为 plugins 暴露更厚的 runtime APIs
- 允许 process-driven plugins 通过 Rust-backed host bridge `spawn` 本地 workers，并显式 `wait` 等待完成
- end-to-end 支持 `context.window.showQuickPick(..., { canPickMany: true })`，使 plugin quick-pick flows 可以返回 multi-select arrays，而不是只能返回单个值
- end-to-end 支持 `context.window.showQuickPick(...)`，提供稳定的 title/placeholder/picked-default request fields，以及明确的 confirm/cancel result semantics
- 通过 Rust runtime 持久化 plugin `globalState` 和 `workspaceState`，并在后续 activation 中恢复两个 scope
- 通过 host window-message events 暴露 `context.window.showInformationMessage`、`showWarningMessage` 和 `showErrorMessage`，并保持稳定的 severity payloads
- end-to-end 支持 `context.window.showInputBox(...)`，提供稳定的 title/prompt/placeholder/value/password request fields，以及明确的 confirm/cancel result semantics
- 通过 `context.settings.onDidChange(...)` 将 host-managed extension setting changes 传播给已激活 plugins
- 将 schema-declared secure plugin settings 存入 secure host-managed keychain storage，而不是明文 `extension-settings.json`；legacy secret-like keys 在 plugin manifests 声明 `secureStorage` 前仍使用 compatibility fallback
- command palette、PDF preview actions、view title actions 和 view item actions 优先使用 runtime-registered plugin actions
- 通过 `context.references` 和 `context.pdf` 暴露 reference-aware 和 PDF-aware runtime context
- 允许 plugins 通过 Rust-backed host bridge 查询当前 reference library、检查 PDF metadata/text，并运行 permission-gated local processes

## 架构

目标架构是：Vue 3 frontend、TypeScript bridge、Rust backend/runtime。

当前实现状态：

- frontend 已是 Vue 3 + Pinia + Vite，但大部分 frontend/source bridge 仍是 JavaScript。
- TypeScript native bridge authority 迁移已完成：direct `@tauri-apps/*` imports 只允许出现在 `src/services/tauriBridge.ts`。
- `src/services/tauriBridge.ts` 统一封装 Tauri `invoke`、native events、app version、clipboard、dialog、shell 和 window APIs。
- 存量 `src/services/**/*.js` 仍可作为 feature-specific service wrappers / DTO adapters 存在，但它们只能通过 `tauriBridge.ts` 触达 native runtime，不能直接 import Tauri 或 plugins。
- `appUpdater.js`、filesystem/workspace/reference/extension/LaTeX/Python 等 service wrappers 已从 direct `invoke/listen` 切到 TypeScript bridge entrypoint。
- `tsconfig.bridge.json` 和 `npm run verify:bridge` 已加入工程 gate；标准 `npm run verify` 会运行 bridge typecheck。
- boundary guards 已开始覆盖 `.ts` 文件，使后续 TypeScript 迁移仍受 UI bridge / JS-layer boundary 约束。
- 后续如果继续强类型化，可逐步把 JS service wrappers / DTO adapters 改成 `.ts`；这属于 typing hardening，不再是 native bridge authority 迁移的 blocker。

- `src/app`：desktop lifecycle 和 shell orchestration
- `src/components`：Vue UI surfaces
- `src/composables`：UI composition 和 interaction helpers
- `src/domains`：frontend pure rules 和 state transitions
- `src/services`：TypeScript native bridge entrypoint + feature-specific service wrappers / DTO adapters
- `src/stores`：Pinia coordination state
- `src-tauri/src`：Rust backend/runtime authority，负责 filesystem、workspace access、sessions、preferences、references、LaTeX、Python、extensions 和 updates

Canonical layer 表：

| Layer | Responsibility |
| --- | --- |
| Vue 3 frontend | 渲染 product surfaces，接收 props，发出 user intent，展示 loading/error/empty states |
| TypeScript native bridge | `src/services/tauriBridge.ts` owns direct Tauri commands, plugins, native events and app/window/plugin APIs |
| Service wrappers | 存量 `src/services/**/*.js` owns feature-specific DTO compatibility and side effects through `tauriBridge.ts` |
| Pinia coordination | `src/stores` 拥有 screen state、orchestration、loading/error lifecycle 和 service calls |
| Frontend domains | `src/domains` 拥有 pure presentation rules、labels、sorting 和 deterministic state derivation |
| Rust backend/runtime | `src-tauri/src` 拥有 filesystem、workspace state、references、runtime execution、persistence、plugins 和 security |

边界规则：

- Vue components、stores、domains 和 composables 不直接 import Tauri APIs。
- Tauri `invoke`、Tauri plugin calls 和 event bridges 只属于 `src/services/tauriBridge.ts`。
- Rust 拥有 filesystem authority、persisted app state、reference normalization、compile/runtime execution 和 workspace-scoped security checks。
- Rust 拥有 plugin discovery、manifest validation、plugin host startup、command execution、task state 和 artifact access。
- Rust manifest validation 强制常规 plugins 的 single-container right-sidebar contract。
- Vue 拥有 plugin prompt rendering、plugin sidebar rendering、command palette integration，以及通过 `src/services` bridge 进行的 runtime event presentation。
- 前端保持为 thin bridge 和 UI coordination layer，而不是第二套 backend；TypeScript bridge 不能接管 Rust-owned policy。
- `src/domains` 不得获得 native bridge、persistence、filesystem 或 process authority；任何剩余 cleanup debt 都应在 code-adjacent tasks 中追踪，而不是放在 stale planning documents 里。
- Tauri command payload shape 变化必须在同一 commit 中更新 Rust command handling、TypeScript/JS bridge DTO mapping、store call sites 和 regression verification。
- Editor core changes 必须进入独立的 editor-specific phase；global module cleanup 不得改变 cursor、selection、reveal、scroll、CodeMirror behavior、editor session payloads 或 editor event timing。

当前 reference authority 方向：

- Reference cleanup 是 Rust-first：Rust 拥有 reference truth、filesystem authority、persistence、mutation/result normalization、citation/render targets、imports、PDF assets 和 Zotero sync。
- `src/domains/references/referenceStoreState.js` 现在只包含 UI state/display helpers；Rust query DTO readers 单独放在 `src/domains/references/referenceResolvedQueryDto.js`。
- 后续 reference 工作应继续把 JS 收缩到 UI presentation、DTO compatibility、Tauri bridge wrappers 和 short-term Pinia coordination。
- Reference helper classification 应保持 code-adjacent：UI-only helpers 留在 JS domains，DTO compatibility 靠近 service/domain adapters，runtime authority 属于 Rust。

允许/禁止示例：

- 允许：`ReferenceDetailPanel.vue` 编辑 local draft state，`references.js` 通过 `referenceRuntime` 发送一个 mutation request，Rust 校验、normalize 并持久化 reference。
- 禁止：Vue components 直接写 normalized reference records，或复制 Rust-owned merge policy。
- 允许：service wrapper 调用 Tauri command 并映射 camelCase DTOs。
- 禁止：service wrapper 成为 workspace security、reference merging、plugin host lifecycle 或 persisted settings schema 的 policy owner。

Plugin 架构方向：

- runtime registration first
- manifest 作为 bootstrap metadata
- 保留 Rust authority 的 Obsidian-style plugin model
- 当前 platform contract 对 local owner-authored plugins 是 runtime-first；剩余工作是 additive host API growth，而不是方向重置

当前 editor 稳定性契约：

- external file-content sync 在应用 async text-diff patch 前，会用 request version、active editor view identity、current store content 和 unchanged editor document text 做保护。
- local editor cache updates 会让 pending external sync patches 失效，使延迟的 file-content watcher work 不能覆盖更新的 cursor、selection 或 typed document state。
- restored editor session state 会在挂载 panes 或 document dock tabs 前 normalize：stale active pane ids、duplicate dock tabs、invalid active dock tabs 和 out-of-surface `lastContextPath` 会 fallback 到 mounted editor/dock context。
- Markdown preview sync timers 受 lifecycle scope 约束：pending selection timeouts 和 viewport animation frames 会在 editor deactivate/unmount 时失效，并在 dispatch preview sync events 前被后续 cursor/scroll changes supersede。
- Markdown pending forward-sync locations 按 source scope 管理，并在 preview surface unmount 时清除，使后续 remount 不能消费 stale reveal/scroll intent。
- Markdown preview renders 带 lifecycle version：delayed render timers、async file reads 和 async preview renders 在 unmount 后或被更新的 render request supersede 后，不能提交 HTML、preview status 或 pending scroll sync。
- Markdown preview-to-source reveal requests 带 lifecycle version：stale double-click/context-menu reveals 和 unmounted preview surfaces 不能完成延迟的 editor-view wait，从而在更新的 reveal request 后抢走 focus 或 selection。
- LaTeX PDF-to-source reveal requests 带 lifecycle version：stale reverse-sync requests 和 deactivated editor runtimes 不能完成延迟的 editor-view wait，从而在 PDF preview revision 改变或更新的 reveal request supersede 后抢走 focus 或 selection。
- LaTeX source-to-PDF forward-sync requests 带 lifecycle version：stale source cursor requests 和 remounted PDF documents 不能完成延迟的 scroll/highlight frame waits，从而在更新的 forward-sync request supersede 后写入 obsolete overlay 或 queued sync state。
- PDF restore requests 带 lifecycle version：stale restore-state requests 和 remounted PDF documents 不能完成延迟的 frame waits，从而在 document id 或 restore payload 改变后写入 obsolete scroll position、view-state emissions 或 initial paint refresh。
- editor context-menu selection restore 受 lifecycle scope 约束：delayed frame/timeout selection restores 会被更新的 context-menu gestures、menu close、editor deactivation 和 editor unmount 取消，因此旧 context-menu request 不能在更新事件之后写入 stale cursor 或 selection。
- editor reveal highlight clearing 受 lifecycle scope 约束：delayed highlight-clear timers 会被更新的 highlights supersede，并在 editor runtime deactivation 或 CodeMirror view destroy 时取消，因此关闭的 pane 不能收到 stale decoration clear dispatch。
- outline-to-editor focus retries 受 lifecycle scope 约束：pending delayed retries 会被更新的 outline navigation supersede，当 active file 离开 pending target 时取消，并在 panel unmount 时 dispose，因此 stale outline clicks 不能 focus 或 highlight 后续 editor view。
- reference cited-in source focus retries 受 lifecycle scope 约束：pending delayed retries 会被更新的 source clicks supersede，当 citation key、workspace 或 active tab 离开 pending target 时取消，并在 panel unmount 时 dispose，因此 stale reference clicks 不能 focus 或 highlight 后续 editor view。
- diagnostics problem-to-source reveals 受 lifecycle scope 约束：pending delayed source-view waits 会被更新的 problem clicks supersede，当 document 或 active tab 离开 pending target 时取消，并在 panel unmount 时 dispose，因此 stale diagnostics clicks 不能 focus 后续 problem 或 editor view。
- citation palette actions 受 lifecycle scope 约束：pending async document-scope reference adds、imports 和 delayed autofocus 会被更新的 palette actions、prop changes、close 和 unmount supersede，因此 stale palette promises 不能 emit insert/update、surface import errors 或 focus closed inputs。
- 这些只是不改变 cursor/selection、session payload shape，也不引入 automatic reveal/scroll behavior 的 timing 和 restore-state guards。

当前 plugin result 契约：

- plugin runtime 可以从 task、capability 和 view flows 返回 `resultEntries`、`artifacts` 和 `outputs`。
- frontend 仅在 explicit `resultEntries` 留有空缺时，才从 `artifacts` 和 `outputs` 合并 host-generated default preview entries。
- task-owned artifact metadata 绑定到 host invocation envelope。
- direct view 和 pushed view-state artifacts 在表示 view-owned state 而非 task-owned execution state 时，可以保留显式 plugin metadata。

当前 plugin lifecycle 契约：

- 禁用 extension 是真实 authority boundary，而不只是 UI toggle。
- disabled extensions 不能 execute commands、invoke capabilities、resolve views，或接收 view-selection callbacks。
- 禁用已激活 extension 会请求 host-side runtime deactivation，然后清理 frontend runtime/view/controller state。
- 启用 extension 会立即重新激活其 runtime registration，使 runtime-only commands 和 menus 再次可见。
- direct host deactivation 现在有 probe 支撑：`Activate -> Deactivate -> Reactivate` 成功，且可以观察到 plugin `deactivate()` state。
- workspace transition teardown 现在有 probe 支撑：切换或关闭 workspace 会在 frontend session state reset 前停用旧 workspace 拥有的 host runtime slots，因此 stale activation state 不会泄漏到下一个 workspace。
- host-process crash recovery 现在有 probe 支撑：崩溃的 command 会清理 dead process handle，下一次 host request 会重启 persistent runtime 并成功。
- pending window prompt 期间的 host interruption 现在有 probe 支撑：host 死亡时 waiting prompt flows 会 fast-fail，pending UI request 会立即 interrupted，frontend prompt 会清理，而不是残留到 timeout。
- tree-view controller contract 现在有 probe 支撑：`createTreeView(...).onDidChangeSelection(...)` 接收 runtime element payload 和 selected handles，controller `reveal(...)` 保留有序 parent handles，并保留 default/explicit `focus/select/expand` flags。
- quick-pick multi-select 现在有 probe 支撑：picked defaults 会 hydrate 到 prompt，UI selection 可累积多个 items，host roundtrip 会保留 array result payload。
- quick-pick request 和 result semantics 现在有 probe 支撑：host request payload fields 保持稳定，picked defaults 在 request serialization 后仍保留，confirm 返回 selected value，cancel resolve 回 `undefined`。
- settings change contract 现在有 probe 支撑：host updates 会替换 runtime settings snapshot，而不是 merge stale keys；`changedKeys` 包含 updates 和 removals；`event.values` 反映 post-update snapshot；no-op snapshots 不会额外 emit runtime changes。
- process bridge contract 现在有 probe 支撑：`context.process.exec(...)` 默认 cwd 继承 workspace root，`spawn(...).wait()` 保留 pid 和 exit result shape，env vars 跨 Rust bridge，失败 execs 保留 stderr 和 non-zero codes，且 active workspace 外的 cwd requests 会被拒绝。
- references/pdf bridge contract 现在有 probe 支撑：`context.references.current` 和 `context.pdf.current` 保留 invocation `referenceId` 与 active PDF path，`readCurrentLibrary()` 通过 Rust bridge 返回 normalized snapshot，`extractMetadata()`/`extractText()` 解析 active PDF，out-of-scope PDF paths 会以 surfaced runtime error 拒绝。
- workspace/documents/invocation contract 现在有 probe 支撑：`context.workspace`、`context.documents` 和 `context.invocation` 保留 active workspace root、derived resource metadata、target payload 和 empty-state defaults，plugins 不需要手工重建 envelope。
- commands/menu registration contract 现在有 probe 支撑：`context.commands.executeCommand(...)` 可以同步路由到另一个 runtime-registered command 并保留其 result payload，`context.menus.registerAction(...)` 按 surface 保留 runtime action metadata，并从后续 activation snapshots 中清理 disposed actions。
- task update contract 现在有 probe 支撑：`context.tasks.update(...)` 会在 intermediate `running` updates 期间保留 spawned-process ownership，使 `spawn(...).wait()` 仍能 resolve；terminal updates 会回收 runtime pid ownership，但不删除 persisted task record；task `artifacts` / `outputs` 通过 Rust bridge 遵循 replace-on-present semantics。
- view state contract 现在有 probe 支撑：normal view providers 的 `context.views.updateView(...)` 在后续 `ResolveView` refresh 后仍作为 overlay 存活，pushed fields 保持 authoritative，untouched fields 继续从最新 provider baseline refresh。
- nested command contract 现在有 probe 支撑：`context.commands.executeCommand(...)` 保留 callee result payload，将 nested runtime failures 作为 catchable plugin exceptions 暴露，并把 nested `changedViews` 与 host-tracked `views.refresh(...)` requests 做 union。
- lifecycle state contract 现在有 probe 支撑：persisted extension settings、`globalState` 和同 workspace 的 `workspaceState` 会在 `deactivate -> reactivate -> host crash recovery` 中保留，同时 `workspaceState` 按 workspace roots 隔离。
- nested capability contract 现在有 probe 支撑：`context.capabilities.invoke(...)` 保留 callee result payload，将 nested capability failures 作为 catchable plugin exceptions 暴露，把 nested `changedViews` 与 host-tracked `views.refresh(...)` requests 做 union，并把聚合后的 refresh set 通过 top-level capability invocation result 传播出去。
- capability orchestration 现在是有 probe 支撑的一等 runtime contract：一个 capability provider 可以在同一 request 中组合 `tasks.update(...)`、`views.updateView(...)` 和 `views.refresh(...)`，host 会同时保留 running-task snapshot、pushed view state 和 top-level `changedViews` refresh set。
- top-level capability invocations 现在共享 command-style right-sidebar routing contract：matching plugin tab 会在 host activation 和 capability invocation 前带着 active PDF/reference target 打开并聚焦，changed views 仍会 refresh 已打开的 sidebar surface。
- extension task cancellation 现在是有 probe 支撑的一等 runtime contract：取消 running extension task 会复用 formal task API，保留 persisted `cancelled` terminal state，并从 runtime registry 清理 spawned-process ownership。
- extension task cancellation 在 store/UI contract layer 也有 probe 支撑：cancel response 返回后，frontend timeline 会把 task 移出 running bucket，在 recent tasks 中保留 `cancelled` terminal snapshot，并保持最后的 running output payload 可见。
- 禁用 extension 现在也会关闭其 task contract，而不只是移除 execution entrypoints：该 extension 的 active `running`/`queued` tasks 会通过 Rust runtime 取消，spawned-process ownership 会被回收，persisted `cancelled` snapshots 仍可检查，unrelated extensions 保持各自 task ownership 不变。
- 禁用 extension 现在也会关闭 extension-scoped window input flows，而不是让 prompt waits 挂起：该 extension 的 pending `showQuickPick(...)` / `showInputBox(...)` requests 会通过 host bridge 取消，frontend prompt 会立即清理，后续 disable flow 不必等待手工关闭 prompt。
- cross-extension prompt isolation 现在也有 probe 支撑：如果一个 extension 当前拥有 pending host prompt，另一个 extension 的 top-level request 会立即以明确的 owner-specific error 失败，而不是在 prompt wait 后面静默阻塞。
- same-extension prompt reentry 现在也有 probe 支撑：一旦一个 extension 拥有 pending host prompt，该 extension 在 prompt resolved 前仍不能启动第二个 top-level host request，因此 prompt waits 保持 single-flight，而不会递归 deadlock shared host channel。
- frontend consumption layer 的 prompt recovery 现在也有 probe 支撑：如果 `resolveView(...)` 或 `notifyViewSelection(...)` 因 prompt 当前占有 host channel 而 fast-fail，请求会 deferred 到 store 中并在 prompt 关闭后自动 replay，而不是永久丢失；如果后续 host-side transport error 在 flush 中途打断队列，replay 本身仍 non-lossy；来自旧 workspace 的 stale deferred requests 会丢弃，而不会 replay 到后续 workspace。
- prompt recovery descriptor presentation 现在也有 probe 支撑：settings、document-plugin diagnostics 和 command-palette recovery 的 cancel affordances 都从一个 shared descriptor 派生相同的 owner-aware label/title contract，而不是每个 surface 重新拼装 prompt-owner copy。
- workspace transition handling 在 frontend extension-session layer 现在也有 probe 支撑：关闭或切换 workspaces 会 reset frontend extension session state，重新打开 workspace 会强制重新加载 workspace-scoped extension settings 和 registry data，workspace-only plugin discovery/enabled ids 跟随 active workspace，而不会跨 transition 泄漏。
- workspace-scoped extension task visibility 现在也有 probe 支撑：persisted extension tasks 保留 originating `workspaceRoot`，document-plugin task panels 只显示 active workspace 的 tasks，而不会把其他 workspaces 的 same-extension history 混入当前 sidebar。
- workspace-scoped extension task querying 在 Rust authority boundary 也有 probe 支撑：frontend task refreshes 会向 backend 请求 active `workspaceRoot`，backend 只返回该 workspace 的 tasks，而不是在 global task load 后依赖 frontend-only filtering。
- workspace-scoped extension host runtime isolation 在 host authority boundary 也有 probe 支撑：persistent host state 以 `extensionId + workspaceRoot` 为 key，因此 deactivation、pending prompts、settings updates、treeview selection 和 same-extension task cancellation 只影响 active workspace slot，而不会泄漏到 sibling workspaces。
- workspace-scoped host observability 在 frontend store layer 也有 probe 支撑：`extension_host_status` 暴露结构化 `activeRuntimeSlots` 和 `pendingPromptOwner`，prompt open/resolve flows 会实时 resync snapshot，settings 和 document plugin surfaces 都能直接检查 host runtime occupancy，而不是从 freeform error strings 反向解析 prompt-owner 细节。
- 从 frontend settings 重启 host runtime 现在也有 probe 支撑：重启一个 active runtime slot 会通过 host bridge 明确停用该 slot，在同一个 workspace 中重新激活，并 refresh store-level host occupancy，使 runtime card 可以信任更新后的 slot snapshot。
- command-level host blocking UX 现在也已集中：command buttons 和 command palette 都会在 dispatch 前从 shared host diagnostics 派生 blocked/waiting state，inline 显示 owner-aware status labels，并避免在 host 已被 prompt-blocked 时把用户送进可避免的 top-level command errors。
- command dispatch preflight 现在也在 store boundary 强制执行：keybindings、sidebar actions 和 result-entry reruns 都在 activation 或 execution 前查同一份 host blocked/waiting snapshot，为 UI surfaces emit structured warning-grade errors，并避免把注定失败的 top-level command requests 发进 shared host。
- capability dispatch 现在也遵循同一套 host preflight model：settings-surface capability runs 会在 activation 或 invocation 前查同一份 blocked/waiting snapshot，复用 shared warning/error descriptor path，并在 prompt 已占有 channel 时停止向 host 发送 capability requests。
- document-plugin action surfaces 现在也 blocked-aware：sidebar header actions、tree item commands 和 result-entry rerun actions 从 shared runtime block descriptor 派生 disabled state；不 dispatch command 的 expandable tree groups 保持可交互；blocked/waiting labels inline 显示，而不是只在 toast path 之后才出现。
- host-status surface presentation 现在也已共享：settings runtime cards、document-plugin diagnostics 和 command-palette recovery copy 都从一个 shared host-status descriptor 派生 badge/title/description/tone/recovery-owner fields，而不是每个 surface 维护自己的 blocked-versus-waiting 文案。
- host-status surface translation/recovery orchestration 现在也已共享：settings runtime cards、document-plugin diagnostics 和 command-palette recovery 都从一个 shared presentation/composable layer 派生 translated badge/title/description/summary text 以及 prompt-recovery owner wiring，而不是每个 surface 手工拼接 summary strings 和 recovery bindings。
- host-status recovery action contract 现在也有 probe 支撑：这些 surfaces 也消费相同的 `available/busy/label/title/trigger` recovery action shape，因此 cancel-prompt affordances 不再按 surface 独立重组 button state 和 trigger wiring。
- host-status UI shell 现在也已共享：settings runtime cards、document-plugin diagnostics 和 command-palette recovery 都通过一个 shared host-status surface component 渲染，支持 compact/full variants 和 slot-based extension points，而不是维护三套 DOM/CSS shells。
- runtime-block action presentation 现在也已共享：command buttons、sidebar header actions、tree-item actions、result-preview actions 和 command-palette row pills 都从一个 shared presentation helper 派生相同的 blocked/waiting label 与 message rendering，而不是每个 surface 手工翻译 `labelKey/messageKey`。
- runtime-block action button shell 现在也已共享：command buttons、sidebar header actions 和 result-preview actions 都通过一个 shared blocked-action button component 渲染，因此 blocked label/message/disabled/title behavior 不再需要各 surface 自己拼 button markup。
- runtime-block status chip 现在也已共享：command-palette status pills 和 tree primary blocked labels 通过一个 shared blocked-status chip component 渲染，因此 blocked/waiting tone 与 compact-vs-regular label treatment 不再在这些 surfaces 之间漂移。
- tree primary blocked shell 现在也已共享：extension sidebar tree items 不再 inline 手工拼 selected/focused/blocked card chrome，而是通过一个 shared tree-primary button component 渲染，由它拥有 blocked chip placement 和 disabled/title contract。
- sidebar panel status 和 summary shells 现在也已共享：view status pills 和 summary cards 不再保留自己的 local DOM/CSS contracts，而是通过 shared status-pill 和 summary-card components 渲染。
- extension count badges 现在也已共享：document-plugin page headers 和 sidebar view badges 不再保留分离的 count-badge chrome，而是通过一个 shared count-badge component 渲染。
- plugin container presentation 现在也已共享：document-dock plugin tabs 和 document-plugin page headers 从一个 shared container-presentation helper 派生 label/title/description/badge data，而不是各自读取 first-view state 并重新计算 title-plus-badge strings。
- extension sidebar surface ownership 现在已按 Vue component boundary 拆分：`ExtensionSidebarPanel.vue` 保留 refresh/controller/result-action orchestration，`ExtensionSidebarHeader.vue` 拥有 header action/refresh DOM 和 CSS，`ExtensionSidebarViewSection.vue` 拥有 section/result/tree DOM 和 CSS。
- plugin target summary presentation 现在也已共享：document-plugin page headers 从一个 pure presentation helper 派生 path/reference target copy，使 right-sidebar context wording 有 probe 支撑，并远离 component-local branching。
- document-action plugin panels 现在也共享同一套 right-sidebar header contract：PDF action panels 会在 action/task body 前渲染 plugin container title、active target summary 和 host runtime diagnostic surface，而不是使用 one-off button-only panel shape。
- extension task presentation 现在也已共享：right-sidebar task rows 从 pure presentation helpers 派生 title、status tone、row tone、group counts、group tone、timeline density copy、detail collapse defaults、progress copy、progressbar metadata、target facts、result counts、artifact counts、preview/action result groups 和 quick action affordances，而不是重复 running/recent UI branches。
- extension task timelines 现在将 visible/hidden recent counts 暴露为 domain contract：document-plugin task panels 会在 history 截断时显示最新 recent tasks 和 compact older-task footer，允许用户在原地展开或折叠 older task history，并让 action panels 和 task rows 保持在同一个 workspace-scoped timeline 上，而不是漂移到分离的 recent-task slices。
- extension task surface ownership 现在已按 Vue component boundary 拆分：`ExtensionTaskPanel.vue` 保留 timeline/store orchestration 和 expansion/selection state，`ExtensionTaskRow.vue` 拥有 row/detail/progress/result/action DOM 和 CSS，`ExtensionTaskHistoryFooter.vue` 拥有 truncated-history footer DOM 和 CSS。
- workbench rail title ownership 现在已按 Vue component boundary 拆分：`WorkbenchRail.vue` 保留 native fullscreen sync、window dragging、outside-click/Escape lifecycle、menu open state 和 emitted shell intent，`WorkbenchRailTitleArea.vue` 拥有 center title slot、reference mode menu、inline document title 和 title/menu scoped CSS。
- settings surface ownership 现在已按 Vue component boundary 拆分：`Settings.vue` 保留 active-section orchestration，`SettingsSurface.vue` 拥有受 guard 保护的 settings shell/header/content slot 和 shared settings row/group/control CSS，duplicate settings-wide style blocks 已收敛到一个 owner。
- app shell frame ownership 现在已按 Vue component boundary 拆分：`App.vue` 保留 store、workspace lifecycle、active workbench selection、extension prompt/palette orchestration、zen-mode listeners 和 teardown/event bridges，`AppShellFrame.vue` 拥有 root shell/topbar/left-sidebar/main-card/resize-slot DOM 和 scoped shell CSS。
- file tree body ownership 现在已按 Vue component boundary 拆分：`FileTree.vue` 保留 keyboard、drag/drop、context-menu、mutation 和 store orchestration，`FileTreeBody.vue` 拥有 scroll-body DOM、virtual row rendering、root inline-create input、drop/empty state chrome 和 body scoped CSS。
- file tree overlay ownership 现在也已按 Vue component boundary 拆分：`FileTree.vue` 保留 menu state、positioning、document listeners、file mutation 和 workspace/editor orchestration，`FileTreeOverlays.vue` 拥有 context-menu/workspace-menu/new-menu/drag-ghost composition，并只把 menu DOM accessors 暴露回 coordinator。
- file tree action workflow ownership 现在已从 file-tree coordinator 拆出：`FileTree.vue` 保留 menu positioning、overlay lifecycle、virtual row wiring、keyboard dispatch 和 drag/drop wiring，`useFileTreeActions.js` 拥有 inline create/rename/duplicate/delete/reveal/document-dock side effects 以及 file/workspace/editor store dispatch。
- reference workbench detail dock ownership 现在已按 Vue component boundary 拆分：`ReferenceLibraryWorkbench.vue` 保留 reference selection、page activation、tab fallback、resize、import/export 和 context-menu orchestration，`ReferenceLibraryDetailDock.vue` 拥有 inline dock frame、tabbar、active page render slot、empty state 和 detail tab scoped CSS。
- reference workbench main-list ownership 现在也已按 Vue component boundary 拆分：`ReferenceLibraryWorkbench.vue` 保留 import/export、selected-reference、context-menu、sort 和 dock orchestration，`ReferenceLibraryMain.vue` 拥有 toolbar/status/empty/table composition 和 main-list scoped CSS。
- reference action workflow ownership 现在已从 workbench coordinator 拆出：`ReferenceLibraryWorkbench.vue` 保留 selection、dock page activation、resize/layout reconciliation 和 shell composition，`useReferenceLibraryActions.js` 拥有 native import/export dialogs、clipboard copy、toast/status feedback、context-menu action binding 和 reference store action dispatch。
- reference detail PDF action workflow ownership 现在已从 detail coordinator 拆出：`ReferenceDetailPanel.vue` 保留 draft lifecycle 和 save orchestration，`useReferenceDetailActions.js` 通过既有 store/service boundary 拥有 PDF preview/open/reveal/attach action side effects。
- reference detail token workflow ownership 现在也已从 detail coordinator 拆出：`ReferenceDetailPanel.vue` 保留 draft/save queue，`useReferenceDetailTokenActions.js` 通过 callback-based save wiring 拥有 tag input、tag removal、collection removal 和 collection label resolution。
- reference imported-reference commit workflow 现在在 `src/stores/references.js` 内共享：BibTeX/file imports 和 resolved-text imports 复用同一个 snapshot commit/result mapping helper，而 Rust `references_mutation_apply` 仍是 merge 和 duplicate policy authority。
- import/add/update/remove/collection/document-reference/toggle flows 的 reference mutation outcome 现在由 Rust 返回：`references_mutation_apply` 接收当前 `selectedReferenceId`，返回 changed/removed/toggled flags、collection payloads、selected reference payloads 和 preferred selection hints；`src/stores/references.js` 提交返回的 snapshot 并直接消费 `mutation.result`，不再通过 `referenceStoreState.js` 重建 result。
- reference import input preflight 现在也由 Rust 拥有：`mergeImportedReferences` 接收 raw imported payload intent，在 Rust 中把 non-array/empty imports 视作 empty，返回 `emptyImport`、empty result shape 和 preferred selection；当 Rust 返回 empty-import outcome 时，JS 跳过 snapshot commit。
- reference metadata refresh target state 现在也由 Rust 拥有：`src/stores/references.js` 通过 thin Crossref bridge 传入当前 references snapshot 和 `referenceId`，`references_runtime.rs` 解析 target reference，保留 missing-target null semantics，执行 backend metadata lookup 并返回 normalized refreshed record。
- reference PDF asset target resolution 现在也由 Rust 拥有：attach/rename actions 通过 thin `referenceAssets` bridge 传入当前 references snapshot 和 `referenceId`，`references_backend.rs` 选择 target reference，保留 missing-target null semantics，并执行 asset store/rename filesystem work。
- reference removal target 和 Zotero delete side-effect target state 现在也由 Rust 拥有：`removeReference()` 通过 `references_mutation_apply` 发送 raw `referenceId`，Rust 解析 removed reference，返回 `removedReference`、`zoteroDeleteReference`、removed flag 和 preferred selection，JS 只在 Rust 返回 delete target 时调用 Zotero delete。
- reference update mutation changed gating 和 commit preferred-selection fallback 现在来自 Rust mutation outcome。
- reference PDF import target/result state 现在也由 Rust 拥有：`references_mutation_apply(importPdfReference)` 返回 imported snapshot、selected reference id、selected reference payload 和 preferred selection；`importReferencePdf()` 将该 snapshot/id 发送给 `references_asset_store`，并消费 Rust update mutation result，不再使用 `referenceStoreState.js` target/result helpers。
- reference collection/document-reference/toggle mutation state 现在直接来自 Rust：create/rename collection、remove collection、set/add/remove document reference ids 和 toggle collection actions 都消费 `mutation.result`，不再使用 JS result wrappers 或 JS document-reference mutation preflight。
- reference citation-style state 现在也由 domain 派生：citation-style id fallback 和 workspace style-list fallback 位于 `referenceStoreState.js`，`src/stores/references.js` 保留 style registry lookups、workspace scanning 和 user-style registry side effects 于 service/store boundary。
- reference Zotero sync result state 现在也由 Rust 拥有：`references_zotero_sync_persist_with_account` 返回 frontend-ready 的 skipped state、counts、selected reference id、snapshot、sync status 和 last-sync timestamp，`src/stores/references.js` 只应用 snapshots 并赋值返回的 UI state。
- reference citation formatting target lookup 现在由 Rust 拥有：`src/stores/references.js` 通过 thin `formatReferenceCitationById` bridge 传入 `referenceId`、当前 `references` snapshot 和 workspace path，`references_citation.rs` 解析 target，保留 missing-id empty output semantics，并从 Rust-selected reference 渲染。
- reference mutation snapshot commit workflow 现在在 `src/stores/references.js` 内共享：collection、document-reference、reference-record 和 PDF-asset update mutations 复用 `commitReferenceMutationSnapshot()` 处理 snapshot fallback 和 commit options，而 Rust `references_mutation_apply` 仍是 mutation policy authority。
- reference citation usage key derivation 现在也由 domain 派生：从 citation usage index 创建 cited-key set 的逻辑位于 `referenceStoreState.js`，`src/stores/references.js` 保留 public getter surface。
- reference selected target lookup 现在也归 Rust-query：`references_query_resolve` 返回 selected reference、selected collection/tag、reference lookup maps 和 search index，`src/stores/references.js` 只通过 `referenceResolvedQueryDto.js` 读取这些 DTOs，用于 public getters/actions。
- reference document selection lookup 和 available-reference targets 现在也归 Rust-query：`references_query_resolve` 接收 `documentReferenceSelections`，返回 per-document selected ids/references/key lookup，以及 available-reference lists/search index；`referenceResolvedQueryDto.js` 只为现有 synchronous editor/citation APIs 适配这些 Rust DTOs。
- reference search filtering 现在也归 Rust-query：`references_query_search` 接收当前 reference snapshot、document-reference selections、TeX path、query 和 sort key，返回 matching library/document/available reference DTOs 以及 library lookup maps；CitationPalette/DocumentReferencesPanel 通过 `searchReferenceQuery` 消费这些 async results，而不是在 JS 中重建 search haystacks 或同步读取 selected document-reference DTOs。
- reference generated BibTeX sync target resolution 现在也由 Rust 拥有：`syncBibFileForTex()` 将完整 reference snapshot 和 `documentReferenceSelections` 传给 `references_write_bib_file`，Rust 会在写 generated `.bib` 前解析 TeX document 的 selected references。
- reference export target resolution 现在也由 Rust 拥有：BibTeX export 和 JSON export actions 通过 thin `bibtexExport` bridge 传入当前 references snapshot 和 `referenceIds`/`referenceId`，`references_import.rs` 执行 ordered id filtering、BibTeX missing-id skip semantics、JSON target validation 和 exported-count reporting。
- reference lookup readers 现在更窄：`referenceResolvedQueryDto.js` 不再暴露 exact-id helpers（`hasReferenceById` 或 `resolveReferenceById`），也不再包装 selected references；`selectReference()` 存储 raw selection intent 并等待 Rust query normalization，selected reference 直接读取 Rust 返回的 `selectedReference` field，其余 DTO readers 只为 synchronous editor/citation APIs 适配 citation-key/document-reference lookup maps。
- reference sidebar/sort selection guards 现在也归 Rust-query：`setSelectedSection()`、`setSelectedSource()`、`setSelectedCollection()`、`setSelectedTag()` 和 `setSortKey()` 存储 raw user intent，然后让 `references_query_resolve` 返回 canonical section/source/collection/tag/sort keys。
- reference resolved-query hydration 现在也由 Rust-backed：`src/stores/references.js` 不再在 JS 中构造 pending/default query DTO；`referenceResolvedQueryDto.js` 只接受 Rust-returned query DTOs，将返回字段映射回 store selection state，并且不再 fallback 到 prior Pinia query state、current selected-reference id 或 first filtered row。
- reference sidebar selection reconciliation 不再在 JS 中 pre-validate：`src/stores/references.js` 清除 mutually exclusive UI filters，通过 query bridge 发送 raw selected key，并从 Rust hydrate normalized query result。
- reference document-reference mutation derivation 现在也由 Rust 拥有：`setDocumentReferenceIds()`、`addDocumentReference()` 和 `removeDocumentReference()` 将 raw TeX path/reference id intent 传给 `references_mutation_apply`，Rust 在 JS 提交返回 snapshot 前处理 TeX path normalization、non-array id fallback、valid reference pruning、duplicate guards、next-id-list calculation 和 `changed` gating。
- reference PDF dock tab state 现在也由 domain 派生：selected-tab checks、open/close/reset state、stale PDF tab pruning 和 post-snapshot details fallback decisions 位于 `referenceStoreState.js`，`src/stores/references.js` 只应用派生 dock state 并执行 workspace page switch side effect。
- reference cleanup/reset 现在也由 Rust-backed：`referencesStore.cleanup()` 清除 transient UI flags，然后通过 `references_store_state_build` 应用 empty snapshot；workspace close 会在关闭 workspace 前 await 该 cleanup。
- reference store bootstrap shell 现在由 Rust-backed：`referenceStoreState.js` 只构造 synchronous Pinia UI shell，`references_store_state_build` 返回 canonical library/source sections、normalized snapshot fields、selected filter keys、sort key 和 initial resolved query DTO，app startup 会在 workspace reopen 前 hydrate 这些 defaults。
- reference snapshot apply normalization 现在也由 Rust 拥有：`applyLibrarySnapshot()` 将 raw snapshots 发送给 `references_store_state_build`，它会组合 snapshot normalization 和 `references_query_resolve` hydration；JS 只应用返回的 state fields，并把 PDF dock reconciliation 保留为 UI helper。
- update/remove/import/add 的 reference mutation commit selection 现在由 Rust 返回：`src/stores/references.js` 将当前 selection 传入 `references_mutation_apply`，并用返回的 `preferredSelectedReferenceId` commit。
- extension result preview presentation 现在也已共享：result preview surfaces 从一个 pure presentation helper 派生 preview mode、toolbar actions、blocked-action copy、busy keys 和 action-only empty states，而不是把 action branching 留在 Vue preview component 内。
- settings capability cards 现在也消费 shared status pieces：blocked capability badges 通过 shared blocked-status chip 渲染，blocked capability run actions 通过 shared blocked-action button 渲染，ready/unavailable capability states 通过 shared status-pill component 渲染，而不是保留本地第五套 status shell。
- failed extension tasks 现在将 structured results 保持为一等 runtime contract：如果 command/capability 以 `taskState: failed` 结束，persisted task records 仍保留 failure artifact/output snapshot 和 failure-specific progress label，而不是折叠成 error text only。
- failed extension tasks 在 frontend result-flow layer 现在也有 probe 支撑：recent failed tasks 仍生成可 preview 的 result entries，保留 failure summary card，并保持 generic rerun/log follow-up actions 通过 store wiring，即使 plugin 没有显式返回这些 entries。
- cancelled extension tasks 现在也保留 structured terminal results：如果 plugin runtime 返回 `taskState: cancelled`，persisted task records 仍保留 cancel-specific artifacts、inline outputs、custom progress labels、task-log previews 和 rerun actions，而不是折叠成 bare cancelled state。
- runtime state persistence 现在有 probe 支撑：plugin `globalState` 跨后续 host activations 和 workspaces 保留，`workspaceState` 只在 originating workspace root 内恢复。
- window message severity 现在有 probe 支撑：runtime info/warning/error calls 通过 host event bridge 保留 ordering、message text 和 severity classification。
- input box request 和 result semantics 现在有 probe 支撑：host request payload fields 保持稳定，confirm 返回 typed value，cancel resolve 回 `undefined`。

## 验证

使用一个本地 engineering gate：

```sh
npm run verify
```

它会运行：

- `npm run verify:quick`
- `npm run verify:bridge`
- `npm run verify:build`
- `npm run verify:rust`

quick gate 包括：

- `npm run guard:ui-bridges`
- `npm run guard:js-layer-boundaries`
- `npm run guard:pdf-runtime`
- `npm run guard:textmate-runtime`
- `npm run probe:desktop-main-path-runtime-contract`
- `npm run probe:settings-surface-style-ownership`
- `npm run probe:app-shell-frame-style-ownership`
- `npm run probe:workbench-rail-title-style-ownership`
- `npm run probe:file-tree-body-style-ownership`
- `npm run probe:file-tree-overlay-style-ownership`
- `npm run probe:file-tree-actions-boundary`
- `npm run probe:reference-store-state-contract`
- `npm run probe:reference-store-import-workflow-contract`
- `npm run probe:reference-store-mutation-commit-contract`
- `npm run probe:reference-store-export-workflow-contract`
- `npm run probe:reference-detail-actions-boundary`
- `npm run probe:reference-detail-token-actions-boundary`
- `npm run probe:reference-workbench-detail-dock-style-ownership`
- `npm run probe:reference-workbench-main-style-ownership`
- `npm run probe:reference-library-actions-boundary`

`probe:desktop-main-path-runtime-contract` 会创建 isolated temporary workspace，并通过 Rust-backed main-path contract 跑过 workspace open/bootstrap、scoped file tree loading、Markdown heading extraction、Markdown preview action/state resolution、LaTeX graph/preview planning、Python file execution、reference library mutation/persistence/query/citation rendering、workspace extension discovery 和 workspace close scope cleanup。它是 runtime contract smoke，不替代由用户判断的 desktop visual 或 interaction review。

extension gate 包括：

- `npm run probe:extension-host`
- `npm run probe:extension-markdown-host`
- `npm run probe:extension-view-result-entries`
- `npm run probe:extension-pdf-view-result-entries`
- `npm run probe:extension-direct-view-host`
- `npm run probe:extension-view-state-contract`
- `npm run probe:extension-execute-command-contract`
- `npm run probe:extension-capability-execution`
- `npm run probe:extension-capability-schema`
- `npm run probe:extension-activation-guards`
- `npm run probe:extension-permission-guards`
- `npm run probe:extension-disable-guards`
- `npm run probe:extension-disable-cancels-running-task-contract`
- `npm run probe:extension-disable-cancels-running-task-store-contract`
- `npm run probe:extension-disable-window-input-contract`
- `npm run probe:extension-disable-window-input-store-contract`
- `npm run probe:extension-cross-extension-prompt-isolation-contract`
- `npm run probe:extension-same-extension-prompt-reentry-contract`
- `npm run probe:extension-prompt-recovery-store-contract`
- `npm run probe:extension-prompt-recovery-workspace-scope-contract`
- `npm run probe:extension-prompt-recovery-descriptor-contract`
- `npm run probe:extension-host-status-surface-contract`
- `npm run probe:extension-host-status-presentation-contract`
- `npm run probe:extension-host-status-recovery-action-contract`
- `npm run probe:extension-host-status-surface-component-contract`
- `npm run probe:extension-runtime-block-presentation-contract`
- `npm run probe:extension-blocked-action-button-contract`
- `npm run probe:extension-blocked-status-chip-contract`
- `npm run probe:extension-tree-primary-button-contract`
- `npm run probe:extension-sidebar-panel-status-contract`
- `npm run probe:extension-count-badge-contract`
- `npm run probe:extension-plugin-container-presentation-contract`
- `npm run probe:settings-extensions-capability-card-contract`
- `npm run probe:extension-workspace-switch-refresh-contract`
- `npm run probe:extension-enable-activation`
- `npm run probe:extension-deactivation-host`
- `npm run probe:extension-runtime-restart-store-contract`
- `npm run probe:extension-host-status-store-contract`
- `npm run probe:extension-command-host-state-contract`
- `npm run probe:extension-command-dispatch-preflight-store-contract`
- `npm run probe:extension-capability-dispatch-preflight-store-contract`
- `npm run probe:extension-action-surface-state-contract`
- `npm run probe:extension-secure-settings-bridge`
- `npm run probe:extension-settings-change-contract`
- `npm run probe:extension-process-contract`
- `npm run probe:extension-reference-pdf-contract`
- `npm run probe:extension-invocation-contract`
- `npm run probe:extension-command-menu-contract`
- `npm run probe:extension-task-contract`
- `npm run probe:extension-task-workspace-scope-contract`
- `npm run probe:extension-task-backend-workspace-scope-contract`
- `npm run probe:extension-task-cancel-contract`
- `npm run probe:extension-task-cancel-store-contract`
- `npm run probe:extension-task-cancelled-result-contract`
- `npm run probe:extension-task-failed-result-contract`
- `npm run probe:extension-task-failed-store-preview-contract`
- `npm run probe:extension-lifecycle-state-contract`
- `npm run probe:extension-capability-invoke-contract`
- `npm run probe:extension-capability-orchestration-contract`
- `npm run probe:extension-capability-sidebar-routing`
- `npm run probe:extension-sidebar-routing`
- `npm run probe:extension-document-action-task-surface`
- `npm run probe:extension-sidebar-surface-style-ownership`
- `npm run probe:extension-task-surface-style-ownership`
- `npm run probe:extension-text-preview-fallback`
- `npm run probe:extension-artifact-preview-entries`
- `npm run probe:extension-task-timeline`
- `npm run probe:extension-host-recovery`
- `npm run probe:extension-window-interruption`
- `npm run probe:extension-host-ui-interruption`
- `npm run probe:extension-treeview-contract`
- `npm run probe:extension-quickpick-multiselect`
- `npm run probe:extension-window-prompt-multiselect`
- `npm run probe:extension-quickpick-host-multiselect`
- `npm run probe:extension-quickpick-contract`
- `npm run probe:extension-host-state-persistence`
- `npm run probe:extension-window-message-severity`
- `npm run probe:extension-inputbox-contract`
- `npm run build`
- `npm run check:bundle`
- `npm run check:rust`
- `npm run test:rust`

当前 baseline：

- UI bridge guard 通过
- PDF runtime boundary guard 通过
- TextMate runtime boundary guard 通过
- extension host runtime probe 通过
- extension markdown host probe 通过
- extension view result-entry merge probe 通过
- extension PDF view result-entry merge probe 通过
- extension direct-view host probe 通过
- extension view-state contract probe 通过
- extension nested command contract probe 通过
- extension capability execution probe 通过
- extension capability schema probe 通过
- extension activation guard probe 通过
- extension permission guard probe 通过
- extension disable guard probe 通过
- extension disable-cancels-running-task runtime probe 通过
- extension disable-cancels-running-task store contract probe 通过
- extension disable-window-input runtime probe 通过
- extension disable-window-input store contract probe 通过
- extension cross-extension prompt isolation probe 通过
- extension same-extension prompt reentry probe 通过
- extension prompt recovery store contract probe 通过
- extension prompt recovery workspace-scope contract probe 通过
- extension prompt recovery descriptor contract probe 通过
- extension host-status surface contract probe 通过
- extension host-status presentation contract probe 通过
- extension host-status recovery action contract probe 通过
- extension host-status surface component contract probe 通过
- extension runtime-block presentation contract probe 通过
- extension blocked-action button contract probe 通过
- extension blocked-status chip contract probe 通过
- extension tree primary button contract probe 通过
- extension sidebar panel status contract probe 通过
- extension count badge contract probe 通过
- extension plugin container presentation contract probe 通过
- extension target presentation contract probe 通过
- extension task presentation contract probe 通过
- extension result preview presentation contract probe 通过
- settings extensions capability card contract probe 通过
- extension workspace switch refresh contract probe 通过
- extension enable activation probe 通过
- extension deactivation host probe 通过
- extension runtime restart store contract probe 通过
- extension host status store contract probe 通过
- extension command host-state contract probe 通过
- extension command dispatch preflight store contract probe 通过
- extension capability dispatch preflight store contract probe 通过
- extension action surface state contract probe 通过
- extension secure settings bridge probe 通过
- extension settings change contract probe 通过
- extension process bridge contract probe 通过
- extension references/pdf bridge contract probe 通过
- extension workspace/documents/invocation contract probe 通过
- extension commands/menu registration contract probe 通过
- extension task update contract probe 通过
- extension task workspace-scope contract probe 通过
- extension task backend workspace-scope contract probe 通过
- extension task cancel contract probe 通过
- extension task cancel store contract probe 通过
- extension task cancelled result contract probe 通过
- extension task failed result contract probe 通过
- extension task failed store preview contract probe 通过
- extension lifecycle state contract probe 通过
- extension nested capability contract probe 通过
- extension capability orchestration contract probe 通过
- extension sidebar routing probe 通过
- extension text preview fallback probe 通过
- extension artifact preview mapping probe 通过
- extension task timeline probe 通过
- extension host recovery probe 通过
- extension window interruption probe 通过
- extension host UI interruption probe 通过
- extension tree-view controller contract probe 通过
- extension quick-pick multiselect logic probe 通过
- extension window prompt multiselect probe 通过
- extension quick-pick host multiselect probe 通过
- extension quick-pick contract probe 通过
- extension host state persistence probe 通过
- extension window message severity probe 通过
- extension input box contract probe 通过
- Vite build 通过
- bundle budget 通过
- Rust check 通过
- Rust tests 通过：355 tests

隔离桌面启动 baseline：

- `npm run tauri:dev:isolated` 在 `http://127.0.0.1:1420/` 启动 Vite
- Tauri process 启动 `target/debug/scribeflow`
- Rust app-dir logs 确认 `get_global_config_dir=/private/tmp/scribeflow-tauri-dev`
- 本次 baseline refresh 未执行 manual workspace smoke

Desktop feel、visual layout 和 interaction quality 由用户手工判断。

## 运行时契约

重型 runtime 边界：

- PDFium / EmbedPDF 留在 PDF preview surfaces 和 `src/services/pdf/*` 后面。
- TextMate / Oniguruma 留在 LaTeX editor dynamic import path 后面。
- Ordinary JS chunks 保持在 `scripts/check-bundle-budget.mjs` 强制的 bundle budget 以下。

状态契约：

- workspace lifecycle state 存储在 global ScribeFlow config directory 下
- workspace-specific state 存储在 resolved workspace data directory 下
- reference library state 存储在 global ScribeFlow references data 下
- old localStorage 和 old per-workspace migration paths 不再属于 runtime contract

## 当前范围

已完成的 engineering 范围：

- research-to-writing reference loop
- citation insertion 和 usage inspection
- read-only parsing、diagnostics、path status 和 resolver seams 的 leaf Rustification
- bundle size 和 heavy runtime loading guards
- historical migration code cleanup
- current documentation 和 agent contract 重写

不在范围内：

- 恢复已删除的 `docs/` 或 `web/` trees
- 重新引入 historical sidecar scripts
- 添加 automated desktop smoke、visual review 或 interaction QA
- 没有新 phase decision 时，继续 Rustification 到 editor shell、shared workflow 或 UI-local parser code
