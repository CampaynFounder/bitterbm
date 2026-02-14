"use client"

import Script from "next/script"

const GA4_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID

/**
 * GA4 Provider - injects gtag.js and configures conversion tracking.
 * Set NEXT_PUBLIC_GA4_MEASUREMENT_ID in env for production.
 * GA4 events to use: page_view, sign_up, begin_checkout, purchase
 */
export function GA4Provider() {
  if (!GA4_MEASUREMENT_ID) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-config" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA4_MEASUREMENT_ID}', {
            page_path: window.location.pathname,
            send_page_view: true
          });
        `}
      </Script>
    </>
  )
}

/** Track custom GA4 events for conversion tuning */
export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>
) {
  if (typeof window !== "undefined" && "gtag" in window) {
    ;(window as unknown as { gtag: (a: string, b: string, c?: object) => void }).gtag(
      "event",
      eventName,
      params
    )
  }
}

/** Set user property for conversion attribution (e.g. hero_image_id) */
export function setUserProperty(name: string, value: string) {
  if (typeof window !== "undefined" && "gtag" in window) {
    ;(window as unknown as { gtag: (a: string, b: string, c: object) => void }).gtag(
      "set",
      "user_properties",
      { [name]: value }
    )
  }
}
