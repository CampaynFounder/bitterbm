"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { UpgradeGate } from "@/components/dashboard/UpgradeGate"
import { US_STATES } from "@/lib/constants"

const inputStyle = { width: "100%", padding: "var(--space-md)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)", fontSize: "1rem" }

type AttorneyParty = "user_attorney" | "alienating_parent_attorney"

export default function AttorneyAnalysisPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [plan, setPlan] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [party, setParty] = useState<AttorneyParty>("user_attorney")
  const [attorneyName, setAttorneyName] = useState("")
  const [state, setState] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedAttorneys, setSavedAttorneys] = useState<{ id: string; attorney_name: string; state: string; party: string }[]>([])

  function fetchSavedAttorneys() {
    if (!user) return
    supabase.from("user_attorney_analyses").select("id, attorney_name, state, party").eq("user_id", user.id).order("created_at", { ascending: false }).then(({ data }) => {
      setSavedAttorneys((data ?? []) as { id: string; attorney_name: string; state: string; party: string }[])
    })
  }

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
      if (party === "user_attorney" && d?.retained_attorney_name) setAttorneyName(d.retained_attorney_name ?? "")
    })
  }, [user, plan])

  useEffect(() => {
    if (!user || plan !== "flat") return
    fetchSavedAttorneys()
  }, [user, plan])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!attorneyName.trim() || !state || !user) return
    setSubmitting(true)
    setError(null)
    setResult(null)
    try {
      const { error: err } = await supabase.from("user_attorney_analyses").insert({
        user_id: user.id,
        attorney_name: attorneyName.trim(),
        state,
        party,
        analysis_summary: null,
      })
      if (err) throw err
      fetchSavedAttorneys()
      setResult(
        party === "user_attorney"
          ? `${attorneyName.trim()} saved. Attorney analysis will evaluate their track record. Backend integration coming soon.`
          : `Alienating parent's attorney ${attorneyName.trim()} saved. Analysis will consider their strengths/weaknesses when building your strategy. Backend integration coming soon.`
      )
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save attorney.")
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
          <h1 style={{ fontSize: "1.5rem", marginBottom: "var(--space-sm)", color: "var(--text-primary)", textAlign: "center" }}>Attorney Analysis</h1>
          <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", marginBottom: "var(--space-xl)", lineHeight: 1.6, textAlign: "center" }}>
            Add your attorney or the alienating parent&apos;s attorney. Full case strategy will consider both.
          </p>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)", alignItems: "center" }}>
            <div style={{ width: "100%" }}>
              <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "var(--space-xs)", color: "var(--text-secondary)" }}>Whose attorney? *</label>
              <div style={{ display: "flex", gap: "var(--space-lg)", marginBottom: "var(--space-sm)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)", cursor: "pointer", fontSize: "0.9375rem" }}>
                  <input type="radio" name="party" value="user_attorney" checked={party === "user_attorney"} onChange={() => setParty("user_attorney")} />
                  My attorney
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)", cursor: "pointer", fontSize: "0.9375rem" }}>
                  <input type="radio" name="party" value="alienating_parent_attorney" checked={party === "alienating_parent_attorney"} onChange={() => setParty("alienating_parent_attorney")} />
                  Alienating parent&apos;s attorney
                </label>
              </div>
            </div>
            <div style={{ width: "100%" }}>
              <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "var(--space-xs)", color: "var(--text-secondary)" }}>{party === "user_attorney" ? "Your" : "Their"} attorney name *</label>
              <input type="text" value={attorneyName} onChange={(e) => setAttorneyName(e.target.value)} placeholder="e.g. John Davis, Esq." required style={inputStyle} />
            </div>
            <div style={{ width: "100%" }}>
              <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "var(--space-xs)", color: "var(--text-secondary)" }}>State *</label>
              <select value={state} onChange={(e) => setState(e.target.value)} required style={{ ...inputStyle, cursor: "pointer" }}>
                {US_STATES.map((s) => <option key={s.value || "empty"} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
              <button type="submit" disabled={submitting} className="btn-primary" style={{ width: "100%", maxWidth: 320 }}>{submitting ? "Analyzing…" : "Analyze Attorney"}</button>
            </div>
          </form>
          {error && <div style={{ marginTop: "var(--space-xl)", padding: "var(--space-md)", background: "rgba(34, 211, 238, 0.1)", borderRadius: "8px", border: "1px solid var(--accent-cyan)", color: "var(--accent-cyan)", fontSize: "0.9375rem" }}>{error}</div>}
          {result && <div style={{ marginTop: "var(--space-xl)", padding: "var(--space-xl)", background: "var(--bg-card)", borderRadius: "12px", border: "1px solid var(--border)", animation: "fadeInUp 0.3s var(--ease-out-expo) 0.1s both", textAlign: "center" }}><p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>{result}</p></div>}
          {savedAttorneys.length > 0 && (
            <div style={{ marginTop: "var(--space-xl)" }}>
              <h2 style={{ fontSize: "1.125rem", marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>Saved attorneys</h2>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {savedAttorneys.map((a) => (
                  <li key={a.id} style={{ padding: "var(--space-sm) 0", borderBottom: "1px solid var(--border)", fontSize: "0.9375rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>{a.attorney_name} ({a.state})</span>
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>{a.party === "user_attorney" ? "My attorney" : "Alienating parent's"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>
    </UpgradeGate>
  )
}
