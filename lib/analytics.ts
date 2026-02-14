/**
 * Image-aware analytics for conversion optimization.
 * Tracks which background image was shown when user converts or churns.
 */

import { trackEvent, setUserProperty } from "@/components/GA4Provider"

export type SectionKey =
  | "hero"
  | "problem"
  | "ai"
  | "pricing"
  | "finalCta"
  | "sticky_cta"

/** Track CTA click with the background image shown in that section */
export function trackCtaWithImage(
  location: string,
  label: string,
  sectionImageId: string | null
) {
  trackEvent("cta_click", {
    cta_location: location,
    cta_label: label,
    section_background_image: sectionImageId ?? "none",
  })
}

/** Set hero image as user property for conversion attribution */
export function setHeroImageProperty(imageId: string) {
  setUserProperty("hero_image_id", imageId)
}

/** Track page exit / bounce with images that were in view (for churn analysis) */
export function trackPageExit(imagesViewed: Array<{ section: string; imageId: string }>) {
  trackEvent("page_exit", {
    sections_with_images_viewed: imagesViewed.map((i) => i.section).join(","),
    image_ids_viewed: imagesViewed.map((i) => i.imageId).join(","),
  })
}
