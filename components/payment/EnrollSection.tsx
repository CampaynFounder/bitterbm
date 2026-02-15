"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { loadStripe } from "@stripe/stripe-js"
import { supabase } from "@/lib/supabase"

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null

export function EnrollSection() {
  const router = useRouter()
  const [plan, setPlan] = useState<"monthly" | "flat">("monthly")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [subscriptionPlan, setSubscriptionPlan] = useState<string | null>(null)
  const [hasPaymentMethod, setHasPaymentMethod] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      Promise.all([
        supabase.from("subscriptions").select("plan").eq("user_id", session.user.id).single(),
        supabase.from("payment_methods").select("id").eq("user_id", session.user.id).eq("is_default", true).maybeSingle(),
      ]).then(([subRes, pmRes]) => {
        if (subRes.data) setSubscriptionPlan(subRes.data.plan)
        if (pmRes.data) setHasPaymentMethod(true)
      })
    })
  }, [])

  async function handleEnroll() {
    if (!hasPaymentMethod) {
      setError("Add a payment method above first.")
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setError("Session expired")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/enroll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan }),
      })

      const data = await res.json()

      if (res.ok && data.requiresAction && data.clientSecret && stripePromise) {
        const stripe = await stripePromise
        if (!stripe) {
          setError("Stripe not loaded")
          setLoading(false)
          return
        }
        const { error: confirmError } = await stripe.confirmCardPayment(data.clientSecret)
        if (confirmError) {
          setError(confirmError.message ?? "Authentication failed")
          setLoading(false)
          return
        }
        setSubscriptionPlan(plan)
        router.refresh()
      } else if (res.ok && data.success) {
        setSubscriptionPlan(plan)
        router.refresh()
      } else {
        setError(data.error ?? "Enroll failed")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  if (subscriptionPlan !== "free" && subscriptionPlan !== null) {
    return (
      <div
        style={{
          marginTop: "var(--space-lg)",
          padding: "var(--space-md)",
          background: "var(--bg-elevated)",
          borderRadius: "8px",
          border: "1px solid var(--border)",
        }}
      >
        <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>
          You’re enrolled on the <strong>{subscriptionPlan === "monthly" ? "monthly" : "one-time"}</strong> plan.
        </p>
      </div>
    )
  }

  return (
    <div
      style={{
        marginTop: "var(--space-xl)",
        padding: "var(--space-lg)",
        background: "var(--bg-elevated)",
        borderRadius: "12px",
        border: "1px solid var(--border)",
      }}
    >
      <h2 style={{ fontSize: "1.125rem", marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>
        Enroll in a plan
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
        <div style={{ display: "flex", gap: "var(--space-md)", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", cursor: "pointer" }}>
            <input
              type="radio"
              name="enrollPlan"
              value="monthly"
              checked={plan === "monthly"}
              onChange={() => setPlan("monthly")}
            />
            <span style={{ color: "var(--text-primary)" }}>$49/month</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", cursor: "pointer" }}>
            <input
              type="radio"
              name="enrollPlan"
              value="flat"
              checked={plan === "flat"}
              onChange={() => setPlan("flat")}
            />
            <span style={{ color: "var(--text-primary)" }}>$599 one-time</span>
          </label>
        </div>
        {error && <p style={{ color: "var(--accent-cyan)", fontSize: "0.875rem" }}>{error}</p>}
        <button
          type="button"
          onClick={handleEnroll}
          disabled={!hasPaymentMethod || loading}
          className="btn-primary"
          style={{ alignSelf: "flex-start" }}
        >
          {loading ? "Processing…" : hasPaymentMethod ? "Enroll now" : "Add payment method above first"}
        </button>
      </div>
    </div>
  )
}
