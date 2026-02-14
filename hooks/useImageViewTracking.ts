"use client"

import { useEffect, useRef } from "react"
import { trackPageExit, setHeroImageProperty } from "@/lib/analytics"
import { backgroundImageIds } from "@/lib/backgroundImages"

/**
 * Tracks which sections with background images were in view.
 * On page exit, sends image IDs to GA4 for churn analysis.
 */
export function useImageViewTracking() {
  const viewedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    setHeroImageProperty(backgroundImageIds.hero)
  }, [])

  useEffect(() => {
    const sections = document.querySelectorAll("[data-bg-image-id]")
    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = (entry.target as HTMLElement).dataset.bgImageId
          if (id && entry.isIntersecting) {
            viewedRef.current.add(id)
          }
        })
      },
      { threshold: 0.25, rootMargin: "0px" }
    )

    sections.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const sendExit = () => {
      const viewed = Array.from(viewedRef.current)
      if (viewed.length === 0) return

      const parsed = viewed.map((v) => {
        const [section, imageId] = v.split(":")
        return { section: section || "unknown", imageId: imageId || v }
      })
      trackPageExit(parsed)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") sendExit()
    }

    const onPageHide = () => sendExit()

    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("pagehide", onPageHide)
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("pagehide", onPageHide)
    }
  }, [])
}
