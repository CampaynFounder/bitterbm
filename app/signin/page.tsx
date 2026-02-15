"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { data: { user }, error: err } = await supabase.auth.signInWithPassword({ email, password })
      if (err) throw err
      if (user) {
        const { data: sub } = await supabase.from("subscriptions").select("plan").eq("user_id", user.id).maybeSingle()
        const plan = (sub as { plan?: string } | null)?.plan
        if (plan === "monthly" || plan === "flat") {
          router.push("/dashboard/analysis")
          return
        }
      }
      router.push("/dashboard")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign in failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="section" style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-xl)" }}>
      <div style={{ maxWidth: 400, width: "100%" }}>
        <Link
          href="/"
          style={{ display: "inline-block", marginBottom: "var(--space-lg)", color: "var(--accent-muted)", fontSize: "0.9375rem", textDecoration: "none" }}
        >
          ← Back
        </Link>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>Sign in</h1>
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
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
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
            <button type="submit" disabled={loading} className="btn-primary" style={{ width: "100%", maxWidth: 280 }}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>
        <p style={{ marginTop: "var(--space-lg)", fontSize: "0.875rem", color: "var(--text-muted)" }}>
          Don&apos;t have an account?{" "}
          <Link href="/signup" style={{ color: "var(--accent-muted)" }}>
            Sign up
          </Link>
        </p>
      </div>
    </main>
  )
}
