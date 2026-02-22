"use client"

import { useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"

export default function AdminLoginPage() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${typeof window !== "undefined" ? window.location.origin : ""}/admin/auth/callback`,
        },
      })
      if (err) throw err
      setSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <div className="max-w-md w-full p-6 text-center" style={{ padding: 'var(--space-lg)' }}>
          <h1 className="text-xl font-semibold mb-4" style={{ marginBottom: 'var(--space-md)' }}>Check your email</h1>
          <p className="mb-6" style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)' }}>
            We sent a magic link to <strong>{email}</strong>. Click it to sign in.
          </p>
          <Link href="/admin/login" className="underline" style={{ color: 'var(--accent-gold)' }}>
            Use a different email
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div className="max-w-md w-full p-6" style={{ padding: 'var(--space-lg)' }}>
        <h1 className="text-xl font-semibold mb-6" style={{ marginBottom: 'var(--space-lg)' }}>Admin sign in</h1>
        <form onSubmit={handleSubmit} className="space-y-4" style={{ gap: 'var(--space-md)' }}>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded focus:outline-none"
            style={{ padding: 'var(--space-sm) var(--space-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
          {error && <p className="text-sm" style={{ color: '#fca5a5' }}>{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Sending…" : "Send magic link"}
          </button>
        </form>
        <p className="mt-6 text-sm" style={{ marginTop: 'var(--space-lg)', color: 'var(--text-muted)' }}>
          Sign in to continue. You will be redirected after authentication.
        </p>
      </div>
    </div>
  )
}
