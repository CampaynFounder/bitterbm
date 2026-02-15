"use client"

import { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { PaymentForm } from "@/components/payment/PaymentForm"
import { EnrollSection } from "@/components/payment/EnrollSection"

function PaymentContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user, setUser] = useState<{ id: string } | null>(null)
  const validated = searchParams.get("validated") === "1"

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/signin")
        return
      }
      setUser(session.user as { id: string })
    })
  }, [router])

  useEffect(() => {
    if (!user) return
    const setupIntentId = searchParams.get("setup_intent")
    const setupIntentClientSecret = searchParams.get("setup_intent_client_secret")
    if (setupIntentId || setupIntentClientSecret) {
      router.replace("/dashboard/payment", { scroll: false })
    }
  }, [user, searchParams, router])

  if (!user) {
    return (
      <main className="section" style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      </main>
    )
  }

  return (
    <main className="section" style={{ minHeight: "80vh", paddingTop: "var(--space-xl)", paddingBottom: "var(--space-2xl)" }}>
      <div className="container" style={{ maxWidth: 520, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Link
          href="/dashboard"
          style={{
            alignSelf: "flex-start",
            marginBottom: "var(--space-lg)",
            color: "var(--accent-muted)",
            fontSize: "0.9375rem",
            textDecoration: "none",
          }}
        >
          ← Back to Dashboard
        </Link>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "var(--space-md)", color: "var(--text-primary)", textAlign: "center" }}>
          Add Payment Method
        </h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-xl)", textAlign: "center", maxWidth: 420 }}>
          Validate your payment method with a $0 charge. No charge until you enroll in a plan.
        </p>
        <div
          style={{
            width: "100%",
            padding: "var(--space-xl)",
            background: "var(--bg-card)",
            borderRadius: "12px",
            border: "1px solid var(--border)",
          }}
        >
          <PaymentForm />
        </div>
        <EnrollSection />
      </div>
    </main>
  )
}

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <main className="section" style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        </main>
      }
    >
      <PaymentContent />
    </Suspense>
  )
}
