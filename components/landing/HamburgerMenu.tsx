"use client"

import { useState } from "react"
import Link from "next/link"

const MENU_ITEMS = [
  { href: "/assessment", label: "Assessment" },
  { href: "/signin", label: "Sign in" },
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
] as const

type Props = {
  visible?: boolean
}

export function HamburgerMenu({ visible = true }: Props) {
  const [open, setOpen] = useState(false)

  if (!visible) return null

  return (
    <nav
      className="hamburger-nav"
      role="navigation"
      aria-label="Main menu"
      style={{
        position: "fixed",
        top: "var(--space-md)",
        right: "var(--space-md)",
        zIndex: 50,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="hamburger-menu-panel"
        aria-label={open ? "Close menu" : "Open menu"}
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 5,
          width: 44,
          height: 44,
          padding: 10,
          background: "rgba(8, 9, 12, 0.8)",
          border: "1px solid var(--border-accent)",
          borderRadius: "8px",
          cursor: "pointer",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <span
          style={{
            display: "block",
            width: 20,
            height: 2,
            background: "var(--text-primary)",
            borderRadius: 1,
            transform: open ? "rotate(45deg) translate(5px, 5px)" : "none",
            transition: "transform 0.2s ease",
          }}
        />
        <span
          style={{
            display: "block",
            width: 20,
            height: 2,
            background: "var(--text-primary)",
            borderRadius: 1,
            opacity: open ? 0 : 1,
            transition: "opacity 0.2s ease",
          }}
        />
        <span
          style={{
            display: "block",
            width: 20,
            height: 2,
            background: "var(--text-primary)",
            borderRadius: 1,
            transform: open ? "rotate(-45deg) translate(5px, -5px)" : "none",
            transition: "transform 0.2s ease",
          }}
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
          minWidth: 180,
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
        {MENU_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            style={{
              display: "block",
              padding: "var(--space-sm) var(--space-md)",
              fontSize: "0.9375rem",
              color: "var(--text-primary)",
              textDecoration: "none",
              borderRadius: "6px",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-elevated)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent"
            }}
          >
            {item.label}
          </Link>
        ))}
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
  )
}
