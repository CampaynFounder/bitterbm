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

- `NEXT_PUBLIC_GA4_MEASUREMENT_ID` – GA4 measurement ID
- `NEXT_PUBLIC_HERO_BG`, `NEXT_PUBLIC_PROBLEM_BG`, `NEXT_PUBLIC_AI_BG`, `NEXT_PUBLIC_PRICING_BG`, `NEXT_PUBLIC_FINAL_CTA_BG` – Custom background image URLs (optional; falls back to Unsplash if unset)
- `NEXT_PUBLIC_MODAL_SCRAPER_URL` – Modal scraper HTTP endpoint (for admin scraper Validate/Run in production; scraper runs on Modal, not Cloudflare)

For local images: put files in `public/images/` and use `/images/hero.jpg` etc.

## Static Export

This project uses Next.js `output: 'export'`. The build produces a static `out/` directory that Cloudflare Pages serves directly—no Node.js runtime required.
