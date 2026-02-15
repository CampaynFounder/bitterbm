"use client"

import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const skipToPayment = searchParams.get("payment") === "1"
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.signUp({ email, password })
      if (err) throw err
      if (skipToPayment) {
        router.push("/dashboard/payment")
      } else {
        router.push("/dashboard")
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Signup failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="section" style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-xl)" }}>
      <div style={{ maxWidth: 400, width: "100%" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>
          {skipToPayment ? "Create Account & Add Payment" : "Create Account"}
        </h1>
        <p style={{ marginBottom: "var(--space-xl)", color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
          {skipToPayment ? "Add your payment method to unlock full analysis." : "Save your results and continue building your case."}
        </p>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          <label style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              style={{
                display: "block",
                width: "100%",
                marginTop: "var(--space-xs)",
                padding: "var(--space-md)",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                color: "var(--text-primary)",
              }}
            />
          </label>
          <label style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
            Password (min 8 characters)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="••••••••"
              style={{
                display: "block",
                width: "100%",
                marginTop: "var(--space-xs)",
                padding: "var(--space-md)",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                color: "var(--text-primary)",
              }}
            />
          </label>
          {error && <p style={{ color: "var(--accent-cyan)", fontSize: "0.875rem" }}>{error}</p>}
          <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
            <button type="submit" disabled={loading} className="btn-primary" style={{ width: "100%", maxWidth: 320 }}>
            {loading ? "Creating account…" : "Create Account"}
            </button>
          </div>
        </form>
        <p style={{ marginTop: "var(--space-lg)", fontSize: "0.875rem", color: "var(--text-muted)" }}>
          Already have an account?{" "}
          <Link href="/assessment" style={{ color: "var(--accent-muted)" }}>
            Sign in
          </Link>
        </p>
      </div>
    </main>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <main className="section" style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      </main>
    }>
      <SignupForm />
    </Suspense>
  )
}
