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

- `npm run build`
- `npm run check:rust`
- `npm run test:rust`

如果改动影响桌面主路径，优先补真实 Tauri smoke；做不到时要明确说明缺口。

## 6. Git 规则

- 提交信息使用 Conventional Commits
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
