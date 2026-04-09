# PDF Viewer Migration Plan

## Goal

Replace Altals's self-rendered PDF artifact preview with a viewer-based implementation adapted from LaTeX-Workshop's `viewer/` surface so LaTeX and Typst compile outputs use a stable embedded PDF.js viewer inside the existing split editor workflow.

## Why

- The current `PdfArtifactPreview.vue` owns page rendering, text layers, search, zoom, reload, and sync behavior directly.
- That path has repeated runtime bugs: blank first page, fragile reopen behavior, view reset on refresh, and toolbar/layout drift.
- LaTeX-Workshop already solves the right problem shape:
  - embed a full PDF.js `viewer.html`
  - keep extra behavior in a thin browser-side bridge
  - avoid overriding PDF.js internals

## Scope

### In

- Vendor a viewer shell under `public/pdf-viewer/`
- Reuse LaTeX-Workshop's `viewer.html` / `viewer.css` / `viewer.mjs` base
- Wire PDF.js build assets from `pdfjs-dist`
- Replace the current page-by-page canvas renderer with an iframe wrapper
- Preserve Altals-specific behavior:
  - workspace-local PDF URLs via `altals-workspace://localhost`
  - compile-triggered reloads
  - LaTeX forward SyncTeX
  - LaTeX reverse SyncTeX
  - external open fallback/action
  - themed page mode

### Out

- General `.pdf` file handling
- Annotation editing
- Thumbnail/attachment/layer sidebars in the embedded viewer
- A new backend daemon or Rust PDF renderer

## Architecture

### Static viewer surface

- `public/pdf-viewer/viewer.html`
- `public/pdf-viewer/viewer.css`
- `public/pdf-viewer/viewer.mjs`
- `public/pdf-viewer/build/*`
- `public/pdf-viewer/images/*`
- `public/pdf-viewer/locale/*`
- `public/pdf-viewer/cmaps/*`
- `public/pdf-viewer/standard_fonts/*`

These assets stay static and are loaded inside an iframe.

### Altals bridge

- `public/pdf-viewer/altals-viewer.mjs`
- `public/pdf-viewer/altals-viewer.css`

Responsibilities:

- initialize PDF.js viewer options
- strip viewer chrome down to the workflow-relevant controls
- receive parent commands by `postMessage`
- emit viewer lifecycle and reverse-sync messages to the parent
- preserve page/scale/scroll state across same-document reloads

### App-side wrapper

- `src/components/editor/PdfArtifactPreview.vue`

Responsibilities:

- mount the iframe viewer
- compute workspace-safe artifact URL/version
- send `set-document`, `reload`, `set-theme`, and forward-sync commands
- handle reverse-sync events by calling existing Tauri SyncTeX commands
- surface load errors and external-open fallback

### Service seam

- `src/services/pdf/viewerBridge.js`

Responsibilities:

- build the iframe viewer URL
- normalize viewer messages/command payloads
- keep message protocol strings out of the component

## Message Protocol

Parent to iframe:

- `altals:viewer:set-document`
- `altals:viewer:reload-document`
- `altals:viewer:scroll-to-pdf-point`
- `altals:viewer:set-theme`

Iframe to parent:

- `altals:viewer:ready`
- `altals:viewer:loaded`
- `altals:viewer:error`
- `altals:viewer:backward-sync`
- `altals:viewer:open-external`

## Implementation Slices

1. Vendor viewer assets and create the Altals viewer bridge.
2. Replace `PdfArtifactPreview.vue` internals with an iframe-based wrapper.
3. Reconnect LaTeX forward/backward SyncTeX through the existing Tauri commands.
4. Keep existing document workflow routing unchanged so tests remain targeted to the preview mode contract.
5. Verify build and workflow tests, then do a quick runtime smoke check path if needed.

## Risks

- CSP or protocol access could block `altals-workspace://localhost` fetches from the iframe viewer.
- PDF.js viewer asset version mismatch would break the embedded shell.
- Parent/iframe reload ordering could still regress state retention if `pagesloaded` timing is wrong.

## Mitigations

- Keep asset versions aligned with installed `pdfjs-dist` (`5.6.205`).
- Use the existing workspace protocol URL builder rather than inventing a new fetch path.
- Gate viewer commands behind an explicit `ready` handshake.
- Preserve a captured viewer state before same-document reloads and restore it on `pagesloaded`.

## Verification

- `npm run build`
- targeted document workflow tests
- manual smoke path:
  - open LaTeX PDF preview
  - close and reopen PDF preview
  - recompile and confirm page/scale persist
  - trigger LaTeX forward sync
  - trigger LaTeX reverse sync
