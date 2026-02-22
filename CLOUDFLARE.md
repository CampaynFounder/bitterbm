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
- `PIPELINE_CONVERT_URL` – (Optional) Deployed Python pipeline base URL for codegen conversion. If unset, `POST /api/pipeline/convert-codegen` returns 503; use the app locally with `uvicorn api:app --port 8000` in `scraper/pipeline` to convert codegen.

For local images: put files in `public/images/` and use `/images/hero.jpg` etc.

## Static Export

This project uses Next.js `output: 'export'`. The build produces a static `out/` directory that Cloudflare Pages serves directly—no Node.js runtime required.

## Functions (Pages Functions)

If the build succeeds but you see **"Error: Failed to publish your Function. Got error: Unknown internal error occurred"**:

1. **Retry** – The error is often transient; trigger a new deployment.
2. **Check Cloudflare status** – See [status.cloudflare.com](https://www.cloudflare.com/status/).
3. **Function size** – The `functions/` directory is uploaded separately. If you added large dependencies or many routes, try splitting or trimming.
4. **Support** – If it persists, open a Cloudflare support ticket; "Unknown internal error" is a server-side message with no client fix.

Static assets (the `out/` export) can still be served even if Function publish fails; only serverless API routes under `/functions` will be unavailable until the publish succeeds.
