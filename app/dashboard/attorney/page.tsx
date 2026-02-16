"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { UpgradeGate } from "@/components/dashboard/UpgradeGate"
import { US_STATES } from "@/lib/constants"

const inputStyle = { width: "100%", padding: "var(--space-md)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)", fontSize: "1rem" }

export default function AttorneyAnalysisPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [plan, setPlan] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [attorneyName, setAttorneyName] = useState("")
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
    supabase.from("user_profiles").select("state, retained_attorney_name").eq("id", user.id).maybeSingle().then(({ data }) => {
      const d = data as { state?: string; retained_attorney_name?: string } | null
      if (d?.state) setState(d.state ?? "")
      if (d?.retained_attorney_name) setAttorneyName(d.retained_attorney_name ?? "")
    })
  }, [user, plan])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!attorneyName.trim() || !state) return
    setSubmitting(true)
    try {
      await new Promise((r) => setTimeout(r, 1200))
      setResult("Attorney analysis will evaluate your attorney's track record. Backend integration coming soon.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !user) {
    return <main className="section" style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "var(--text-muted)" }}>Loading…</p></main>
  }

  return (
    <UpgradeGate plan={plan} feature="Attorney Analysis">
      <main className="section" style={{ minHeight: "80vh", paddingTop: "var(--space-2xl)", paddingBottom: "var(--space-2xl)" }}>
        <div className="container" style={{ maxWidth: 560, margin: "0 auto", animation: "fadeInUp 0.4s var(--ease-out-expo) both" }}>
          <Link href="/dashboard" style={{ display: "inline-block", marginBottom: "var(--space-lg)", color: "var(--accent-muted)", fontSize: "0.9375rem" }}>← Back to Dashboard</Link>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "var(--space-sm)", color: "var(--text-primary)" }}>Attorney Analysis</h1>
          <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", marginBottom: "var(--space-xl)", lineHeight: 1.6 }}>Evaluate whether your attorney has won cases with similar facts before similar judges.</p>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "var(--space-xs)", color: "var(--text-secondary)" }}>Your attorney name *</label>
              <input type="text" value={attorneyName} onChange={(e) => setAttorneyName(e.target.value)} placeholder="e.g. John Davis, Esq." required style={inputStyle} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "var(--space-xs)", color: "var(--text-secondary)" }}>State *</label>
              <select value={state} onChange={(e) => setState(e.target.value)} required style={{ ...inputStyle, cursor: "pointer" }}>
                {US_STATES.map((s) => <option key={s.value || "empty"} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <button type="submit" disabled={submitting} className="btn-primary" style={{ width: "100%", maxWidth: 320 }}>{submitting ? "Analyzing…" : "Analyze Attorney"}</button>
          </form>
          {result && <div style={{ marginTop: "var(--space-xl)", padding: "var(--space-xl)", background: "var(--bg-card)", borderRadius: "12px", border: "1px solid var(--border)", animation: "fadeInUp 0.3s var(--ease-out-expo) 0.1s both" }}><p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>{result}</p></div>}
        </div>
      </main>
    </UpgradeGate>
  )
}
