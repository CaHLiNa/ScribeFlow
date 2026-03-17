# Altals Documentation Map

This is the recommended entrypoint for repository documentation.

## Current Altals Docs

Read these first when working on the current product:

| Area | Doc | Purpose |
|---|---|---|
| Project overview | [../README.md](../README.md) | Current product positioning, local development, GitHub OAuth bridge setup |
| Architecture | [architecture.md](architecture.md) | High-level app structure and system boundaries |
| Building & releases | [building.md](building.md) | Local builds, release workflow, packaging notes |
| GitHub + sync | [git-system.md](git-system.md) | Git integration, GitHub sync, OAuth bridge expectations |
| Editor core | [editor-system.md](editor-system.md) | Editor assembly, panes, tabs, save behavior |
| File operations | [file-system.md](file-system.md) | Rust file commands, file tree, watchers |
| Terminal & runners | [terminal-system.md](terminal-system.md) | PTY terminal, REPLs, code execution |
| Markdown | [markdown-system.md](markdown-system.md) | Markdown editing, preview, export flow |
| LaTeX | [tex-system.md](tex-system.md) | LaTeX compile flow, compiler selection, PDF behavior |
| DOCX / SuperDoc | [superdoc-system.md](superdoc-system.md) | DOCX editor architecture and constraints |
| SuperDoc API reference | [superdoc-toc.md](superdoc-toc.md) | Local API reference for SuperDoc work |
| Typst / PDF export | [markdown-system.md](markdown-system.md), [tex-system.md](tex-system.md) | Current Typst export and document preview flow |

## Current System Docs

These still describe live Altals subsystems:

- [ai-system.md](ai-system.md)
- [comments-system.md](comments-system.md)
- [editor-system.md](editor-system.md)
- [file-system.md](file-system.md)
- [git-system.md](git-system.md)
- [gotchas.md](gotchas.md)
- [markdown-system.md](markdown-system.md)
- [notebook-system.md](notebook-system.md)
- [review-system.md](review-system.md)
- [rmd-system.md](rmd-system.md)
- [sqlite-infrastructure.md](sqlite-infrastructure.md)
- [state-management.md](state-management.md)
- [style-guide.md](style-guide.md)
- [supercite-system.md](supercite-system.md)
- [superdoc-system.md](superdoc-system.md)
- [superdoc-toc.md](superdoc-toc.md)
- [terminal-system.md](terminal-system.md)
- [tex-system.md](tex-system.md)
- [ui-layout.md](ui-layout.md)
- [usage-system.md](usage-system.md)
- [wiki-links.md](wiki-links.md)

## Quick Lookup

If you need to change a specific area, start here:

- Markdown preview or PDF export: [markdown-system.md](markdown-system.md)
- LaTeX compile / PDF preview / SyncTeX: [tex-system.md](tex-system.md)
- Terminal behavior or PTY integration: [terminal-system.md](terminal-system.md)
- GitHub sync or OAuth bridge assumptions: [git-system.md](git-system.md)
- File tree, reads, writes, watchers: [file-system.md](file-system.md)
- DOCX editing: [superdoc-system.md](superdoc-system.md)
- Editor pane/tab behavior: [editor-system.md](editor-system.md)
- Cross-store state: [state-management.md](state-management.md)

## Legacy Shoulders Reference

These files are historical upstream documentation and are **not** the default source of truth for current Altals behavior:

- [legacy/README.md](legacy/README.md)
- [legacy/auth-system.md](legacy/auth-system.md)
- [legacy/admin-system.md](legacy/admin-system.md)
- [legacy/web-backend.md](legacy/web-backend.md)
- [legacy/web-peer-review.md](legacy/web-peer-review.md)
- [legacy/web-triage.md](legacy/web-triage.md)
- [legacy/web-style-guide.md](legacy/web-style-guide.md)

Use them only when you specifically need historical context about removed hosted systems.
