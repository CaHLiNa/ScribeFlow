# ScribeFlow AGENTS.md

适用范围：整个仓库。

## 当前仓形

ScribeFlow 是一个精简后的 Tauri 桌面应用仓库。当前保留：

- `src/`：Vue frontend
- `src-tauri/`：Tauri / Rust runtime
- `scripts/`：工程验证、bundle guard、版本和发布辅助脚本
- `.github/workflows/release-installers.yml`：桌面安装包发布 workflow
- `package.json`、`vite.config.js`、`index.html`：frontend build contract

不要假设仓库里还有旧 `docs/`、旧 `web/` 或历史 sidecar 项目。历史说明文档已删除，当前事实以 `README.md`、`CURRENT-STATE.md` 和代码为准。

## 产品目标

ScribeFlow 是本地优先的桌面学术研究工作台。主路径是：

- 打开本地 workspace
- 浏览和编辑 Markdown / LaTeX / Python 文件
- 预览 Markdown、编译 LaTeX、查看 PDF、运行 Python
- 管理 reference library
- 从 PDF / BibTeX / Zotero 导入参考文献
- 插入和追踪 Markdown / LaTeX citation

## 架构边界

- Rust 是 runtime authority，负责 filesystem、workspace access、持久化状态、reference normalization、LaTeX/Python runtime、PDF/reference asset handling 和安全边界。
- Vue 负责 UI rendering、交互和短期界面状态。
- `src/services` 是 Tauri bridge 和副作用边界。
- `src/domains` 只放纯规则和状态转换。
- `src/stores` 负责 Pinia coordination，不直接成为 backend。

硬规则：

- `src/components`、`src/stores`、`src/domains`、`src/composables` 不直接 import Tauri API。
- Tauri `invoke`、plugin 调用和 native event bridge 只放在 `src/services`。
- 不新增第二套 frontend backend center。
- 不恢复旧 migration / localStorage / per-workspace historical data paths，除非用户明确要求做数据救援。

## Rust-first 开发纪律

- 优先保持桌面主路径可运行。
- 新 runtime capability 优先落在 Rust，前端保持 thin bridge。
- 不随手改变 Tauri command 名称、参数 shape、返回 JSON shape、store action contract 或 persisted state shape。
- `documentWorkflow`、editor shell、session persistence 和 UI chrome 是 shared layer；没有明确 phase，不和 leaf runtime migration 混在一起改。
- 剩余 UI-local parser 不作为默认 Rustification 对象，例如 CodeMirror decorations、Markdown table editing、snippet trigger、CSV preview parsing 和 DOM preview transforms。

## 验证规则

未验证，不说完成。

标准工程 gate：

```sh
npm run verify
```

它包含：

- UI bridge boundary guard
- PDF runtime boundary guard
- TextMate runtime boundary guard
- Vite build
- bundle budget check
- Rust check
- Rust tests

桌面手感、视觉布局和交互体验由用户手工判断；不要再建议新增自动化 Tauri smoke、自动化视觉评审或自动化交互验收。

## Git 规则

- 提交信息使用 Conventional Commits。
- 每次完成代码、文档、配置或数据结构修改后，默认提交并推送当前分支。
- 提交前先看 `git status`，只 stage 本次任务相关文件。
- 推送前完成与改动风险匹配的验证。
- 不执行破坏性 git 操作，除非用户明确要求。
- 不回滚用户已有修改。

## 输出要求

全程用中文回答，专业术语保留 English。

完成任务时说明：

1. 做了什么
2. 改了哪些文件
3. 如何验证
4. 当前风险和下一步
