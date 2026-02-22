"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { MenuToggleIcon } from "./MenuToggleIcon"
import { supabase } from "@/lib/supabase"
import { UpgradeToFlatModal } from "@/components/dashboard/UpgradeToFlatModal"

const HAMBURGER_OPENED_KEY = "bitterbm_hamburger_opened"

export type AdminNavSection = {
  section: string
  items: Array<{
    name: string
    href: string
    icon?: string
    description?: string
    badge?: string
  }>
}

const GUEST_ITEMS = [
  { href: "/assessment", label: "Assessment" },
  { href: "/signin", label: "Sign in" },
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
] as const

const CASE_ANALYSIS_HREF = "/dashboard/analysis"
const FLAT_ONLY_ITEMS = [
  { href: "/dashboard/gal", label: "GAL Analysis", feature: "GAL Analysis" },
  { href: "/dashboard/judge", label: "Judge Analysis", feature: "Judge Analysis" },
  { href: "/dashboard/county", label: "County Analysis", feature: "County Analysis" },
  { href: "/dashboard/attorney", label: "Attorney Analysis", feature: "Attorney Analysis" },
  { href: "/dashboard/filing", label: "Filing Analysis", feature: "Filing Analysis" },
  { href: "/dashboard/strategy", label: "Overall Strategy", feature: "Overall Strategy" },
] as const

type Props = {
  visible?: boolean
  /** Admin mode: same component (right, same panel), render admin sections + sign out. Links preserved. */
  variant?: "default" | "admin"
  adminSections?: AdminNavSection[]
  onAdminSignOut?: () => void
}

