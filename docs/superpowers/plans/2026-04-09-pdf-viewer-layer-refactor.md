# PDF Viewer Layer Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the embedded PDF artifact viewer into a LaTeX-Workshop-style viewer layer with clearer runtime seams, stable document refresh behavior, and an Altals-native toolbar.

**Architecture:** Keep the Tauri host bridge in the app layer and move PDF viewer behavior into focused modules under `public/pdf-viewer/`. Let PDF.js remain the rendering engine, use a small Altals host protocol for document loading and SyncTeX, and keep the viewer UI local to the iframe instead of leaking PDF.js chrome assumptions into the main app. Borrow LaTeX-Workshop’s viewer-side lifecycle split (`init`, `gui`, `refresh`, `state`, `synctex`) without importing its VS Code host layer.

**Tech Stack:** Vue 3, Tauri, `pdfjs-dist`, iframe `postMessage`, `node:test`, ESLint

---

### Task 1: Document the seam and split the viewer runtime

**Files:**
- Create: `public/pdf-viewer/altals/bridge.mjs`
- Create: `public/pdf-viewer/altals/state.mjs`
- Create: `public/pdf-viewer/altals/refresh.mjs`
- Create: `public/pdf-viewer/altals/gui.mjs`
- Create: `public/pdf-viewer/altals/synctex.mjs`
- Modify: `public/pdf-viewer/altals-viewer.mjs`
- Test: `tests/pdfViewerBridge.test.mjs`

- [ ] **Step 1: Define the module responsibilities**

Document and implement the split:

```js
// bridge.mjs
// Host message parsing and parent messaging only.

// state.mjs
// Capture/restore page, scale, scroll, and search values.

// refresh.mjs
// Reload the current PDF document while preserving state.

// gui.mjs
// Build and sync the Altals toolbar.

// synctex.mjs
// Forward and backward SyncTeX wiring for LaTeX only.
```

- [ ] **Step 2: Move host protocol helpers out of `altals-viewer.mjs`**

Extract message/channel constants, `postToParent`, and command parsing into `bridge.mjs`, then import them from the entry file.

- [ ] **Step 3: Move viewer state capture and restore into `state.mjs`**

Implement a focused API like:

```js
export function captureViewerState(app) { /* ... */ }
export function restoreViewerState(app, state) { /* ... */ }
export function createStateStore() { /* ... */ }
```

- [ ] **Step 4: Move reload sequencing into `refresh.mjs`**

Implement a small coordinator:

```js
export function createRefreshController({ app, openDocument, captureState, restoreState }) {
  return {
    async reload(payload) { /* preserve state, reopen, restore */ },
    markLoaded() { /* clear in-flight reload state */ },
  }
}
```

- [ ] **Step 5: Keep `altals-viewer.mjs` as orchestration only**

Limit the entry file to:
- PDF.js option setup
- wait for PDF.js lifecycle
- instantiate controllers
- wire host commands to the right module
- wire viewer events back to the parent

### Task 2: Replace the ad-hoc toolbar with Altals-native viewer chrome

**Files:**
- Modify: `public/pdf-viewer/altals/gui.mjs`
- Modify: `public/pdf-viewer/altals-viewer.css`
- Modify: `public/pdf-viewer/viewer.html`

- [ ] **Step 1: Build a toolbar model that matches Altals, not default PDF.js**

The visible controls should be:
- search field
- previous/next match
- previous/next page
- page number and page count
- zoom out / zoom in
- scale select
- external open action

- [ ] **Step 2: Keep PDF.js controls hidden but functional**

Use the PDF.js API and event bus rather than relying on visible PDF.js buttons:

```js
app.eventBus.dispatch('find', { /* ... */ })
app.pdfViewer.currentPageNumber = n
app.pdfViewer.currentScaleValue = 'page-width'
```

- [ ] **Step 3: Tighten the iframe-local styling**

Adjust `altals-viewer.css` so the toolbar:
- reads as one clean row
- uses Altals spacing, corner radius, borders, and muted surfaces
- avoids giant empty gaps
- keeps the PDF content area visually dominant

- [ ] **Step 4: Preserve search/page/zoom state across reloads**

Wire the toolbar to the extracted state helpers so reloads restore:
- page number
- zoom mode
- scroll position
- current search query

### Task 3: Rebuild document loading and reload semantics around explicit stages

**Files:**
- Modify: `public/pdf-viewer/altals/bridge.mjs`
- Modify: `public/pdf-viewer/altals/refresh.mjs`
- Modify: `public/pdf-viewer/altals-viewer.mjs`
- Modify: `src/components/editor/PdfArtifactPreview.vue`

- [ ] **Step 1: Make viewer lifecycle stages explicit**

Represent these stages in the iframe and host:
- initializing
- ready
- opening
- loaded
- failed

- [ ] **Step 2: Keep parent loading UI aligned with real iframe stages**

Ensure `PdfArtifactPreview.vue` only shows timeout/failure states when the iframe has genuinely stalled, and otherwise reflects:
- `Preparing PDF viewer...`
- `Loading PDF...`
- `Reloading PDF...`

- [ ] **Step 3: Preserve same-document reopen behavior**

When reopening or recompiling the same artifact:
- keep page/zoom/scroll when possible
- do not rebuild the iframe unless the viewer document itself changed irrecoverably

### Task 4: Keep LaTeX SyncTeX and external open behavior intact

**Files:**
- Modify: `public/pdf-viewer/altals/synctex.mjs`
- Modify: `public/pdf-viewer/altals/bridge.mjs`
- Modify: `src/components/editor/PdfArtifactPreview.vue`

- [ ] **Step 1: Rebind backward SyncTeX inside the viewer layer**

Backward sync should stay viewer-local and emit a single host message:

```js
postToParent(EVENT.BACKWARD_SYNC, { page, x, y })
```

- [ ] **Step 2: Keep forward SyncTeX host-driven**

`PdfArtifactPreview.vue` should continue receiving LaTeX forward-sync coordinates from the app and pass them into the iframe command surface.

- [ ] **Step 3: Keep external open as a stable fallback**

The Altals toolbar’s external action should emit the existing host event rather than duplicating open logic in the viewer.

### Task 5: Verify the refactor slice

**Files:**
- Modify: `tests/pdfViewerBridge.test.mjs`
- Test: `src/components/editor/PdfArtifactPreview.vue`
- Test: `public/pdf-viewer/altals-viewer.mjs`

- [ ] **Step 1: Update bridge tests for the current non-bootstrap path**

Cover:
- base viewer URL generation
- message envelope shape
- document payload identity normalization

- [ ] **Step 2: Run targeted verification**

Run:

```bash
node --test tests/pdfViewerBridge.test.mjs tests/documentWorkflowActionRuntime.test.mjs tests/documentWorkflowBuildRuntime.test.mjs tests/documentWorkspacePreviewRuntime.test.mjs tests/useEditorPaneWorkflow.test.mjs
npx eslint public/pdf-viewer/altals-viewer.mjs public/pdf-viewer/altals/*.mjs src/components/editor/PdfArtifactPreview.vue src/services/pdf/viewerBridge.js src/services/pdf/artifactPreview.js tests/pdfViewerBridge.test.mjs
npm run build
```

- [ ] **Step 3: Record the architectural outcome**

Update the migration note in the plan or related docs if the file split or message flow changed from the previous PDF migration plan.
