"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"

export default function PaymentPage() {
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace("/assessment")
    })
  }, [router])

  return (
    <main className="section" style={{ minHeight: "80vh", paddingTop: "var(--space-xl)", paddingBottom: "var(--space-2xl)" }}>
      <div className="container" style={{ maxWidth: 520 }}>
        <Link href="/dashboard" style={{ display: "inline-block", marginBottom: "var(--space-lg)", color: "var(--accent-muted)", fontSize: "0.9375rem" }}>
          ← Back to Dashboard
        </Link>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>Payment</h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-xl)" }}>
          Stripe Payment Element will be integrated here. Add your Stripe API keys to enable payment method setup and plan enrollment.
        </p>
        <div
          style={{
            padding: "var(--space-xl)",
            background: "var(--bg-card)",
            borderRadius: "12px",
            border: "1px dashed var(--border-accent)",
          }}
        >
          <p style={{ fontSize: "0.9375rem", color: "var(--text-muted)" }}>
            Payment flow: Save payment method ($0 validation) → One-tap enroll ($49/mo or $599 flat)
          </p>
        </div>
      </div>
    </main>
  )
}
