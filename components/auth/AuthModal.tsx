"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"

type Props = {
  onClose: () => void
  onSuccess: () => void | Promise<void>
  saving?: boolean
}

function passwordStrength(pw: string): { score: number; label: string } {
  if (!pw) return { score: 0, label: "" }
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++
  if (/\d/.test(pw)) s++
  if (/[^a-zA-Z0-9]/.test(pw)) s++
  const labels = ["Weak", "Fair", "Good", "Strong", "Very strong"]
  return { score: Math.min(s, 5), label: labels[Math.min(s - 1, 4)] || "" }
}

export function AuthModal({ onClose, onSuccess, saving = false }: Props) {
  const [mode, setMode] = useState<"signup" | "login">("signup")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const strength = passwordStrength(password)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({ email, password })
        if (err) throw err
        await onSuccess()
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) throw err
        await onSuccess()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "var(--space-lg)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          position: "relative",
          background: "var(--bg-card)",
          borderRadius: "12px",
          border: "1px solid var(--border)",
          padding: "var(--space-xl)",
          maxWidth: 400,
          width: "100%",
          boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
          animation: "modalEnter 200ms ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="auth-modal-title" style={{ fontSize: "1.25rem", marginBottom: "var(--space-lg)", color: "var(--text-primary)" }}>
          {mode === "signup" ? "Create Account & Save Results" : "Sign In"}
        </h2>
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
                fontSize: "1rem",
              }}
            />
          </label>
          <label style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={mode === "signup"}
              placeholder={mode === "signup" ? "Min 8 characters" : "••••••••"}
              minLength={mode === "signup" ? 8 : undefined}
              style={{
                display: "block",
                width: "100%",
                marginTop: "var(--space-xs)",
                padding: "var(--space-md)",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                color: "var(--text-primary)",
                fontSize: "1rem",
              }}
            />
            {mode === "signup" && password && strength.label && (
              <span
                style={{
                  display: "block",
                  marginTop: "var(--space-xs)",
                  fontSize: "0.75rem",
                  color: strength.score >= 3 ? "var(--accent-cyan)" : "var(--accent-gold)",
                }}
              >
                {strength.label}
              </span>
            )}
          </label>
          {error && (
            <p style={{ color: "var(--accent-cyan)", fontSize: "0.875rem" }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || saving}
            className="btn-primary"
            style={{ width: "100%", marginTop: "var(--space-sm)" }}
          >
            {loading ? "Please wait…" : saving ? "Saving your results…" : mode === "signup" ? "Create Account & Save" : "Sign In"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setMode(mode === "signup" ? "login" : "signup")}
          style={{
            marginTop: "var(--space-md)",
            background: "none",
            border: "none",
            color: "var(--accent-muted)",
            fontSize: "0.875rem",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Sign up"}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: "var(--space-md)",
            right: "var(--space-md)",
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            fontSize: "1.25rem",
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
