# User Flow Setup

## Overview

The conversion funnel and user dashboard are implemented. Follow these steps to complete setup.

## 1. Run Migrations

Apply the new user tables and storage policies:

```bash
supabase db push
# Or run manually in Supabase SQL Editor:
# - supabase/migrations/008_user_tables.sql
# - supabase/migrations/009_evidence_storage.sql
```

## 2. Create Storage Bucket

In Supabase Dashboard → Storage:

- Create bucket: `evidence-uploads`
- Private
- File size limit: 5MB
- Allowed MIME: `image/png`, `image/jpeg`, `image/jpg`, `application/pdf`

The RLS policies in `009_evidence_storage.sql` assume this bucket exists.

## 3. Enable Email + Password Auth

Supabase Dashboard → Authentication → Providers:

- Enable **Email**
- Enable **Email + Password** (not just magic link)
- Configure redirect URLs for your domain and `http://localhost:3000` for dev

## 4. Cloudflare Environment Variables

Ensure these Secrets are set (Settings → Environment variables → Secrets):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY` (for RAG)
- `NEXT_PUBLIC_SUPABASE_URL` (build-time)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (build-time)

## 5. Stripe

Stripe integration is implemented. Add these environment variables:

**Local (.env):**
```
STRIPE_SECRET_KEY=sk_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...  # for local: stripe listen --forward-to localhost:3000/api/stripe-webhook
STRIPE_PRICE_MONTHLY=price_xxx   # $49/mo recurring price ID
STRIPE_PRICE_FLAT=price_xxx      # $599 one-time price ID
```

**Cloudflare Pages (Settings → Environment variables):**
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (build-time)
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_MONTHLY` – Stripe Price ID for $49/month subscription
- `STRIPE_PRICE_FLAT` – Stripe Price ID for $599 one-time payment

**Webhook setup:** In Stripe Dashboard → Developers → Webhooks, add endpoint:
- URL: `https://your-domain.com/api/stripe-webhook`
- Events: `setup_intent.succeeded`, `payment_intent.succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`

**Run migration 010** for `payment_methods.pm_metadata` column:
```bash
supabase db push
# Or run supabase/migrations/010_payment_methods_metadata.sql
```

**Flow:** 1) User validates payment method ($0 charge via SetupIntent). 2) User selects plan ($49/mo or $599 one-time) and clicks Enroll. 3) Stripe charges and webhooks sync subscription state.

## User Flow Summary

| Step | Route | Description |
|------|-------|-------------|
| 1 | `/` | Landing page, CTAs to /assessment or /signup?payment=1 |
| 2 | `/assessment` | Upload 2 screenshots (free), analyze, view results |
| 3 | Modal | Auth (email + password) → Save results → Dashboard |
| 4 | `/dashboard` | Evidence, analysis, profile, next steps |
| 5 | Profile | `/dashboard/profile` – state, county (required), optional details |
| 6 | Pricing | Modal on "Analyze More" for free users → /dashboard/payment |
| 7 | Payment | `/dashboard/payment` – validate PM ($0), then enroll ($49/mo or $599) |

## Feature Flag

`app_config.auth_timing` controls conversion flow:

- `value_first` (default): Upload → Analyze → Results → Sign up
- `gate_before_features`: Require sign-up before upload

Update via SQL: `UPDATE app_config SET value = '"gate_before_features"' WHERE key = 'auth_timing';`
