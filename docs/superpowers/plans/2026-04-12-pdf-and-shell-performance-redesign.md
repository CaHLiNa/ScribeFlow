# PDF And Shell Performance Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the visible stutter when PDF preview is open and the workbench changes width, while leaving the non-PDF preview architecture untouched.

**Architecture:** Keep non-PDF preview behavior on its current path and focus the redesign on two real bottlenecks: the PDF artifact preview lifecycle and the shell’s resize/toggle motion model. PDF preview moves to a persistent hosted surface that no longer reloads on theme/artifact updates, and shell/sidebar/split interactions move to an explicit motion runtime so width changes are rAF-coalesced, preview work is deferred until settle, and toggle animations are compositor-first instead of layout-thrash-first.

---

## Scope Lock

- Non-PDF preview surfaces are **not** the primary problem in this plan.
- Do **not** replace the current non-PDF preview architecture as part of this work.
- Only add minimal coordination hooks to other preview surfaces if needed so they cooperate with shell live-resize phases.
- The main redesign targets:
  - PDF artifact preview
  - shell sidebar toggle motion
  - pane split drag behavior
  - resize-time persistence and scheduling

## File Structure

### New files

- Create: `src/domains/workbench/workbenchMotionRuntime.js`
  Responsibility: shared resize/toggle phases for shell and pane interactions.
- Create: `src/services/webview/workbenchHostedWebview.js`
  Responsibility: generic hosted child-webview create/show/resize lifecycle.
- Create: `src/services/pdf/pdfPreviewHost.js`
  Responsibility: persistent hosted PDF viewer session state and viewer messaging.
- Create: `src/components/editor/PdfHostedPreview.vue`
  Responsibility: hosted PDF preview shell used by `pdf-artifact` and raw PDF tabs.

### Files to modify

- Modify: `src/components/editor/EditorPane.vue`
- Modify: `src/components/editor/PdfArtifactPreview.vue`
- Modify: `src/components/editor/PaneContainer.vue`
- Modify: `src/components/editor/SplitHandle.vue`
- Modify: `src/components/layout/ResizeHandle.vue`
- Modify: `src/composables/useAppShellLayout.js`
- Modify: `src/shared/shellResizeSignals.js`
- Modify: `src/stores/editor.js`
- Modify: `src/App.vue`
- Modify: `public/pdfjs-viewer/web/viewer.html`
- Modify: `public/pdfjs-viewer/web/altals-latex-sync.mjs`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DOCUMENT_WORKFLOW.md`

## Acceptance Criteria

- Opening or closing a sidebar with PDF preview visible no longer causes a visible hitch from repeated PDF reload/repaint cycles.
- Split drag and sidebar drag commit at most once per animation frame.
- Split ratio persistence happens on drag end instead of every mousemove.
- Theme changes patch the live PDF viewer without recreating its blob URL and iframe session.
- Non-PDF preview behavior remains unchanged for normal use.

### Task 1: Build A Shared Workbench Motion Runtime

**Files:**
- Create: `src/domains/workbench/workbenchMotionRuntime.js`
- Modify: `src/shared/shellResizeSignals.js`
- Modify: `src/composables/useAppShellLayout.js`
- Modify: `src/components/layout/ResizeHandle.vue`
- Modify: `src/components/editor/SplitHandle.vue`
- Modify: `src/components/editor/PaneContainer.vue`
- Modify: `src/stores/editor.js`

```js
import assert from 'node:assert/strict'

