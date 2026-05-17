# ScribeFlow Manual Smoke Report

Last updated: 2026-05-18

## Environment

- Repository: `/Users/math173sr/Documents/GitHub/ScribeFlow`
- Branch: `main`
- Baseline commit before this report: `b4297ee6 fix(security): harden preview sandbox and dependency advisories`
- Desktop command: `npm run tauri:dev:isolated`
- Frontend URL: `http://127.0.0.1:1420/`
- Isolated data root: `/private/tmp/scribeflow-tauri-dev`
- Disposable workspace: `/private/tmp/scribeflow-smoke-workspace`
- Smoke evidence screenshots: `/private/tmp/scribeflow-smoke/`

## Workspace Used

The smoke workspace was created outside the user's real research folders:

- `/private/tmp/scribeflow-smoke-workspace/smoke.md`
- `/private/tmp/scribeflow-smoke-workspace/main.tex`
- `/private/tmp/scribeflow-smoke-workspace/references.bib`
- `/private/tmp/scribeflow-smoke-workspace/.scribeflow/extensions/example-markdown-extension`
- `/private/tmp/scribeflow-smoke-workspace/.scribeflow/extensions/example-pdf-extension`

The files and workspace-local example extensions are intentionally small and disposable.

## Steps Passed

- `npm run tauri:dev:isolated` started Vite on `http://127.0.0.1:1420/` and launched `target/debug/scribeflow`.
- The running desktop process used `SCRIBEFLOW_DATA_ROOT=/private/tmp/scribeflow-tauri-dev`.
- `curl -I http://127.0.0.1:1420/` returned `HTTP/1.1 200 OK`.
- The native folder picker opened `/private/tmp/scribeflow-smoke-workspace`, and `workspace-lifecycle.json` recorded it as `lastWorkspace`.
- The app completed onboarding and reached the main workspace UI.
- The file tree showed the disposable Markdown, LaTeX, BibTeX, generated PDF, and LaTeX build artifact files.
- `smoke.md` opened with Markdown editor plus right preview, and a clipboard-pasted edit autosaved to disk.
- The Markdown citation palette appeared for `@doe`, resolved `Jane Doe (2026) - Smoke Reference`, and inserted `[@doe2026]`; the file persisted the insertion.
- `main.tex` opened with LaTeX editor plus right preview controls.
- Clicking Compile produced `main.pdf` and `main.synctex.gz`, and `document-workflow-state.json` recorded the PDF artifact path and SyncTeX path.
- The app opened the generated PDF in the embedded PDF preview.
- Reference Library opened from the workspace title menu.
- BibTeX import loaded `/private/tmp/scribeflow-smoke-workspace/references.bib`, showed `Smoke Reference / Jane Doe / 2026 / Journal of Smoke Tests`, and persisted it in `/private/tmp/scribeflow-tauri-dev/references/library.json`.
- Settings opened from the workspace footer button.
- Toggling `Reopen last workspace on launch` wrote `false` to `workspace-lifecycle.json`; toggling it again restored `true`.
- The Extensions Settings page opened.
- After adding workspace-local example extensions and clicking refresh, Settings discovered `Example Markdown Extension` and `Example PDF Extension` with `workspace` scope.
- `/private/tmp/scribeflow-tauri-dev/extension-settings.json` persisted both enabled ids: `example-markdown-extension` and `example-pdf-extension`.
- Restarting `npm run tauri:dev:isolated` restored the isolated data root, workspace lifecycle, reference library, and extension settings.

## Issues Found

- A stale or incorrectly entered native folder picker path can leave the app on the previous workspace. The corrected path opened successfully, so this was operator input rather than a code blocker.
- AppleScript typing with the active Chinese input method can produce invalid test text. Clipboard paste gave a clean autosave path; this is an automation/input-method constraint, not a ScribeFlow save bug.
- The Settings sidebar and embedded WebView expose limited useful accessibility labels through macOS AX after some transitions. Visual smoke and persisted files were used as the final evidence for those UI paths.
- The workspace-local extension discovery smoke requires extensions under the active workspace's `.scribeflow/extensions`, not the repository checkout's `.scribeflow/extensions`.

No product-path blocker was found in this desktop smoke round.

## Fixes Applied In This Batch

No source fixes were applied. This batch updates the smoke report with verified desktop evidence.

## Issues Deferred

- The right-sidebar plugin usage surface should get a follow-up manual pass that opens a plugin-owned document sidebar tab and exercises one runtime action from the active Markdown/PDF target.
- Editor cursor, selection, scroll, and reveal timing still need a dedicated editor-specific phase before making deeper editor claims.
- This smoke covered small disposable files only; large real workspaces, large PDFs, long LaTeX projects, and multi-file citation workflows still need separate performance/UX passes.

## Verification Evidence

Commands and checks executed:

```sh
npm run tauri:dev:isolated
ps -axo pid,ppid,command | rg 'scribeflow|tauri|vite'
curl -sS -I http://127.0.0.1:1420/
cat /private/tmp/scribeflow-tauri-dev/workspace-lifecycle.json
cat /private/tmp/scribeflow-tauri-dev/references/library.json
cat /private/tmp/scribeflow-tauri-dev/extension-settings.json
cat /private/tmp/scribeflow-smoke-workspace/smoke.md
```

Observed persisted state:

- `workspace-lifecycle.json` restored `/private/tmp/scribeflow-smoke-workspace` as `lastWorkspace`.
- `references/library.json` contains `doe2026` with title `Smoke Reference`, author `Jane Doe`, source `Journal of Smoke Tests`, and year `2026`.
- `document-workflow-state.json` contains `main.tex -> main.pdf` and `main.synctex.gz`.
- `extension-settings.json` contains both workspace-local example extension ids.
- `smoke.md` contains `Citation palette insertion smoke: [@doe2026]`.

Screenshots captured under `/private/tmp/scribeflow-smoke/` include:

- `open-smoke-md.png`
- `smoke-md-clipboard-edited.png`
- `after-real-latex-compile.png`
- `after-open-pdf-preview.png`
- `reference-library-imported.png`
- `settings-open-attempt-2.png`
- `settings-extensions-refreshed.png`
- `restart-restored.png`

## Current Conclusion

The desktop main path is now smoke-checked end to end for disposable workspace open, Markdown edit/preview, citation palette insertion, LaTeX compile, PDF preview, BibTeX import, Settings persistence, workspace-local extension discovery, and isolated restart persistence. The next highest-value gap is plugin usage inside the document right sidebar, followed by a dedicated editor stability pass.