export function HamburgerMenu({ visible = true, variant = "default", adminSections, onAdminSignOut }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState<boolean | null>(null)
  const [showHighlight, setShowHighlight] = useState(false)
  const [plan, setPlan] = useState<string | null>(null)
  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null)

  const isAdmin = variant === "admin" && adminSections != null && adminSections.length > 0

  useEffect(() => {
    if (typeof window !== "undefined") {
      setShowHighlight(!sessionStorage.getItem(HAMBURGER_OPENED_KEY))
    }
  }, [])

  useEffect(() => {
    if (session && typeof window !== "undefined") {
      setShowHighlight(!sessionStorage.getItem(HAMBURGER_OPENED_KEY))
    }
  }, [session])

  useEffect(() => {
    if (isAdmin) return
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s) {
        setSession(false)
        setPlan(null)
        return
      }
      setSession(true)
      supabase
        .from("subscriptions")
        .select("plan")
        .eq("user_id", s.user.id)
        .maybeSingle()
        .then(
          ({ data }) => {
            const p = (data as { plan?: string } | null)?.plan ?? "free"
            setPlan(p)
          },
          () => setPlan("free")
        )
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      supabase.auth.getSession().then(({ data: { session: s } }) => {
        if (!s) {
          setSession(false)
          setPlan(null)
          return
        }
        setSession(true)
        supabase
          .from("subscriptions")
          .select("plan")
          .eq("user_id", s.user.id)
          .maybeSingle()
          .then(
            ({ data }) => {
              const p = (data as { plan?: string } | null)?.plan ?? "free"
              setPlan(p)
            },
            () => setPlan("free")
          )
      })
    })
    return () => subscription.unsubscribe()
  }, [isAdmin])

  const isFlat = plan === "flat"
  const isEnrolled = plan === "monthly" || plan === "flat"

  const AUTH_FREE_ITEMS = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/profile", label: "Profile" },
    { href: "/dashboard/payment", label: "Payment" },
  ] as const

  async function handleSignOut() {
    setOpen(false)
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(HAMBURGER_OPENED_KEY)
    }
    await supabase.auth.signOut()
    router.replace("/")
  }

  function handleNavClick(href: string) {
    setOpen(false)
  }

  function handleFlatOnlyClick(e: React.MouseEvent, item: (typeof FLAT_ONLY_ITEMS)[number]) {
    e.preventDefault()
    setOpen(false)
    if (isFlat) {
      router.push(item.href)
    } else {
      setUpgradeFeature(item.feature)
    }
  }

  if (!visible) return null

  const buttonStyle = {
    position: "relative" as const,
    zIndex: 1,
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "center",
    gap: 5,
    width: 44,
    height: 44,
    padding: 10,
    background: "rgba(8, 9, 12, 0.8)",
    border: !isAdmin && session && showHighlight ? "2px solid var(--accent-primary)" : "1px solid var(--border-accent)",
    borderRadius: "8px",
    cursor: "pointer",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    boxShadow: !isAdmin && session && showHighlight ? "0 0 12px var(--accent-glow), 0 0 24px rgba(59, 130, 246, 0.15)" : undefined,
    transition: "border 0.3s ease, box-shadow 0.3s ease",
  }

  return (
    <>
      <nav
        className="hamburger-nav"
        role="navigation"
        aria-label={isAdmin ? "Admin menu" : "Main menu"}
        style={{
          position: "fixed",
          top: "var(--space-md)",
          right: "var(--space-md)",
          zIndex: 50,
        }}
      >
        <button
          type="button"
          onClick={() => {
            setOpen((o) => {
              if (!o && typeof window !== "undefined" && !isAdmin) {
                sessionStorage.setItem(HAMBURGER_OPENED_KEY, "1")
                setShowHighlight(false)
              }
              return !o
            })
          }}
          aria-expanded={open}
          aria-controls="hamburger-menu-panel"
          aria-label={open ? "Close menu" : "Open menu"}
          style={buttonStyle}
        >
          <MenuToggleIcon
            open={open}
            duration={300}
            stroke="var(--text-primary)"
            style={{ width: 24, height: 24 }}
          />
        </button>

        <div
          id="hamburger-menu-panel"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            zIndex: 1,
            marginTop: "var(--space-sm)",
            minWidth: 200,
            maxHeight: "min(80vh, 480px)",
            overflowY: "auto",
            padding: "var(--space-md)",
            background: "rgba(20, 25, 32, 0.98)",
            border: "1px solid var(--border-accent)",
            borderRadius: "12px",
            boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            display: open ? "flex" : "none",
            flexDirection: "column",
            gap: "var(--space-xs)",
          }}
        >
          {isAdmin ? (
            <>
              {adminSections!.map((group, idx) => (
                <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
                  <h2 style={{ fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", color: "var(--text-secondary)", margin: 0 }}>
                    {group.section}
                  </h2>
                  {group.items.map((item) => {
                    const isActive = pathname === item.href
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        style={navLinkStyle(isActive)}
                        onMouseEnter={navLinkHover}
                        onMouseLeave={navLinkHoverOff}
                      >
                        {item.icon != null && <span style={{ marginRight: "var(--space-sm)" }} aria-hidden>{item.icon}</span>}
                        <span style={{ flex: 1 }}>{item.name}</span>
                        {item.badge != null && (
                          <span style={{ fontSize: "0.6875rem", padding: "2px 6px", borderRadius: 4, background: "var(--accent-gold)", color: "var(--bg-primary)" }}>
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              ))}
              {onAdminSignOut != null && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onAdminSignOut()
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "var(--space-sm) var(--space-md)",
                    fontSize: "0.9375rem",
                    color: "var(--text-primary)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    borderRadius: "6px",
                    transition: "background 0.15s",
                    marginTop: "var(--space-sm)",
                    borderTop: "1px solid var(--border)",
                    paddingTop: "var(--space-md)",
                  }}
                  onMouseEnter={navLinkHover}
                  onMouseLeave={navLinkHoverOff}
                >
                  🚪 Sign out
                </button>
              )}
            </>
          ) : session ? (
            isEnrolled ? (
            <>
              <Link
                href="/dashboard"
                onClick={() => handleNavClick("/dashboard")}
                style={navLinkStyle(pathname === "/dashboard")}
                onMouseEnter={navLinkHover}
                onMouseLeave={navLinkHoverOff}
              >
                Dashboard
              </Link>
              <Link
                href={CASE_ANALYSIS_HREF}
                onClick={() => handleNavClick(CASE_ANALYSIS_HREF)}
                style={navLinkStyle(pathname === CASE_ANALYSIS_HREF)}
                onMouseEnter={navLinkHover}
                onMouseLeave={navLinkHoverOff}
              >
                Case Analysis
              </Link>
              {FLAT_ONLY_ITEMS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={(e) => handleFlatOnlyClick(e, item)}
                  style={{
                    ...navLinkStyle(pathname === item.href),
                    ...(!isFlat ? { opacity: 0.85 } : {}),
                  }}
                  onMouseEnter={navLinkHover}
                  onMouseLeave={navLinkHoverOff}
                >
                  {item.label}
                  {!isFlat && (
                    <span style={{ fontSize: "0.7rem", marginLeft: "var(--space-xs)", color: "var(--accent-gold)" }}>↑</span>
                  )}
                </a>
              ))}
            </>
            ) : (
            AUTH_FREE_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => handleNavClick(item.href)}
                style={navLinkStyle(pathname === item.href)}
                onMouseEnter={navLinkHover}
                onMouseLeave={navLinkHoverOff}
              >
                {item.label}
              </Link>
            ))
          )
          ) : (
            GUEST_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                style={navLinkStyle(false)}
                onMouseEnter={navLinkHover}
                onMouseLeave={navLinkHoverOff}
              >
                {item.label}
              </Link>
            ))
          )}
          {!isAdmin && session && (
            <button
              type="button"
              onClick={handleSignOut}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "var(--space-sm) var(--space-md)",
                fontSize: "0.9375rem",
                color: "var(--text-primary)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                borderRadius: "6px",
                transition: "background 0.15s",
                marginTop: "var(--space-sm)",
                borderTop: "1px solid var(--border)",
                paddingTop: "var(--space-md)",
              }}
              onMouseEnter={navLinkHover}
              onMouseLeave={navLinkHoverOff}
            >
              Log out
            </button>
          )}
        </div>

        {open && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 0,
              background: "transparent",
              border: "none",
              cursor: "default",
            }}
          />
        )}
      </nav>

      {upgradeFeature && (
        <UpgradeToFlatModal
          feature={upgradeFeature}
          onClose={() => setUpgradeFeature(null)}
          onUpgrade={() => {
            setUpgradeFeature(null)
            router.push("/dashboard/payment?upgrade=flat")
          }}
        />
      )}
    </>
  )
}

function navLinkStyle(active: boolean) {
  return {
    display: "block",
    padding: "var(--space-sm) var(--space-md)",
    fontSize: "0.9375rem",
    color: active ? "var(--accent-muted)" : "var(--text-primary)",
    textDecoration: "none",
    borderRadius: "6px",
    transition: "background 0.15s",
  }
}

function navLinkHover(e: React.MouseEvent<HTMLElement>) {
  e.currentTarget.style.background = "var(--bg-elevated)"
}

function navLinkHoverOff(e: React.MouseEvent<HTMLElement>) {
  e.currentTarget.style.background = "transparent"
}
