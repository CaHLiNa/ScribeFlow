# GitHub OAuth Vercel Bridge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Altals use an Altals-owned GitHub OAuth bridge deployed to Vercel so public users can connect GitHub without local setup or a bundled desktop secret.

**Architecture:** The existing `web/` Nuxt app will remain the only GitHub OAuth bridge, deployed publicly on Vercel with GitHub OAuth credentials stored in Vercel env vars. The desktop app will keep its current poll-based bridge flow, but production releases will be configured to point at the deployed Vercel origin by default while still allowing local override for development.

**Tech Stack:** Vue 3, Tauri v2, Nuxt 3, GitHub OAuth App, Vercel

---

### Task 1: Tighten desktop bridge configuration for public distribution

**Files:**
- Modify: `src/components/settings/SettingsGitHub.vue`
- Modify: `src/i18n/index.js`
- Test: `npm run build`

**Step 1: Write the failing test seam**

Define the intended UX in code before implementation:

- production should prefer the bundled `VITE_GITHUB_AUTH_ORIGIN`
- development should still default to `http://localhost:3000`
- bridge override remains possible, but the UI copy should clearly describe it as a configured service URL rather than a user responsibility

Expected: `npm run build` will fail once partial refactors temporarily remove or rename strings/helpers.

**Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL if symbols or messages are temporarily inconsistent during refactor

**Step 3: Write implementation for this step**

- keep the bridge-based flow in `handleConnect()`
- adjust UI copy so end users are not told to self-host or manually set up a bridge
- keep override behavior for development/debugging
- improve misconfiguration messaging for production builds missing the bridge origin

**Step 4: Run test to verify it passes**

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/settings/SettingsGitHub.vue src/i18n/index.js
git commit -m "feat(github): refine bridge-based desktop auth ux"
```

### Task 2: Prepare the web bridge for Vercel-hosted production use

**Files:**
- Modify: `web/.env.example`
- Modify: `web/nuxt.config.js`
- Modify: `web/pages/index.vue`
- Test: `cd web && npm run build`

**Step 1: Write the failing test seam**

Define production-facing bridge expectations:

- env example must describe Vercel/public deployment clearly
- web landing page must explain that this is the Altals GitHub auth bridge
- Nuxt runtime config must remain compatible with public env injection

Expected: `cd web && npm run build` may fail during intermediate edits if config or page syntax is invalid.

**Step 2: Run test to verify it fails**

Run: `cd web && npm run build`
Expected: FAIL while refactor is incomplete

**Step 3: Write implementation for this step**

- rewrite `web/.env.example` for public bridge deployment
- keep bridge endpoints unchanged unless cleanup is needed
- update the landing page to reflect Altals-owned production bridge usage
- verify `runtimeConfig.baseUrl` and GitHub env names are documented clearly

**Step 4: Run test to verify it passes**

Run: `cd web && npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add web/.env.example web/nuxt.config.js web/pages/index.vue
git commit -m "feat(web): prepare github oauth bridge for vercel"
```

### Task 3: Document Vercel deployment and GitHub OAuth App setup

**Files:**
- Modify: `README.md`
- Modify: `docs/git-system.md`
- Optionally create: `docs/web-backend.md` additions or a focused deployment doc if clearer
- Test: `rg -n "VITE_GITHUB_AUTH_ORIGIN|NUXT_GITHUB_CLIENT_ID|NUXT_GITHUB_CLIENT_SECRET|vercel|OAuth App" README.md docs web/.env.example`

**Step 1: Write the failing documentation seam**

Replace the current localhost-only bridge guidance with public deployment guidance:

- how to create the OAuth App
- what callback URL to use
- how to set Vercel env vars
- how to set `VITE_GITHUB_AUTH_ORIGIN` for desktop release builds

Expected: docs search still shows incomplete or local-only guidance before cleanup.

**Step 2: Run verification search**

Run: `rg -n "VITE_GITHUB_AUTH_ORIGIN|NUXT_GITHUB_CLIENT_ID|NUXT_GITHUB_CLIENT_SECRET|vercel|OAuth App" README.md docs web/.env.example`
Expected: output shows current references that need updating

**Step 3: Write implementation for this step**

- document one-time Vercel setup
- document the GitHub OAuth App callback URL using `*.vercel.app`
- document the release variable/secrets expectations
- explicitly state that end users do not create their own OAuth App

**Step 4: Run verification search again**

Run: `rg -n "VITE_GITHUB_AUTH_ORIGIN|NUXT_GITHUB_CLIENT_ID|NUXT_GITHUB_CLIENT_SECRET|vercel|OAuth App" README.md docs web/.env.example`
Expected: results reflect the new Vercel-based guidance and no longer imply local-only end-user setup

**Step 5: Commit**

```bash
git add README.md docs/git-system.md docs/web-backend.md web/.env.example
git commit -m "docs(github): add vercel bridge setup"
```

### Task 4: Add deployment automation or deployment scaffolding only if it reduces user toil

**Files:**
- Create or Modify: `web/vercel.json` if needed
- Optionally create: `.github/workflows/deploy-web.yml`
- Test: `cd web && npm run build`

**Step 1: Write the failing deployment seam**

Choose the lightest deployment scaffolding that helps without overbuilding:

- if Nuxt on Vercel works cleanly with zero extra config, prefer docs only
- if routing/output needs explicit config, add minimal `vercel.json`
- only add CI deployment workflow if it meaningfully reduces ongoing manual work

Expected: this step may end with no new file if docs-only is sufficient.

**Step 2: Validate necessity**

Run: `cd web && npm run build`
Expected: PASS; use result plus Vercel requirements to decide whether extra config is needed

**Step 3: Write implementation for this step**

- add only the minimal deployment scaffolding justified by the actual Nuxt/Vercel path
- avoid adding infrastructure that recreates a full hosted backend

**Step 4: Run verification**

Run: `cd web && npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add web/vercel.json .github/workflows/deploy-web.yml
git commit -m "ci(web): add minimal bridge deployment scaffolding"
```

If no files were needed, skip this commit and note the decision in the final summary.

### Task 5: End-to-end verification and handoff

**Files:**
- Modify: none required

**Step 1: Run desktop verification**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS

**Step 2: Run app frontend verification**

Run: `npm run build`
Expected: PASS with only existing Vite warnings if any

**Step 3: Run bridge verification**

Run: `cd web && npm run build`
Expected: PASS

**Step 4: Run docs/config verification**

Run: `rg -n "localhost:3000|VITE_GITHUB_AUTH_ORIGIN|NUXT_GITHUB_CLIENT_ID|NUXT_GITHUB_CLIENT_SECRET|vercel.app" README.md docs web/.env.example src/components/settings/SettingsGitHub.vue .github`
Expected: references are intentional and aligned with the Vercel bridge design

**Step 5: Manual smoke check**

After Vercel deployment exists:

- open the deployed bridge URL
- verify `/api/v1/auth/github/connect?state=demo` redirects to GitHub
- launch the desktop app with the deployed `VITE_GITHUB_AUTH_ORIGIN`
- connect GitHub and verify the token reaches the connected state

If Vercel deployment credentials are not available in this session, note that the code and docs were prepared but live deployment validation remains pending.
