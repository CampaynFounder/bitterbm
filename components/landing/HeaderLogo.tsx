"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { supabase } from "@/lib/supabase"

/**
 * Logo in top-left of header. Click destination:
 * - Logged out: /
 * - Logged in: /dashboard
 *
 * Replace public/logo.svg with your logo. Supported: .svg, .png, .webp
 * Recommended: 120–160px wide, 36–48px tall
 */
export function HeaderLogo() {
  const [session, setSession] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(!!s)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      supabase.auth.getSession().then(({ data: { session: s } }) => {
        setSession(!!s)
      })
    })
    return () => subscription.unsubscribe()
  }, [])

  const href = session ? "/dashboard" : "/"

  return (
    <Link
      href={href}
      aria-label={session ? "Go to dashboard" : "Go to home"}
      className="header-logo"
      style={{
        position: "fixed",
        top: "var(--space-md)",
        left: "var(--space-md)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 120,
        minHeight: 40,
        textDecoration: "none",
        padding: "var(--space-sm) var(--space-md)",
        borderRadius: 8,
        background: "rgba(15, 18, 24, 0.98)",
        border: "1px solid rgba(255, 255, 255, 0.25)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "0 4px 24px rgba(0, 0, 0, 0.5)",
      }}
    >
      <Image
        src="/logo.svg"
        alt="BitterBM"
        width={120}
        height={40}
        priority
        style={{ objectFit: "contain", maxHeight: 40, filter: "brightness(0) invert(1)" }}
        onError={(e) => {
          const target = e.currentTarget
          target.style.display = "none"
          const fallback = target.nextElementSibling
          if (fallback instanceof HTMLElement) fallback.style.display = "block"
        }}
      />
      <span
        className="header-logo-fallback"
        style={{
          display: "none",
          fontSize: "1rem",
          fontWeight: 700,
          letterSpacing: "0.08em",
          color: "var(--text-primary)",
        }}
      >
        BitterBM
      </span>
    </Link>
  )
}
