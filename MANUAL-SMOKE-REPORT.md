# ScribeFlow Manual Smoke Report

Last updated: 2026-05-12

## Environment

- Repository: `/Users/math173sr/Documents/GitHub/ScribeFlow`
- Branch: `main`
- Baseline commit before this report: `74c322ab docs: refresh project state baseline`
- Desktop command: `npm run tauri:dev:isolated`
- Frontend URL: `http://127.0.0.1:1420/`
- Isolated data root: `/private/tmp/scribeflow-tauri-dev`
- Disposable workspace prepared for this smoke: `/private/tmp/scribeflow-smoke-workspace`

## Workspace Used

The smoke workspace was created outside the user's real research folders:

- `/private/tmp/scribeflow-smoke-workspace/smoke.md`
- `/private/tmp/scribeflow-smoke-workspace/main.tex`
- `/private/tmp/scribeflow-smoke-workspace/references.bib`

The files are intentionally small and disposable.

## Steps Passed

- `npm run verify` passed before this smoke report was written.
- `npm run tauri:dev:isolated` started Vite on `http://127.0.0.1:1420/`.
- The Tauri dev command launched `target/debug/scribeflow`.
- Process inspection showed `SCRIBEFLOW_DATA_ROOT=/private/tmp/scribeflow-tauri-dev` on the running dev process.
- `curl -I http://127.0.0.1:1420/` returned `HTTP/1.1 200 OK`.
- The disposable smoke workspace exists and contains Markdown, LaTeX, and BibTeX files.

## Issues Found

No code-level blocker was found in this shell/process/http smoke layer.

The following product-path checks were not completed in this run because they require real GUI interaction with the desktop app and workspace picker:

- open the disposable workspace through the Tauri file dialog
- browse file tree inside the app
- create a Markdown file from the UI
- edit text and judge cursor, selection, and scroll behavior
- preview Markdown inside the app
- compile LaTeX from the app
- open a PDF preview from the app
- import or edit a reference from the UI
- insert a citation into Markdown or LaTeX
- save one harmless Settings preference
- enable or disable an extension from Settings
- close and reopen the workspace and judge restored tabs/layout/reference state

An attempted automated browser interaction path was not used because this checkout does not currently have the `playwright` package installed. Since this is a Tauri desktop workflow, a browser-only DOM check would not replace the native file picker, editor focus, or desktop window behavior anyway.

## Fixes Applied In This Batch

No source fixes were applied. This batch only records the current smoke evidence and manual GUI coverage gap.

## Issues Deferred

- Manual desktop smoke must be performed in the actual Tauri window for editor cursor/selection/scroll quality.
- The full workspace main path should be checked against a real or disposable workspace through the native file dialog.
- If the workspace starter visual refresh is judged visually heavy in the actual desktop shell, handle it in the UI polish batch rather than mixing that work into runtime smoke.

## Verification Evidence

Commands executed:

```sh
npm run verify
npm run tauri:dev:isolated
lsof -nP -iTCP:1420 -sTCP:LISTEN
pgrep -fl 'target/debug/scribeflow|tauri dev|vite --host 127.0.0.1 --port 1420'
curl -sS -I http://127.0.0.1:1420/
```

Observed results:

- `npm run verify` passed.
- Rust tests passed: `225 passed; 0 failed`.
- Vite served `HTTP/1.1 200 OK` on port `1420`.
- `target/debug/scribeflow` was launched by the Tauri dev command.
- The running dev process included `SCRIBEFLOW_DATA_ROOT=/private/tmp/scribeflow-tauri-dev`.

## Current Conclusion

The automated and shell-observable startup baseline is healthy. The full desktop product path still needs manual GUI smoke before claiming the end-to-end academic workflow is fully checked.
