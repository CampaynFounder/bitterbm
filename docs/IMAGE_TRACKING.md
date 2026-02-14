# Image Conversion Tracking

Track which background images users see when they convert or leave. Works for both Unsplash and local images.

## How It Works

1. **CTA clicks** – Each `cta_click` event includes `section_background_image` (the image ID for that section).
2. **Hero attribution** – On load, `hero_image_id` is set as a user property for conversion attribution.
3. **Page exit** – On tab close or navigate away, `page_exit` fires with `image_ids_viewed` (sections with images that were in view).

## Image ID Format

| Source   | Example ID      |
|----------|-----------------|
| Unsplash | `us_1450101499163` |
| Local    | `local_hero`    |
| Custom   | Set via env var |

## GA4 Setup

Create these **custom dimensions** in GA4 Admin → Data display → Custom definitions:

| Dimension name  | Event parameter / User property | Scope   |
|-----------------|----------------------------------|---------|
| Section BG Image| `section_background_image`       | Event   |
| Hero Image      | `hero_image_id`                 | User    |
| Images Viewed   | `image_ids_viewed`              | Event   |

## Optimization Queries

**Conversion by hero image:**
- Segment by user property `hero_image_id`
- Compare `cta_click` rates across segments

**Churn by images viewed:**
- Filter `page_exit` events
- Compare `image_ids_viewed` for users who converted vs. bounced

**Per-section performance:**
- Filter `cta_click` by `cta_location`
- Group by `section_background_image` to see which images drive clicks in each section

## Custom Image IDs (A/B Testing)

Set env vars to control the ID sent to analytics:

```
NEXT_PUBLIC_HERO_BG_ID=hero_v2
NEXT_PUBLIC_PROBLEM_BG_ID=problem_v2
```

Use different IDs per variant to compare conversion rates by image.
