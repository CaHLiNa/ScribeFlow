# ScribeFlow AGENTS.md

适用范围：整个仓库。

## 0. 当前仓形

这是一个精简后的最小桌面版仓库。

保留重点：

- `src/`：Vue 前端
- `src-tauri/`：Tauri / Rust runtime
- `package.json`、`vite.config.js`、`index.html`：frontend build contract

已不再保留：

- `web/`
- `docs/`
- 历史 release automation
- 非运行必需的自托管字体与外围脚本

所以修改前优先直接读代码，不要假设还有额外文档或 sidecar 项目。

## 1. 项目目标

ScribeFlow 是一个本地优先的桌面学术研究工作台。主产品是 Tauri 桌面应用。

当前最小闭环：

- 打开本地项目目录
- 浏览文件树
- 编辑 Markdown / LaTeX / Python 文档
- 进行基础预览、引用与编译相关工作流

## 2. 默认工作方式

- 先读代码和配置，再修改
- 优先保持桌面主路径可运行
- 不为了补回历史仓结构而引入无关文件
- 能删掉失效依赖就删，不能删的才补最小 contract

## 3. Rust-first 约束

- runtime authority、文件系统、编译、引用、workspace 规则优先 Rust
- Vue 层负责渲染、交互、短期状态和 Rust command 调用
- 不新增新的前端 backend center

### 3.1 Rustification 迁移纪律

- 不追求“理论上完全无风险”的 Rust 化；目标是把风险压到最低，并且让回退边界始终清楚
- 先冻结 contract，再做 Rust 化；默认不得随手改变：
  - Tauri command 名称
  - command 参数 / 返回 JSON shape
  - store getter / action 的输入输出
  - session / preference 持久化结构
  - preview / sync 事件名与 payload
  - `package.json` 依赖集合
- 优先 Rust 化 leaf capability，不先动 shared workflow；优先顺序：
  - 文件创建 / 只读解析 / diagnostics / autocomplete 数据 / preview target resolve
  - 默认不要先动 `TextEditor.vue`、`EditorPane.vue`、`PaneContainer.vue`、`App.vue`、`src/stores/documentWorkflow.js`
- 一次 phase 只迁一个 seam；不要把 runtime、bridge、store、editor UI、session persistence 混在同一提交里一起迁
- 允许 Rust 和旧 JS 并行一段时间；新 Rust 实现先做 parity compare，不先立刻删旧 JS
- JS bridge 可以保留，但必须保持“薄桥”性质；Rust 上位时，前端可见的数据 shape 默认不变
- 如果一个 Rustification phase 需要同时改 `package.json`、command surface、shared store，默认拆 phase，而不是强行一起提交
- `documentWorkflow` 视为 shared layer，默认冻结；未先证明 parity，不得把 Markdown / LaTeX / Python 的共享编排层一起改掉
- `TextEditor` / `EditorPane` / `PaneContainer` / app shell 不得与共享 runtime 迁移同 phase 改动；必须拆开验证
- 删除旧 JS 之前，先证明新 Rust 路径在当前功能面上和旧实现一致；没有 parity 证据，不得把旧实现当作“可删除”
- 对桌面主路径，默认不信任 HMR；每个 Rustification step 验收时，至少要看一次干净重启后的新实例，不只看热更新窗口
- 如果回退，只回退当前 seam；不要为了修一个 leaf 问题把 shared workflow、editor shell、runtime registry 一起拖回旧状态

### 3.2 Rustification 验收清单

- 每个 Rustification step 至少确认这些真实行为没有被带坏：
  - 打开 `.md`
  - 打开 `.tex`
  - 打开 `.py`
  - toolbar 是否仍然出现
  - Markdown preview toggle
  - LaTeX compile
  - Python run / terminal preview
  - 切文件 / 关 tab / 重启后恢复
- 没做完上述关键路径检查前，不得宣称“Rust 化完成”

默认模块职责：

- `src/app`：桌面编排
- `src/domains/*`：前端纯规则
- `src/services/*`：副作用桥接
- `src/stores/*`：响应式状态协调
- `src-tauri/src/*`：Rust runtime authority

## 4. 精简仓原则

- 优先保留运行必需文件
- 删除已失效的 workflow、资源引用和历史壳层
- 不保留会误导后续维护者的假入口、假脚本、假文档
- 如果某项能力被精简掉，要同时清掉对应引用链

## 5. 验证规则

未验证，不说完成。

最小验证基线：

- `npm run verify`
- `npm run build`
- `npm run check:rust`
- `npm run test:rust`

桌面主路径、视觉质量、布局手感和交互体验由用户手工判断。不要再建议新增自动化 Tauri smoke、自动化视觉评审、自动化交互验收或相关 checklist；这类验证不作为 Codex 后续工作建议。

可以继续关注可量化工程项，例如 bundle size、chunk 拆分、构建耗时、Rust test 覆盖和 bridge boundary guard。

## 6. Git 规则

- 提交信息使用 Conventional Commits
- 每次完成代码、文档、配置或数据结构修改后，默认必须提交并推送当前分支；如果因为网络、权限、远端状态或用户明确要求不能提交/推送，必须在最终说明里写清楚原因和未完成的 git 状态
- 提交前必须确认 `git status`，只 stage 本次任务相关文件；不得把用户已有无关改动混进提交
- 推送前必须完成与改动风险匹配的验证；未验证不得为了满足提交推送规则而强行提交
- 不做破坏性 git 操作，除非用户明确要求
- 不回滚用户已有改动

## 7. 输出要求

全程用中文回答，专业术语保留 English。

默认输出顺序：

1. 结论
2. 关键依据
3. 做了什么
4. 改了哪些文件
5. 如何验证
6. 当前风险和下一步