import { createWorkbenchMotionRuntime } from '../src/domains/workbench/workbenchMotionRuntime.js'

  const commits = []
  const runtime = createWorkbenchMotionRuntime({
    requestFrame: (cb) => {
      cb()
      return 1
    },
    onCommit: (kind, value) => commits.push({ kind, value }),
  })

  runtime.begin('split')
  runtime.schedule('split', 0.58)
  runtime.schedule('split', 0.61)

  assert.deepEqual(commits, [{ kind: 'split', value: 0.61 }])
})

  const phases = []
  const runtime = createWorkbenchMotionRuntime({
    onPhaseChange: (phase) => phases.push(phase),
  })

  runtime.begin('right-sidebar')
  runtime.end('right-sidebar')

  assert.deepEqual(phases, ['live-resize', 'settling', 'idle'])
})
```

Expected: FAIL because the runtime does not exist and the current shell still updates width directly.

- [ ] **Step 3: Implement the motion runtime**

```js
// src/domains/workbench/workbenchMotionRuntime.js
export function createWorkbenchMotionRuntime(options = {}) {
  let phase = 'idle'
  const pending = new Map()
  const requestFrame = options.requestFrame || requestAnimationFrame

  function setPhase(nextPhase) {
    if (phase === nextPhase) return
    phase = nextPhase
    options.onPhaseChange?.(phase)
  }

  function flush(kind) {
    if (!pending.has(kind)) return
    const value = pending.get(kind)
    pending.delete(kind)
    options.onCommit?.(kind, value)
  }

  return {
    getPhase: () => phase,
    begin(kind) {
      setPhase('live-resize')
      options.onBegin?.(kind)
    },
    schedule(kind, value) {
      pending.set(kind, value)
      requestFrame(() => flush(kind))
    },
    end(kind) {
      setPhase('settling')
      options.onEnd?.(kind)
      queueMicrotask(() => setPhase('idle'))
    },
  }
}
```

- [ ] **Step 4: Route shell resize handles through the shared runtime**

```js
// src/shared/shellResizeSignals.js
export const SHELL_RESIZE_PHASE_EVENT = 'altals-shell-resize-phase'
```

```js
// src/components/layout/ResizeHandle.vue
emit('resize-start')
setShellResizeActive(true, { source: 'layout-handle', direction: props.direction })
```

The implementation should now also emit phase changes (`live-resize`, `settling`, `idle`) through the shared runtime instead of only boolean start/end.

- [ ] **Step 5: Make split drag rAF-throttled and persist only on drag end**

```js
// src/components/editor/PaneContainer.vue
function handleResize(e) {
  const rect = splitContainer.value.getBoundingClientRect()
  const ratio = (e.x - rect.left) / rect.width
  motionRuntime.schedule('split', ratio)
}

function handleResizeEnd() {
  editorStore.commitSplitRatio(props.node)
}
```

```js
// src/stores/editor.js
setSplitRatio(splitNode, ratio, { persist = false } = {}) {
  if (!splitNode || splitNode !== this.paneTree || splitNode.type !== 'split') return
  splitNode.ratio = Math.max(0.15, Math.min(0.85, Number(ratio) || 0.5))
  if (persist) this.saveEditorState()
}

commitSplitRatio(splitNode) {
  this.setSplitRatio(splitNode, splitNode?.ratio, { persist: true })
}
```

- [ ] **Step 6: Run the shell-motion slice**

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: add phased workbench motion runtime"
```

### Task 2: Move PDF Preview To A Persistent Hosted Surface

