/**
 * Background images for landing page sections.
 * Use env vars for your own images; falls back to Unsplash.
 *
 * Image IDs are used for conversion tracking—which image was shown
 * when the user clicked. Set NEXT_PUBLIC_*_BG_ID for custom images
 * to control the ID sent to analytics.
 */

const UNSPLASH = {
  hero: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=1920",
  problem:
    "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=1920",
  ai: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1920",
  pricing: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1920",
  finalCta: "https://images.unsplash.com/photo-1511895426328-dc8714191300?w=1920",
} as const

/** Extract stable image ID from URL for analytics (works for Unsplash + local) */
function getImageId(
  url: string,
  section: keyof typeof UNSPLASH,
  customId?: string
): string {
  if (customId) return customId

  const unsplashMatch = url.match(/photo-(\d+)-/)
  if (unsplashMatch) return `us_${unsplashMatch[1]}`

  const pathMatch = url.match(/\/([^/]+?)(?:\?|$)/)
  if (pathMatch) return `local_${pathMatch[1].replace(/\.[^.]+$/, "")}`

  return `custom_${section}`
}

const sections = ["hero", "problem", "ai", "pricing", "finalCta"] as const

export const backgroundImages = {
  hero: process.env.NEXT_PUBLIC_HERO_BG || UNSPLASH.hero,
  problem: process.env.NEXT_PUBLIC_PROBLEM_BG || UNSPLASH.problem,
  ai: process.env.NEXT_PUBLIC_AI_BG || UNSPLASH.ai,
  pricing: process.env.NEXT_PUBLIC_PRICING_BG || UNSPLASH.pricing,
  finalCta: process.env.NEXT_PUBLIC_FINAL_CTA_BG || UNSPLASH.finalCta,
} as const

export const backgroundImageIds: Record<(typeof sections)[number], string> = {
  hero: getImageId(
    process.env.NEXT_PUBLIC_HERO_BG || UNSPLASH.hero,
    "hero",
    process.env.NEXT_PUBLIC_HERO_BG_ID
  ),
  problem: getImageId(
    process.env.NEXT_PUBLIC_PROBLEM_BG || UNSPLASH.problem,
    "problem",
    process.env.NEXT_PUBLIC_PROBLEM_BG_ID
  ),
  ai: getImageId(
    process.env.NEXT_PUBLIC_AI_BG || UNSPLASH.ai,
    "ai",
    process.env.NEXT_PUBLIC_AI_BG_ID
  ),
  pricing: getImageId(
    process.env.NEXT_PUBLIC_PRICING_BG || UNSPLASH.pricing,
    "pricing",
    process.env.NEXT_PUBLIC_PRICING_BG_ID
  ),
  finalCta: getImageId(
    process.env.NEXT_PUBLIC_FINAL_CTA_BG || UNSPLASH.finalCta,
    "finalCta",
    process.env.NEXT_PUBLIC_FINAL_CTA_BG_ID
  ),
}
