# Runtime Authority 审计

## Workspace Authority

- Rust owns: persisted preferences、lifecycle state、normalized defaults、recent workspace 去重与裁剪、打开工作区后的 `lastWorkspace` / `recentWorkspaces` 更新。
- Frontend owns: DOM apply、transient settings panel state、workspace picker / setup wizard UI、optimistic patch 与失败回滚。
- To delete: browser preview write path、duplicate local normalize helpers、前端 recents mutation 规则。

## 当前读写链路

调查命令：

```bash
rg -n "loadWorkspacePreferences|saveWorkspacePreferences|loadWorkspaceLifecycleState|saveWorkspaceLifecycleState" src
```

当前结论：

- `src/stores/workspace.js` 调用 workspace preferences / lifecycle bridge，并负责 optimistic state。
- `src/services/workspacePreferences.js` 调用 `workspace_preferences_load` / `workspace_preferences_save`，同时保留 DOM 字体与 theme apply helpers。
- `src/services/workspaceRecents.js` 调用 `workspace_lifecycle_load` / `workspace_lifecycle_save`，迁移后还会调用 Rust 的 workspace-opened mutation command。
- legacy `localStorage` snapshot 只作为一次性 migration input，不再作为桌面端权威。

