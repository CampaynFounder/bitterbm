"use client"

import { useState, useEffect } from "react"
import { loadStripe } from "@stripe/stripe-js"
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js"
import { supabase } from "@/lib/supabase"

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null

type StoredPaymentMethod = {
  type: string
  last4: string | null
  brand: string | null
  issuer: string | null
  pm_metadata: Record<string, unknown>
}

function SetupForm({
  onSuccess,
  plan,
}: {
  onSuccess: (pm: StoredPaymentMethod) => void
  plan: "monthly" | "flat" | null
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return

    setLoading(true)
    setError(null)

    try {
      const result = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: typeof window !== "undefined" ? `${window.location.origin}/dashboard/payment?validated=1` : "/dashboard/payment",
          payment_method_data: {},
        },
      })

      if (result.error) {
        setError(result.error.message ?? "Validation failed")
        setLoading(false)
        return
      }

      const si = (result as { setupIntent?: { payment_method?: string } }).setupIntent
      const pm = si?.payment_method
      const pmId = typeof pm === "string" ? pm : null
      if (!pmId || typeof pmId !== "string") {
        setError("No payment method returned")
        setLoading(false)
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError("Session expired")
        setLoading(false)
        return
      }

      const res = await fetch("/api/store-payment-method", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ paymentMethodId: pmId }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to store payment method")
        setLoading(false)
        return
      }

      onSuccess(data.paymentMethod)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
      <PaymentElement
        options={{
          layout: "tabs",
          paymentMethodOrder: ["card"],
        }}
      />
      {error && (
        <p style={{ color: "var(--accent-cyan)", fontSize: "0.875rem" }}>{error}</p>
      )}
      <button
        type="submit"
        disabled={!stripe || loading}
        className="btn-primary"
        style={{ width: "100%", maxWidth: 280, alignSelf: "center" }}
      >
        {loading ? "Validating…" : "Validate Payment Method ($0)"}
      </button>
    </form>
  )
}

export function PaymentForm({
  onStored,
  plan,
}: {
  onStored?: (pm: StoredPaymentMethod) => void
  plan?: "monthly" | "flat" | null
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [stored, setStored] = useState<StoredPaymentMethod | null>(null)

  useEffect(() => {
    async function handleRedirect() {
      if (typeof window === "undefined") return
      const params = new URLSearchParams(window.location.search)
      const secret = params.get("setup_intent_client_secret")
      if (!secret || !stripePromise) return

      const stripe = await stripePromise
      if (!stripe) return
      const { setupIntent } = await stripe.retrieveSetupIntent(secret)
      if (setupIntent?.status !== "succeeded") return

      const pmId = typeof setupIntent.payment_method === "string"
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id
      if (!pmId) return

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch("/api/store-payment-method", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ paymentMethodId: pmId }),
      })
      const data = await res.json()
      if (res.ok && data.paymentMethod) {
        setStored(data.paymentMethod)
        onStored?.(data.paymentMethod)
        window.history.replaceState({}, "", window.location.pathname)
      }
    }
    handleRedirect()
  }, [onStored])

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "")
      if (params.get("setup_intent_client_secret")) return

      const { data: existing } = await supabase
        .from("payment_methods")
        .select("type, last4, brand, issuer, pm_metadata")
        .eq("user_id", session.user.id)
        .eq("is_default", true)
        .maybeSingle()

      if (existing) {
        setStored({
          type: existing.type ?? "card",
          last4: existing.last4,
          brand: existing.brand,
          issuer: existing.issuer,
          pm_metadata: (existing.pm_metadata as Record<string, unknown>) ?? {},
        })
        return
      }

      const res = await fetch("/api/create-setup-intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan: plan ?? null }),
      })

      const data = await res.json()
      if (data.clientSecret) {
        setClientSecret(data.clientSecret)
      }
    }
    init()
  }, [plan])

  function handleSuccess(pm: StoredPaymentMethod) {
    setStored(pm)
    onStored?.(pm)
  }

  if (!stripePromise) {
    return (
      <p style={{ color: "var(--text-muted)", fontSize: "0.9375rem" }}>
        Stripe is not configured. Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
      </p>
    )
  }

  if (stored) {
    return (
      <div
        style={{
          padding: "var(--space-lg)",
          background: "var(--bg-elevated)",
          borderRadius: "12px",
          border: "1px solid var(--border)",
        }}
      >
        <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "var(--space-xs)" }}>
          Payment method on file
        </p>
        <p style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--text-primary)" }}>
          {stored.type === "card" && stored.brand
            ? `${stored.brand.charAt(0).toUpperCase() + stored.brand.slice(1)} •••• ${stored.last4 ?? "****"}`
            : stored.type === "klarna"
            ? "Klarna"
            : stored.type === "cashapp"
            ? "Cash App"
            : `•••• ${stored.last4 ?? "****"}`}
        </p>
        {stored.issuer && (
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>Issuer: {stored.issuer}</p>
        )}
        <p style={{ marginTop: "var(--space-md)", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
          View and manage on your{" "}
          <a href="/dashboard/profile" style={{ color: "var(--accent-muted)" }}>
            profile page
          </a>
          .
        </p>
      </div>
    )
  }

  if (!clientSecret) {
    return (
      <p style={{ color: "var(--text-muted)" }}>Loading payment form…</p>
    )
  }

  const options = {
    clientSecret,
    appearance: {
      theme: "night" as const,
      variables: {
        colorPrimary: "#3b82f6",
        colorBackground: "#0f1218",
        colorText: "#f8fafc",
        colorDanger: "#22d3ee",
        borderRadius: "8px",
      },
    },
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <SetupForm onSuccess={handleSuccess} plan={plan ?? null} />
    </Elements>
  )
}
