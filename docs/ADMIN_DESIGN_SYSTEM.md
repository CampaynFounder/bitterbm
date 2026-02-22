# Admin design system

Admin routes (`/admin/*`) use the **same design system** as the rest of the product so the experience feels premium and consistent. This doc is the single source of truth for aligning admin UI with the approved experience.

## Scope

- **In scope:** All routes under `/admin/*` (layout, dashboard, data-pipeline, scrape, superset, login, etc.).
- **Out of scope:** Do not change the public site or the logged-in **non-admin** user experience (e.g. `/`, `/dashboard/*`, `/signin`).

## 1. Typography

- **Display / UI:** `--font-display` (Syne). Use for all admin UI and body text.
- **Monospace / code:** `--font-mono` (JetBrains Mono). Use for code, IDs, and data.
- **Source:** Both are defined in `app/globals.css` and loaded via the root layout. Admin does **not** load MVP.css or any stylesheet that overrides these.

## 2. Colors

Use the palette from `:root` in `app/globals.css`:

| Token | Purpose |
|-------|--------|
| `--bg-primary` | Page / main background (dark) |
| `--bg-elevated` | Header, sidebar, raised surfaces |
| `--bg-card` | Cards, panels, form containers |
| `--border` | Default borders |
| `--border-accent` | Stronger borders |
| `--text-primary` | Primary text |
| `--text-secondary` | Supporting text |
| `--text-muted` | Labels, captions |
| `--accent-primary` | Primary actions, links, focus |
| `--accent-muted` | Secondary accent (e.g. link hover) |
| `--accent-cyan` | Success, progress, positive state |
| `--accent-gold` | Warnings, badges, highlights |

Admin should feel like the same **dark, premium theme** as the product—not a separate light theme.

## 3. Spacing

Use the same tokens for padding, margins, and gaps:

- `--space-xs` through `--space-3xl` (from `app/globals.css`).
- Prefer these over ad-hoc `rem` or Tailwind spacing so layout stays consistent.

Transitions: `--duration-fast`, `--duration-normal`, `--duration-slow`, `--ease-out-expo`.

## 4. Buttons and CTAs

- **Primary actions:** Use the class `.btn-primary` from `app/globals.css` (gradient, hover lift, min-height 48px). Do not replace with custom Tailwind button styles.
- **Secondary actions (outline):** Use the class `.btn-secondary` from `app/globals.css`.
- **Success / danger:** Can use custom styles that still use design tokens (e.g. `var(--accent-cyan)` for success, a red token or hex for danger) so they match the dark theme.

## 5. Admin-only CSS

- **File:** `app/admin/admin.css`. Scoped under `.admin-pages` so it does not affect non-admin routes.
- **Purpose:** Layout (header, sidebar, main), and admin-specific component classes (e.g. `.admin-card`, `.admin-input`, `.admin-status-pill`, `.admin-heading-1`). All values in this file use the same `:root` variables (e.g. `var(--bg-card)`, `var(--text-primary)`).
- **Do not:** Load MVP.css or any external stylesheet that overrides typography or colors for admin.

## 6. Contrast

Keep text and backgrounds WCAG AA. The existing dark palette in `app/globals.css` is chosen for contrast; when adding new admin UI, use the same variables rather than arbitrary hex values.

## 7. Components

- **Shared admin components:** `components/admin/AdminComponents.tsx` (TitleBlock, Hint, EmptyState, SectionBlock, OverviewCard, Card, TabBar) and `components/admin/PageComponents.tsx` (Button, etc.). These use the design tokens and `.admin-*` / `.btn-primary` / `.btn-secondary` classes so every admin screen stays consistent.

---

**Summary:** One theme (dark), one font system (Syne + JetBrains Mono), one set of tokens (colors + spacing from globals), one primary button style (`.btn-primary`). Admin must not load MVP.css or any stylesheet that overrides these.
