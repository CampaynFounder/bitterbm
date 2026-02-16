"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { UpgradeGate } from "@/components/dashboard/UpgradeGate"
import { US_STATES } from "@/lib/constants"

const inputStyle = { width: "100%", padding: "var(--space-md)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)", fontSize: "1rem" }

export default function JudgeAnalysisPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [plan, setPlan] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [judgeName, setJudgeName] = useState("")
  const [state, setState] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace("/signin"); return }
      setUser(session.user as { id: string })
      supabase.from("subscriptions").select("plan").eq("user_id", session.user.id).maybeSingle().then(
        ({ data }) => { setPlan((data as { plan?: string } | null)?.plan ?? "free"); setLoading(false) },
        () => { setPlan("free"); setLoading(false) }
      )
    })
  }, [router])

  useEffect(() => {
    if (!user || plan !== "flat") return
    supabase.from("user_profiles").select("state").eq("id", user.id).maybeSingle().then(({ data }) => {
      if ((data as { state?: string } | null)?.state) setState((data as { state?: string }).state ?? "")
    })
  }, [user, plan])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!judgeName.trim() || !state) return
    setSubmitting(true)
    try {
      await new Promise((r) => setTimeout(r, 1200))
      setResult("Judge analysis will tailor your strategy to how your judge rules on alienation. Backend integration coming soon.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !user) {
    return <main className="section" style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "var(--text-muted)" }}>Loading…</p></main>
  }

  return (
    <UpgradeGate plan={plan} feature="Judge Analysis">
      <main className="section" style={{ minHeight: "80vh", paddingTop: "var(--space-2xl)", paddingBottom: "var(--space-2xl)" }}>
        <div className="container" style={{ maxWidth: 560, margin: "0 auto", animation: "fadeInUp 0.4s var(--ease-out-expo) both" }}>
          <Link href="/dashboard" style={{ display: "inline-block", marginBottom: "var(--space-lg)", color: "var(--accent-muted)", fontSize: "0.9375rem" }}>← Back to Dashboard</Link>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "var(--space-sm)", color: "var(--text-primary)", textAlign: "center" }}>Judge Analysis</h1>
          <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", marginBottom: "var(--space-xl)", lineHeight: 1.6, textAlign: "center" }}>Understand how your judge has ruled on alienation and custody cases.</p>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)", alignItems: "center" }}>
            <div style={{ width: "100%" }}>
              <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "var(--space-xs)", color: "var(--text-secondary)" }}>Judge name *</label>
              <input type="text" value={judgeName} onChange={(e) => setJudgeName(e.target.value)} placeholder="e.g. Hon. Sarah Johnson" required style={inputStyle} />
            </div>
            <div style={{ width: "100%" }}>
              <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "var(--space-xs)", color: "var(--text-secondary)" }}>State *</label>
              <select value={state} onChange={(e) => setState(e.target.value)} required style={{ ...inputStyle, cursor: "pointer" }}>
                {US_STATES.map((s) => <option key={s.value || "empty"} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
              <button type="submit" disabled={submitting} className="btn-primary" style={{ width: "100%", maxWidth: 320 }}>{submitting ? "Analyzing…" : "Analyze Judge"}</button>
            </div>
          </form>
          {result && <div style={{ marginTop: "var(--space-xl)", padding: "var(--space-xl)", background: "var(--bg-card)", borderRadius: "12px", border: "1px solid var(--border)", animation: "fadeInUp 0.3s var(--ease-out-expo) 0.1s both", textAlign: "center" }}><p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>{result}</p></div>}
        </div>
      </main>
    </UpgradeGate>
  )
}
