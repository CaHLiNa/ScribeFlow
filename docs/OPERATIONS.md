# Operations

## Standard verification

- `npm run lint`
- `npm run build`
- `cargo check --manifest-path src-tauri/Cargo.toml`

Use narrower checks during investigation, but do not claim completion without running the relevant validation for the changed slice.

## AI review workflow

- `npm run agent:enable-codex-gate`
  Enables the Codex stop-time review gate for Claude Code work on a fresh machine or checkout.
- `npm run agent:codex-review`
  Runs the Codex review flow against the base branch.
- `npm run agent:codex-postflight -- --plan <path>`
  Runs the Claude postflight plan audit for Codex-authored plan implementation work.

## Notes

- `agent:codex-postflight` is the user-facing alias for the Claude plan-audit script path.
- If repo policy changes, keep this document and the related scripts in sync.
