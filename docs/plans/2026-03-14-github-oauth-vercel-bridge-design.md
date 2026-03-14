# GitHub OAuth Vercel Bridge Design

## Summary

Altals will keep its GitHub sync feature local-first, but move public GitHub authorization onto a tiny Altals-owned OAuth bridge deployed to Vercel. The desktop app will continue to use GitHub access tokens directly for repository listing, creation, linking, and sync. We will not restore the old Shoulders account system, hosted sessions, billing, or any other upstream web auth features.

## Problem

The current local bridge works for development, but it breaks the public user experience:

- users should not have to run a local OAuth bridge
- users should not have to create their own GitHub OAuth App
- we should not bundle a shared GitHub OAuth client secret into the desktop app for public distribution

The previously explored loopback-only desktop OAuth flow solves the first two problems but fails the third one, because the secret must ship in the app. The old Shoulders auth stack solves secret handling, but it brings back an entire hosted user account system we explicitly do not want.

## Decision

We will deploy the existing minimal `web/` GitHub OAuth bridge to Vercel under a default `*.vercel.app` hostname and make that the production GitHub auth origin for Altals.

## Alternatives Considered

### Option A: Vercel-hosted minimal GitHub OAuth bridge

Chosen.

Why:

- keeps GitHub OAuth secret on the server side
- users do not need any setup beyond clicking "Connect GitHub"
- reuses the current Altals bridge code with minimal changes
- does not require buying a custom domain, because Vercel provides a default `*.vercel.app` hostname
- keeps the product aligned with "local-first desktop app + optional tiny bridge", not a hosted account platform

Trade-offs:

- requires one small web deployment
- the production bridge URL must be configured in desktop releases

### Option B: Pure desktop loopback OAuth

Rejected for public distribution.

Why not:

- GitHub OAuth App credentials would need to ship with the desktop app
- a shared bundled secret is not acceptable for broad public distribution

### Option C: Restore the upstream Shoulders auth system

Rejected.

Why not:

- reintroduces a user account/session backend that Altals intentionally removed
- expands scope from "GitHub authorization bridge" into "hosted product backend"
- adds maintenance burden unrelated to GitHub sync

## Product Boundary

What we keep:

- GitHub token stored in desktop keychain
- GitHub repository listing, creation, linking, and sync in the desktop app
- PAT fallback
- minimal `web/` app limited to OAuth bridge responsibilities

What we explicitly do not restore:

- Shoulders email/password auth
- Shoulders refresh/access token system
- hosted user identity in Altals
- billing/subscriptions
- AI proxying through a hosted auth layer

## Architecture

### Desktop side

The desktop app remains the GitHub sync client:

- `src/components/settings/SettingsGitHub.vue` opens the GitHub bridge URL
- the bridge performs GitHub OAuth and temporarily stores the token payload
- the desktop app polls the bridge with a random `state`
- on success, the desktop app stores the returned GitHub token in the OS keychain
- the rest of `githubSync.js` remains unchanged

The desktop build will use:

- `VITE_GITHUB_AUTH_ORIGIN=https://<your-project>.vercel.app`

Production users should not need to edit this manually. A manual override can remain available for development and debugging.

### Web bridge side

The `web/` app continues to expose:

- `GET /api/v1/auth/github/connect`
- `GET /api/v1/auth/github/callback`
- `POST /api/v1/auth/github/poll`

It continues to use in-memory state and nonce protection:

- nonce-bound `state` values
- one-time code reuse protection
- short-lived token storage for the poll handoff

Required server env:

- `NUXT_BASE_URL=https://<your-project>.vercel.app`
- `NUXT_GITHUB_CLIENT_ID=<your oauth client id>`
- `NUXT_GITHUB_CLIENT_SECRET=<your oauth client secret>`

### GitHub OAuth App

We will use a single Altals-owned GitHub OAuth App.

The callback URL will be:

- `https://<your-project>.vercel.app/api/v1/auth/github/callback`

End users do not create their own OAuth App. They authorize Altals against the one we own and operate.

## Deployment Model

### Recommended deployment

Use Vercel's standard Nuxt deployment path:

- import the repo into Vercel once
- set the three required env vars in the Vercel project
- deploy the `web/` app
- use the generated `https://<project>.vercel.app` URL as the desktop auth origin

Relevant official docs:

- GitHub OAuth Apps: [Authorizing OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- GitHub OAuth App creation: [Creating an OAuth app](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)
- Nuxt on Vercel: [Vercel Nuxt framework guide](https://vercel.com/docs/frameworks/full-stack/nuxt)
- Vercel generated URLs: [Generated deployment URLs](https://vercel.com/docs/concepts/deployments/generated-urls)
- Vercel environment variables: [Environment Variables](https://vercel.com/docs/environment-variables)

### CI/release integration

Desktop release builds should continue to inject `VITE_GITHUB_AUTH_ORIGIN`. The value should now be the deployed Vercel origin instead of `localhost`.

This preserves the current desktop bridge behavior while making the bridge public and stable for users.

## UX Changes

For users:

- no local bridge setup
- no personal GitHub OAuth App creation
- no domain knowledge required
- click "Connect GitHub", authorize in browser, return to app

For developers:

- local development can still use `http://localhost:3000`
- settings can retain a visible or advanced-only bridge override

## Error Handling

Desktop:

- if production builds lack `VITE_GITHUB_AUTH_ORIGIN`, show a clear misconfiguration error
- if auth times out, reuse the current timeout UX
- if GitHub rejects auth, surface the returned error

Bridge:

- preserve the existing nonce and one-time code guards
- keep short TTLs on stored tokens
- return simple success/failure pages suitable for browser handoff

Deployment:

- if Vercel env vars are missing, the bridge should fail clearly with "GitHub OAuth not configured"

## Files Expected To Change

- `src/components/settings/SettingsGitHub.vue`
- `src/i18n/index.js`
- `README.md`
- `web/.env.example`
- `web/pages/index.vue`
- `web/nuxt.config.js`
- possibly a new deployment helper such as `vercel.json` or deployment docs/workflow if needed
- `.github/workflows/release.yml` only if release docs/config need tightening

## Verification Plan

- `cargo check --manifest-path src-tauri/Cargo.toml`
- `npm run build`
- `cd web && npm run build`
- verify no regression in GitHub settings UI
- once Vercel deployment exists, run a real GitHub auth flow against the deployed bridge

## Acceptance Criteria

- public users can connect GitHub without running any local bridge
- public users do not need to create their own OAuth App
- the GitHub OAuth client secret is not bundled into the desktop app
- Altals still does not depend on the Shoulders hosted account/session stack
