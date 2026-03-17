# Non-Obvious Lessons & Gotchas

Things that broke, confused, or wasted time. Read this before making changes.

---

## Tauri / WKWebView

### `window.confirm()` doesn't work
`confirm()`, `alert()`, and `prompt()` return immediately in Tauri's WKWebView without waiting for user input. Files get deleted before the user clicks Cancel.

**Use instead:** `ask()` from `@tauri-apps/plugin-dialog` — returns a proper `Promise<boolean>` via a native macOS dialog.

### WKWebView spellcheck needs NSUserDefaults
Setting `spellcheck="true"` on a contenteditable element is necessary but not sufficient. WKWebView doesn't show red underlines unless `WebContinuousSpellCheckingEnabled` is set to `true` in `NSUserDefaults` before webview initialization.

**Fix:** Call `NSUserDefaults.setBool_forKey(true, "WebContinuousSpellCheckingEnabled")` early in `lib.rs:run()`, before `tauri::Builder`. Uses `objc2-foundation` (already a transitive dep of tauri/wry).

### Custom context menu blocks native spell suggestions
`@contextmenu.prevent` on the editor container intercepts right-click entirely. The browser's native context menu (which shows spell corrections) never appears. There is no JS API to detect whether a word is misspelled by the browser.

**Fix:** On right-click, extract the word at cursor position in JS, send it to Rust `spell_suggest()` which checks via `NSSpellChecker`, and show suggestions at the top of our custom context menu. See `EditorContextMenu.vue`.

### CM6 search panel buttons are invisible in light themes
`src/editor/theme.js` sets `{ dark: true }` so CM6's internal defaults assume dark mode. When CSS vars flip to light colors, `.cm-button` and `.cm-textfield` in the search panel (Cmd+F) become unreadable.

**Fix:** Explicitly style `.cm-button` and `.cm-textfield` in the theme using CSS vars (`--bg-tertiary`, `--fg-primary`, `--border`). Works across all themes.

### CM6 ViewPlugin cannot provide block or cross-line decorations
`Decoration.replace({ block: true })` and replace decorations that span line breaks throw `RangeError` when provided via a `ViewPlugin`. This is a hard CM6 constraint.

**Fix:** Use a `StateField` with `provide: f => EditorView.decorations.from(f)` for any decoration that crosses line boundaries or uses `block: true`. The StateField doesn't have viewport access, but for sparse elements like tables this is fine. Single-line replacements (like `HrWidget` for `---`) work from a ViewPlugin because they don't cross line breaks.

**Applied in:** `livePreview.js` — table rendering uses a separate `StateField` while all inline decorations (bold, italic, links, etc.) stay in the `ViewPlugin`.

### Settings modal z-index is 10000
Any dropdown or popover inside the settings modal that uses `<Teleport to="body">` must use z-index > 10000. The ghost model picker dropdown uses 10001 (backdrop) and 10002 (menu).

### macOS autocomplete popups on utility inputs
macOS shows autocomplete/spelling suggestion popups on `<input>` elements by default. For search fields, rename inputs, filter inputs, and other utility controls, this is distracting.

**Fix:** Add `autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"` to all utility inputs. Applied to 13+ inputs across Header, FileTree, FileTreeItem, ReferenceList, CitationPalette, RightPanel, SnapshotDialog, DocxToolbar. NOT applied to data entry fields (reference metadata, API keys) where OS suggestions may help.

### CORS blocks all API calls
The webview can't call `api.anthropic.com`, `api.openai.com`, CrossRef, etc. directly.

**Workaround:** All HTTP requests go through Rust's `proxy_api_call` command (reqwest). Streaming uses `chat_stream` with Tauri events.

### Titlebar drag requires three things
1. `titleBarStyle: "Overlay"` + `hiddenTitle: true` in `tauri.conf.json`
2. `data-tauri-drag-region` attribute on the header element
3. `"core:window:allow-start-dragging"` in capabilities

Missing any one of these silently breaks window dragging.

### HTML5 drag-and-drop is unreliable in WebKit
Native `@dragstart`/`@dragover`/`@drop` events behave inconsistently.

