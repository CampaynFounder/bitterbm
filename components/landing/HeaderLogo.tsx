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
        textDecoration: "none",
      }}
    >
      <Image
        src="/logo.svg"
        alt="BitterBM"
        width={48}
        height={48}
        priority
        style={{ objectFit: "contain", width: 48, height: 48, display: "block" }}
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
