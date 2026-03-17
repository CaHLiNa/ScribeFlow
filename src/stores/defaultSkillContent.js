// Default SKILL.md content for the altals-meta skill.
// This is auto-generated into Altals-managed workspace metadata for new workspaces.
// Update this source first if the in-app manual changes.

export default `# Altals - App Reference

> For the AI agent. Use this as internal product context and translate it into plain language for the user.

---

## What Altals is

Altals is a local-first desktop workspace for research writing, references, coding, and AI-assisted editing. A workspace is just a folder on the user's filesystem. Files stay local unless the user explicitly enables GitHub sync or calls external AI/search providers with their own API keys.

---

## Core editing

### Markdown
- Standard markdown editing with autosave.
- Split panes, tabbed editing, live preview, search and replace.
- PDF export via Typst with citations from the local reference library.

### DOCX
- Native \`.docx\` editing with SuperDoc.
- Comments, tracked change compatible workflows, AI-assisted editing, and inline suggestions.

### LaTeX
- Built-in Tectonic support.
- SyncTeX navigation and bibliography generation.

### Notebooks and code
- Native \`.ipynb\` support.
- Built-in terminal and kernel-backed execution for Python, R, and Julia when available.

---

## References

- Global reference library lives in \`~/.altals/references/library.json\`.
- Global PDFs and extracted full text live in \`~/.altals/references/pdfs/\` and \`~/.altals/references/fulltext/\`.
- The current workspace collection lives in \`~/.altals/workspaces/<workspace-hash>/project/references/workspace-library.json\`.
- Import paths include DOI, BibTeX, RIS, CSL-JSON, plain citation text, and PDF drop.
- Citations are Pandoc-style, for example \`[@smith2024]\`.

---

## AI setup

Altals uses the user's own provider keys.

### Supported providers
- Anthropic
- OpenAI
- Google
- DeepSeek
- Kimi
- Qwen
- MiniMax
- GLM

### Search tools
- \`web_search\` and \`fetch_url\` need \`EXA_API_KEY\`.
- \`search_papers\` prefers \`OPENALEX_API_KEY\`, falls back to Exa, then CrossRef.

### Storage
- Global key storage is managed by the desktop app and OS keychain when available.
- Model definitions live in \`~/.altals/models.json\`.
- Workspace-private AI state lives in \`~/.altals/workspaces/<workspace-hash>/\`, outside the user's project folder.

---

## AI features

### Chat
- Multi-session chat with model picker.
- Can read workspace files, references, notebooks, and comments.
- Edits can go through review mode instead of applying directly.

### Ghost suggestions
- Triggered by typing \`++\`.
- Available when a compatible provider key is configured.

### Comments and proposals
- Users can leave document comments and send them to the AI.
- The AI can create reviewable proposals and document comments.

---

## GitHub sync

- GitHub can be connected in Settings with OAuth or a personal access token.
- Sync uses the user's GitHub token directly from the desktop app.
- Conflict snapshots are pushed to branches named like \`altals/sync-...\`.
- The minimal \`web/\` service is only for GitHub OAuth callback handling.

---

## Important directories

| Path | Purpose |
| --- | --- |
| \`~/.altals/workspaces/<workspace-hash>/project/\` | Workspace project data managed by Altals |
| \`~/.altals/references/\` | Global reference library, PDFs, and full text |
| \`~/.altals/workspaces/<workspace-hash>/project/references/\` | Current workspace reference collection |
| \`~/.altals/workspaces/<workspace-hash>/project/skills/\` | Workspace skills |
| \`~/.altals/workspaces/<workspace-hash>/\` | Private AI state for the workspace |
| \`~/.altals/workspaces/<workspace-hash>/project/instructions.md\` | Default project instructions injected into AI requests |
| \`_instructions.md\` | Optional user-created override file, still recognized if you make it manually |

---

## Troubleshooting

- If AI is unavailable, check provider keys in Settings -> Models.
- If web tools are unavailable, check Exa/OpenAlex keys in Settings -> Tools.
- If GitHub sync fails, reconnect GitHub in Settings -> GitHub and inspect the current remote URL.
- If a sync conflict occurs, the work is preserved on an \`altals/sync-...\` branch.
`
