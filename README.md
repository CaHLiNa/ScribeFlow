# Altals

Altals is a local-first desktop workspace for writing, references, code, and AI-assisted research workflows.

## What stays

- Desktop app built with Tauri + Vue
- Local provider keys for Anthropic, OpenAI, Google, Exa, and OpenAlex
- GitHub sync from the desktop app
- Minimal `web/` bridge for GitHub OAuth only

## What was removed from the upstream fork

- Upstream hosted account login and session flows
- Billing, subscriptions, and balance tracking
- AI proxying through the hosted backend
- Telemetry and hosted analytics endpoints
- Marketing website, docs site, review tools, and admin backend

## Development

Requirements:

- Node.js
- Rust toolchain
- Bun is optional if you want to keep the existing Tauri commands

Desktop app:

```bash
npm install
npm run build
npm run tauri dev
```

GitHub OAuth bridge:

```bash
cd web
cp .env.example .env
npm install
npm run dev
```

Required `web/.env` values:

- `NUXT_BASE_URL`
- `NUXT_GITHUB_CLIENT_ID`
- `NUXT_GITHUB_CLIENT_SECRET`

Required desktop env for OAuth:

- `VITE_GITHUB_AUTH_ORIGIN`

Example:

```bash
VITE_GITHUB_AUTH_ORIGIN=https://<your-project>.vercel.app npm run tauri dev
```

Desktop development and release builds both use `VITE_GITHUB_AUTH_ORIGIN`.
When this origin is public, GitHub returns through the `altals://` deep link.
Use `http://localhost:3000` only if you intentionally self-host the bridge locally and point the app at it.

## Public GitHub login

For public distribution, deploy `web/` to a small public host such as Vercel and point desktop builds at that URL.

Recommended production setup:

1. Create one Altals-owned GitHub OAuth App
2. Set its callback URL to `https://<your-project>.vercel.app/api/v1/auth/github/callback`
3. Import this repository into Vercel and set the Project Root Directory to `web`
4. Configure the Vercel project with:
   - `NUXT_BASE_URL=https://<your-project>.vercel.app`
   - `NUXT_GITHUB_CLIENT_ID=<your client id>`
   - `NUXT_GITHUB_CLIENT_SECRET=<your client secret>`
5. Set desktop development and release builds to:
   - `VITE_GITHUB_AUTH_ORIGIN=https://<your-project>.vercel.app`
6. Leave the in-app override empty unless you intentionally want a different bridge

End users do not need to create their own OAuth App or run a local bridge.

Desktop release builds return from GitHub through the `altals://` deep link instead of polling the bridge. This avoids relying on in-memory bridge state in deployed environments.

Nuxt on Vercel works with zero extra framework config, and Vercel will keep deploying this bridge from Git once the project is imported.

## Repository

- GitHub: [CaHLiNa/Altals](https://github.com/CaHLiNa/Altals)