**Files:**
- Create: `src/services/webview/workbenchHostedWebview.js`
- Create: `src/services/pdf/pdfPreviewHost.js`
- Create: `src/components/editor/PdfHostedPreview.vue`
- Modify: `src/components/editor/EditorPane.vue`
- Modify: `src/components/editor/PdfArtifactPreview.vue`

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/components/editor/PdfHostedPreview.vue', import.meta.url), 'utf8')

  assert.match(source, /workbenchHostedWebview/)
  assert.match(source, /pdfPreviewHost/)
  assert.doesNotMatch(source, /<iframe/)
})
```

Expected: FAIL because the hosted component/runtime do not exist yet.

- [ ] **Step 3: Implement the generic hosted-webview primitive**

```js
// src/services/webview/workbenchHostedWebview.js
export async function ensureWorkbenchHostedWebview({
  label,
  url,
  bounds,
  focus = false,
}) {
  // Centralize create/show/resize for persistent child webviews.
}
```

- [ ] **Step 4: Implement the PDF host service**

```js
// src/services/pdf/pdfPreviewHost.js
export async function ensurePdfPreviewHost({
  paneId,
  viewerUrl,
  bounds,
}) {
  return ensureWorkbenchHostedWebview({
    label: `pdf-preview-${paneId}`,
    url: viewerUrl,
    bounds,
  })
}
```

- [ ] **Step 5: Route PDF preview modes through the hosted component**

```vue
<!-- src/components/editor/EditorPane.vue -->
<PdfHostedPreview
  v-else-if="documentWorkspaceRoute.previewMode === 'pdf-artifact'"
  :artifact-path="documentWorkspaceRoute.previewTargetPath"
  :source-path="activeTab"
  :kind="toolbarUiState?.kind || 'document'"
  @open-external="handleWorkflowOpenExternalPdf"
/>
```

- [ ] **Step 6: Keep the old DOM iframe component as explicit fallback only**

```vue
<!-- src/components/editor/PdfArtifactPreview.vue -->
<!-- Convert this file into a compatibility fallback rather than the default route. -->
```

- [ ] **Step 7: Run the hosted-PDF slice**

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git commit -m "feat: host pdf previews in persistent webviews"
```

### Task 3: Stop Reloading The PDF Viewer For Theme And Artifact Updates

**Files:**
- Modify: `src/services/pdf/pdfPreviewHost.js`
- Modify: `public/pdfjs-viewer/web/viewer.html`
- Modify: `public/pdfjs-viewer/web/altals-latex-sync.mjs`

- [ ] **Step 1: Expand the PDF contracts to require message-driven patching**

```js
  assert.match(componentSource, /postPdfViewerMessage\('apply-theme'/)
  assert.match(componentSource, /postPdfViewerMessage\('load-artifact'/)
  assert.doesNotMatch(componentSource, /viewerKey\.value \+= 1/)
})
```

Expected: FAIL because the current implementation still rebuilds the viewer on updates.

- [ ] **Step 3: Add hosted viewer message APIs**

```js
// src/services/pdf/pdfPreviewHost.js
export function postPdfViewerMessage(host, type, payload = {}) {
  host?.webview?.emit?.('altals-pdf-host', { type, ...payload })
}
```

- [ ] **Step 4: Make the bundled pdf.js viewer accept artifact/theme patch commands**

```js
// public/pdfjs-viewer/web/altals-latex-sync.mjs
window.addEventListener('message', async (event) => {
  const data = event.data
  if (data?.channel !== 'altals-pdf-host') return
  if (data.type === 'apply-theme') applyThemeTokens(data.theme)
  if (data.type === 'load-artifact') await loadArtifactUrl(data.artifactUrl)
  if (data.type === 'synctex') revealSynctexPoint(data.point)
})
```

- [ ] **Step 5: Update the host so theme/artifact watchers patch instead of reload**

```js
watch(() => [props.artifactPath, artifactVersion.value], async () => {
  const artifactUrl = await ensureArtifactBlobUrl(props.artifactPath)
  postPdfViewerMessage(host.value, 'load-artifact', { artifactUrl })
})

watch(() => [workspace.theme, workspace.pdfThemedPages], () => {
  postPdfViewerMessage(host.value, 'apply-theme', { theme: resolveViewerThemeTokens() })
})
```

- [ ] **Step 6: Preserve existing LaTeX SyncTeX behavior through the new host bridge**

```js
postPdfViewerMessage(host.value, 'synctex', { point })
// reverse sync still resolves through resolveLatexSyncTargetPath before dispatching to editors
```

