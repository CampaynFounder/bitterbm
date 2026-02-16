"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { supabase } from "@/lib/supabase"

const LOGO_SIZE = 56

/**
 * Logo in top-left of header. Click destination:
 * - Logged out: /
 * - Logged in: /dashboard
 *
 * Replace public/logo.svg with your logo. Supported: .svg, .png, .webp
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
        width={LOGO_SIZE}
        height={LOGO_SIZE}
        priority
        style={{ objectFit: "contain", width: LOGO_SIZE, height: LOGO_SIZE, display: "block" }}
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
          fontSize: "1.125rem",
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