**Workaround:** All in-app drag operations (tabs, files, references) use manual mouse event tracking: `mousedown` → document `mousemove` → document `mouseup` with cleanup via `removeEventListener`. Native drag events are only used for OS-level file drops (via Tauri's `tauri://drag-drop` event).

---

## Vue / Pinia Reactivity

### Writing to a closure-captured session object bypasses Vue's Proxy
After `sessions.value.push(session)`, the local `session` variable still points to the **raw plain object**. `sessions.value[n]` and `sessions.value.find(...)` return the **reactive Proxy**. Writing a new property to the raw object (e.g. from an async `onUsage` callback) sets the value on the underlying data but never fires Vue's Proxy `set` trap — so no computed re-runs. Reads through the proxy will eventually return the correct value after some other state change re-triggers the computed, causing silent one-step-behind bugs.

**Fix:** In async callbacks that fire after `push()`, re-acquire via `sessions.value.find(s => s.id === session.id)` before writing. For synchronous access right after push, use `sessions.value[sessions.value.length - 1]`.

**Example:** `chat.js:onUsage` stores `_lastInputTokens` for the context window donut. Writing to the closure's raw `session` meant the first exchange always showed 0 tokens — the computed only picked up the value when new messages caused it to re-run for an unrelated reason.

### `editorStore.openFile()` is a tab switcher, not a file loader
It does NOT read content from disk. If you need updated content in the editor after a write, you must update `filesStore.fileContents[path]` explicitly before calling `openFile()`.

### HMR causes duplicate sessions
`loadSessions()` called multiple times during hot reload appends duplicates.

**Fix:** `this.sessions = []` at the start of `loadSessions()`.

---

## Layout & CSS

### `overflow-hidden` clips popovers
`RightPanel.vue` and most layout containers use `overflow-hidden`. Any dropdown, popover, or floating UI inside these containers is invisible if positioned with `position: absolute`.

**Fix:** Use `<Teleport to="body">` with `position: fixed` and coordinates from `getBoundingClientRect()`. There are 18+ instances of this pattern across the codebase.

### `v-show` not `v-if` for terminals and chat
Using `v-if` destroys xterm.js instances (killing terminal processes) and resets chat scroll position when switching tabs.

**Fix:** All right panel tab contents use `v-show` with absolute positioning. The right sidebar container itself uses `v-show` (not `v-if`) in `App.vue`.

### xterm.js needs hex colors, not CSS vars
xterm.js renders to a `<canvas>` element, so it can't resolve CSS custom properties.

**Fix:** `src/themes/terminal.js` maps theme names to JS objects with hex color values.

### Use `tabular-nums` on dynamic numbers
Without it, layout shifts when digits change width (e.g., token counter going from "1.2k" to "45.3k").

Applied in: footer stats, token counter, PDF zoom percentage.

---

## AI Integration

### AI file tools are sandboxed to the workspace
`resolvePath()` in `chatTools.js` normalizes paths and rejects anything outside `workspace.path`. Absolute paths and `../` traversal return `null` → error message to the AI. `run_command` is the exception — it still has unrestricted shell access via `bash -c`.

The Rust file commands (`fs_commands.rs`) are NOT sandboxed — they serve the file tree, settings panel, and global config. Don't confuse the two layers.

### Shoulders proxy `shoulders_balance` event crashes AI SDK
The Shoulders proxy injects `{"type":"shoulders_balance","credits":...,"cost_cents":...}` into the raw SSE stream. The AI SDK's `processUIMessageStream` validates all events against a discriminated union of known types — `shoulders_balance` is not recognized and throws `AI_TypeValidationError`.

**Fix:** `tauriFetch.js` filters out `shoulders_balance` events before they reach the AI SDK. Balance data is extracted and dispatched as a `shoulders-balance` CustomEvent on `window`.

### AI SDK tool part state is mutated in place
The AI SDK mutates `part.state` on tool call parts in place (`input-streaming` → `input-available` → `output-available`). Vue doesn't detect property mutations on objects already in the reactive system.

**Fix:** Use `:key="part.toolCallId + '-' + part.state"` on `ToolCallLine` in `ChatMessage.vue` to force re-render when state changes.

### AI SDK `messagesRef` uses `shallowRef` — message objects are not reactive
`chat.state.messagesRef` is a `shallowRef`, so the message objects inside it are plain JS objects, not Vue reactive Proxies. Mutating a property on a message (e.g. `msg.metadata = { ... }`) does **not** trigger computed re-evaluation — Vue never sees the change.

**Also:** `chat.sendMessage()` adds the user message **asynchronously** — `messagesRef.value` is empty immediately after the call. Wait for `nextTick()` before reading the newly added message.

**Fix:** Store any display-only data keyed by message ID in a separate `ref({})` in the Pinia store (e.g. `_richHtmlMap` in `chat.js`). Replace the whole object (`ref.value = { ...ref.value, [id]: data }`) so Vue tracks the change. Read it from `ChatMessage.vue` via a store getter — this registers the reactive dependency correctly.

### AI SDK shallow clone breaks Vue computed chains through `parts` array
AI SDK's `replaceMessage()` shallow-clones the message object (`{ ...message }`) on each streaming chunk, so `props.message` changes. But the `parts` array inside is the **same reference**. Any computed that returns `msg.parts` (like `displayParts`) will return the same value — Vue's computed caching sees no change and skips recomputing downstream computeds (like `textContent`). Meanwhile, `part.text` has been mutated in place and IS up to date if you read it directly.

**Fix:** For reactive checks that need current part data (e.g. "does text exist yet?"), read `props.message.parts` directly instead of going through intermediate computeds. The `props.message` dependency ensures the computed re-runs on each chunk. See `isWaitingForContent` in `ChatMessage.vue`.

### Zod v4: `z.record(z.any())` crashes `toJSONSchema()`
AI SDK converts zod schemas to JSON Schema for tool definitions. `z.record(z.any())` crashes — must use `z.record(z.string(), z.any())` with explicit key type.

### Server-side proxy gotchas (web backend only)
The following gotchas apply to the **server-side** proxy in `web/server/` (`proxy.post.js` + `providerProxy.js`). The proxy is **transparent** — it forwards native provider format unchanged and only parses SSE data lines to extract usage for billing.

- **SSE line buffering**: TCP chunks can split mid-line. The proxy buffers incomplete lines across `pull()` calls — if a chunk doesn't end with `\n`, the last partial line is held in `sseBuffer` and prepended to the next chunk.
- **Usage extraction varies by provider**: Anthropic uses `data.usage.{input,output}_tokens`, OpenAI uses `data.usage` or `data.response.usage` (Responses API), Google uses `data.usageMetadata.{promptTokenCount,candidatesTokenCount}`. The `extractUsage()` helper handles all three.
- **Streaming detection via header**: The client sends `x-shoulders-stream: 1|0` because streaming is detected differently per provider (Anthropic/OpenAI: `body.stream`, Google: URL contains `streamGenerateContent`). The server reads this header instead of inspecting the body.
- **Google model in URL**: Google's API URL includes the model name (`/models/{model}:generateContent`). The server reads `x-shoulders-model` to construct this.
- **`anthropic-beta` header forwarding**: The proxy forwards this header from the client to Anthropic upstream — needed for thinking/extended output features.
- **Non-streaming returns upstream JSON as-is**: No `_shoulders` metadata is injected into the response body (native SDKs may reject unknown fields). Balance updates come from streaming calls and periodic refresh.
- Historical hosted-proxy details live in [legacy/web-backend.md](legacy/web-backend.md).

### PDF tool results must be text, not document blocks
Sending a base64 PDF as a `document` block inside a tool result causes Claude to not see the content and call the same tool repeatedly. Use extracted text for PDF tool results. The AI SDK tool `execute` functions in `chatTools.js` return text content, not raw PDF blocks.

### LLMs normalize typographic characters in tool arguments
When a model reads a file containing curly quotes (`""`/`''`), em dashes (`—`), or ellipses (`…`) and then calls `edit_file`, it often substitutes ASCII lookalikes (`"`, `-`, `...`) in the `old_string` argument. The file contains the Unicode original; the tool call contains ASCII — `includes()` returns false, edit fails.

**Fix:** `edit_file` in `chatTools.js` uses `_buildTypographicRegex(old_string)` to build a regex where each ASCII char is replaced with a character class that also matches its Unicode equivalents. The match finds the actual bytes in the file; replacement uses a function `() => new_string` (not a bare string) to prevent `$1`/`$&` backreference substitution in `new_string`.

### File write + merge view race condition
When AI tools write files, the merge view compares against `filesStore.fileContents`. If content isn't updated before recording the pending edit, the editor shows stale content and the diff is wrong.

**Fix:** Update `filesStore.fileContents[path]` synchronously BEFORE pushing to `reviews.pendingEdits`.

### `mapPos` assoc values are backwards from intuition
`ChangeSet.mapPos(pos, assoc)` with `assoc=1` moves the position **past** insertions at that point, and `assoc=-1` keeps it **before**. For mark decoration ranges, the convention is `from` uses `-1` (grow outward) and `to` uses `1` (grow outward). Swapping these causes the range to **collapse or invert** when a change spans it, and `Decoration.mark().range(from, to)` throws `RangeError: Mark decorations may not be empty`.

The `commentField` StateField in `comments.js` had these reversed, which cascaded into: dispatches crashing silently (editor not updating), merge view not appearing, and reject buttons throwing.

**Fix:** Always use `mapPos(from, -1)` and `mapPos(to, 1)` for mark ranges. Add a `Math.min`/`Math.max` safety clamp and filter out `from >= to` before creating `Decoration.mark()`.

### Merge view accept doesn't change the document
CodeMirror's `unifiedMergeView` with `mergeControls: true` handles accept/reject differently. **Reject** replaces the current text with the original (document change). **Accept** only removes the old-text decoration (no document change — the new text is already there).

Any `ViewPlugin.update()` handler that guards on `update.docChanged` will miss accept events entirely. The `chunkWatcherPlugin` had this bug: `onAllResolved` never fired after accepts, so the pending edit stayed as `'pending'`, the banner never disappeared, and the diff came back on tab switch.

**Fix:** Check chunk count on every update, not just document changes.

### Invalid tool call JSON breaks the session — recovered via `output-error` injection

When a model produces malformed JSON in tool call arguments (e.g. mixes XML `<parameter>` tags into a JSON string), `JSON.parse` fails and the SDK sets `input` to the raw malformed string (not a dict). Two failure modes:

1. **Part stuck at `input-available`** (immediate) — no paired tool result, subsequent sends fail with HTTP 400 (`MissingToolResultsError`). The `onError` handler detects the stuck part in the last message, pops it, and pushes a synthetic `output-error` part.
2. **Poisoned `input` in earlier message** (delayed) — the SDK handles the error gracefully: emits `output-error` part with raw string as `input`, stream completes without error (`onError` does NOT fire). The poisoned part gets persisted. On the **next** send, the provider rejects the entire conversation: `tool_use.input: Input should be a valid dictionary`. `onError` fires now, but the broken part is in an **earlier** message (e.g. `messages.5`), not the last one.

**Fix (in `chat.js` `onError`, two passes):**
- **Pass 1:** Scan **all** assistant messages for `dynamic-tool` parts with non-dict `input`. Mutate `input` to `{}` in place. This fixes case 2 regardless of where the poisoned part sits in the history.
- **Pass 2:** Check the last message for stuck parts (`input-available`/`input-streaming`). Pop and replace with synthetic `output-error`. This fixes case 1.

Key constraints verified against the SDK source:
- Check `p.type === 'dynamic-tool'` (not `p.type?.startsWith('tool-')` — `dynamic-tool` is the actual stored type; `tool-{name}` is render-time only)
- Detect non-dict input: `typeof p.input !== 'object' || p.input === null || Array.isArray(p.input)`
- Use `input: {}` not `input: undefined` — `validateUIMessages` schema requires `input: z.unknown()` (not optional)
- All three providers (Anthropic, OpenAI, Google) accept `input: {}` as empty tool args and the `error-text` output type as a tool result

### `_buildConfig` is async
Building workspace meta requires async git operations, so `chat.js:_buildConfig()` is async. The Chat composable's transport factory receives a callback `() => _buildConfig(session)` that returns a Promise.

### Ghost suggestion staleness (generation counter)
A module-level `currentGeneration` counter is incremented on each trigger. When the API response arrives, it checks `gen !== currentGeneration` and discards stale results. Without this, slow responses overwrite newer suggestions.

### Git diff fallback for auto-commit users
`gitDiffSummary()` tries `git diff` first. If empty (everything committed), falls back to `git diff HEAD~1`. This handles the auto-commit-every-5-minutes workflow where there are rarely uncommitted changes.

### Full-document swap destroys all position-tracked annotations
When `TextEditor.vue`'s `fileContents` watcher dispatches `{ from: 0, to: doc.length, insert: newContent }`, CodeMirror's `mapPos` maps every tracked position to either `0` (bias -1) or `newContent.length` (bias +1). This expands every comment range to cover the entire document and corrupts the store when `handleDocChanged()` writes the broken ranges back.

**Fix:** Use `computeMinimalChange()` from `src/utils/textDiff.js` to find the common prefix/suffix and dispatch only the changed span. This lets `mapPos` correctly shift annotations around the actual edit. Applied in `TextEditor.vue` and `NotebookCell.vue`.

### `EditorView.domEventHandlers` only covers the content area
`domEventHandlers` registers on `.cm-content`, not on `.cm-gutters`. Click handlers for gutter markers (like comment dots) will never fire through this API. This can be masked if a decoration covers the full document — clicks near the gutter land on the content area highlight instead.

**Fix:** Use the `domEventHandlers` option inside the `gutter()` config. Note the different signature: `(view: EditorView, line: BlockInfo, event: Event) => boolean` (vs `(event, view)` for `EditorView.domEventHandlers`). See `comments.js` comment gutter.

---

## Typst / PDF Export

### Paragraph spacing: `#set par(spacing: ...)` not `#set block(spacing: ...)`
`#set block(spacing: X)` and `#show par: set block(spacing: X)` have **no visible effect** on paragraph spacing. Paragraphs in Typst are not block elements in the way `block()` targets.

**Fix:** Use `#set par(spacing: X)` — this directly controls the gap between paragraphs. `par(leading)` controls line spacing *within* a paragraph; `par(spacing)` controls the gap *between* paragraphs.

### Fonts in `public/fonts/` are webview-only
Vite serves `public/` files to the webview via the asset protocol, but external processes like Typst can't read them. Fonts must be copied to the real filesystem.

**Fix:** `bundle.resources` in `tauri.conf.json` copies fonts to the Tauri resource directory. `find_font_dir()` resolves the path (dev: `../public/fonts`, prod: resource dir), and `--font-path` is passed to Typst at compile time. System fonts (Times New Roman, Arial) still work — `--font-path` is additive.

---

## File Operations

### Name collision behaviors differ by operation
`createFile` and `renamePath` **block** (show a toast, abort). `movePath`, `copyExternalFile`, and `duplicatePath` **auto-rename** (append numeric suffix: `file 2.md`, `file 3.md`). Don't assume they behave the same — `movePath` uses `rename_path` (Rust `fs::rename`) which on macOS silently overwrites the destination, so the JS-side `path_exists` check is critical.

### Inline new-item input DOM order matters
In `FileTreeItem.vue`, the inline create input must appear AFTER the folder's `.tree-item` row and BEFORE the children `<template>`. Placing it before the row makes it render above the folder name.

---

## Binary Files

### Base64 bridge with chunked conversion
Large binary files (images, PDFs, and other non-text assets) transferred between Rust and JS via base64 should be converted in chunks. JavaScript `String.fromCharCode()` is called in 8192-byte chunks to avoid call stack size limits.

Relevant commands: `read_file_base64`, `write_file_base64`.

---

## Terminal / Code Runner

### Multi-line code garbles in R/Python/Julia REPL
Sending multi-line code directly to the PTY via `pty_write` causes readline to echo and execute each line individually while remaining lines are still in the input buffer. Output interleaves with unprocessed input, producing garbled, duplicated, and truncated lines.

Bracketed paste (`\x1b[200~`...`\x1b[201~`) does NOT work — R's readline in the PTY context doesn't enable bracketed paste mode, so the escape sequences leak through as literal `00~`/`01~` text.

**Fix:** Write multi-line code to a temp file, then send a single-line `source()` / `exec()` / `include()` command to the REPL. See `RightPanel.vue:buildReplCommand()`.

---

## Keyboard Shortcuts

### CodeMirror `defaultKeymap` eats custom shortcuts
`defaultKeymap` from `@codemirror/commands` binds common combos like `Mod-Enter` (to `insertBlankLine`). Custom keymaps added via `extraExtensions` in `setup.js` are spread AFTER the default keymap, so they lose the priority race and never fire.

**Fix:** Wrap custom keymaps in `Prec.highest(keymap.of([...]))` (import `Prec` from `@codemirror/state`). This ensures they're checked before the defaults.

**Applied in:** `NotebookCell.vue` — Shift+Enter and Mod+Enter (run cell) are both wrapped in `Prec.highest` to beat `insertBlankLine`.

### `mousedown.prevent` keeps textarea focused
Popover buttons near text inputs use `@mousedown.prevent` so clicking them doesn't blur the textarea.

---

## Cross-Component Communication

### Custom window events for decoupled components
When components can't share a direct parent-child relationship (editor gutter → right panel, citation click → reference detail), communication uses `window.dispatchEvent(new CustomEvent(...))`.

Events in use: `open-reference-detail`, `ref-drag-over`, `ref-drag-leave`, `ref-file-drop`, `filetree-drag-start` (detail: `{ paths }`), `filetree-drag-end`, `notebook-scroll-to-cell`.

### `.shoulders/.direct-mode` is a flag file
Its existence (not content) toggles direct mode. Checked by both the frontend (reviews store) and the Claude Code shell hook.

---

## Notebooks (.ipynb)

### `kernel.json` bare `python` resolves to the wrong interpreter
Kernel specs often list `"python"` or `"python3"` as `argv[0]`, which resolves via PATH to whichever Python comes first — often Homebrew's latest (e.g. 3.14) which lacks ipykernel, instead of the user's system/venv Python where it's installed.

**Fix:** `kernel.rs:find_python_with_ipykernel()` probes candidate categories in priority order: bare command → pyenv → conda → Homebrew → macOS per-version → system → Linux per-version → user-local → Windows (py launcher, AppData paths, Conda, Scoop). Each candidate is checked with `Path::exists()` first (cheap), then `python -m ipykernel_launcher --version`.

### Jupyter runtime directory is platform-specific
macOS uses `~/Library/Jupyter/runtime`, Linux uses `$XDG_RUNTIME_DIR/jupyter` (or `~/.local/share/jupyter/runtime`), Windows uses `%APPDATA%\jupyter\runtime`.

**Fix:** `kernel.rs:jupyter_runtime_dir()` with `#[cfg(target_os)]` branches.

### Windows kernel support
`kernel.rs` uses `get_home_dir()` (falls back to `USERPROFILE`), `#[cfg(unix)]`/`#[cfg(windows)]` for `libc::kill` vs `taskkill`, and conditional `libc` dependency (`[target.'cfg(unix)'.dependencies]` in Cargo.toml). Shell commands use `bash -c` on Unix, `cmd /C` on Windows (`fs_commands.rs`). PTY prompt env vars (`PS1`/`PROMPT`) only set on Unix.

### Ghost suggestions work per-cell
Each CodeMirror instance in `NotebookCell.vue` gets its own `ghostSuggestionExtension`. Context is automatically scoped to the cell's content — no multi-cell stitching needed.

---

## Removed Capability: DOCX / SuperDoc

DOCX editing, review, version preview, and DOCX-specific AI tooling were removed from the current Altals product. Historical investigation notes should stay only in archived planning or legacy material.