- [ ] **Step 7: Run the PDF update slice**

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git commit -m "feat: patch live pdf viewers instead of reloading"
```

### Task 4: Rework Sidebar Toggle Animation So It Stops Thrashing Preview Layout

**Files:**
- Modify: `src/App.vue`
- Modify: `src/composables/useAppShellLayout.js`
- Modify: `src/domains/workbench/workbenchMotionRuntime.js`

```js
  const source = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
  assert.match(source, /sidebar-toggle-overlay/)
  assert.doesNotMatch(source, /transition: width 260ms/)
})
```

- [ ] **Step 2: Run the layout slice and confirm it fails**

Expected: FAIL because the current shell still animates real layout width over 260ms.

- [ ] **Step 3: Replace width-transition toggles with overlay-first motion**

```css
/* src/App.vue */
.app-shell-region-left,
.app-shell-region-right {
  transition: none;
}

.sidebar-toggle-overlay {
  transition:
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 140ms ease;
}
```

The implementation should:
- snap layout width to the committed target once,
- animate an overlaying sidebar shell with `transform` and `opacity`,
- keep the heavy center workbench out of the animation loop.

- [ ] **Step 4: Keep drag resizing live, but classify it as `live-resize` so preview hosts can defer heavy work**

```js
// src/composables/useAppShellLayout.js
motionRuntime.begin('right-sidebar')
motionRuntime.schedule('right-sidebar-width', nextWidth)
motionRuntime.end('right-sidebar')
```

- [ ] **Step 5: Run the shell slice**

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: make sidebar toggles compositor-first"
```

### Task 5: Keep Other Preview Surfaces Stable While Teaching Them To Cooperate With Live Resize Phases

**Files:**
- Modify: preview surfaces only if live-resize coordination is still required

- [ ] **Step 1: Add guardrail coverage if another preview surface needs resize-phase coordination**

- [ ] **Step 2: Run the preview-surface contract and confirm it fails until the coordination hook exists**

- [ ] **Step 3: Add resize-phase coordination without changing the active preview surface rendering model**

- Add only the minimum motion-phase hook needed by the surviving preview surface.

Run the smallest relevant preview-surface verification slice.

- [ ] **Step 5: Commit**

```bash
git add <preview-surface-files>
git commit -m "feat: coordinate preview surfaces with shell motion phases"
```

### Task 6: Final Polish, Docs, And Verification

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DOCUMENT_WORKFLOW.md`

- [ ] **Step 1: Update architecture docs for hosted PDF surfaces and motion phases**

```md
- PDF artifact preview is hosted in a persistent child webview instead of a DOM iframe hot path
- shell resize/toggle interactions use explicit motion phases so heavy previews can defer settle work
- non-PDF preview surfaces remain on the current path and only consume motion-phase signals when needed
```

- [ ] **Step 2: Update workflow docs to explain the new preview split behavior**

```md
- PDF artifact preview uses a hosted viewer session with live theme/artifact patching
```

- [ ] **Step 3: Run the targeted verification slice**

Expected: PASS

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add docs/ARCHITECTURE.md docs/DOCUMENT_WORKFLOW.md
git commit -m "docs: record hosted pdf and shell motion architecture"
```

## Self-Review

### Spec coverage

- Realigned the plan to the user’s actual report: non-PDF preview is acceptable, PDF + width changes are not.
- Performance: addressed by hosted PDF surfaces, motion phases, rAF scheduling, and drag-end persistence.
- Animation quality: addressed by compositor-first sidebar toggles instead of animating live layout width.
- Visual quality: addressed by smoother sidebar motion and stable preview surfaces.

### Placeholder scan

- No `TODO` / `TBD` placeholders remain.
- Each task includes concrete files, commands, and implementation direction.

### Type consistency

- One shared naming family is used:
  `workbenchMotionRuntime`, `workbenchHostedWebview`, `pdfPreviewHost`.
- Non-PDF preview surfaces are consistently treated as unchanged rendering paths with added coordination only when required.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-12-pdf-and-shell-performance-redesign.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
