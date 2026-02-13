# Cloudflare Pages Deployment

## Build Settings

Configure in Cloudflare Pages dashboard (or `wrangler pages`):

| Setting | Value |
|---------|-------|
| **Build command** | `npm run build` |
| **Build output directory** | `out` |
| **Root directory** | (project root) |
| **Node.js version** | 18 or 20 (set via environment variable `NODE_VERSION=20`) |

## Lock File

- **Use `package-lock.json`** – Commit it to the repo for reproducible builds.
- Do not add `yarn.lock` or `pnpm-lock.yaml` if using npm.

## Environment Variables

For production (e.g., GA4):

- `NEXT_PUBLIC_GA4_MEASUREMENT_ID` – Add in Cloudflare Pages → Settings → Environment variables

## Static Export

This project uses Next.js `output: 'export'`. The build produces a static `out/` directory that Cloudflare Pages serves directly—no Node.js runtime required.
