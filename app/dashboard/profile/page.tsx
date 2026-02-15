"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { US_STATES } from "@/lib/constants"

const GOALS = [
  { value: "sole_custody", label: "Sole custody" },
  { value: "joint_custody", label: "Joint custody" },
  { value: "modification", label: "Custody modification" },
  { value: "enforcement", label: "Enforcement" },
  { value: "other", label: "Other" },
]

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [state, setState] = useState("")
  const [county, setCounty] = useState("")
  const [primaryGoal, setPrimaryGoal] = useState("")
  const [childAge, setChildAge] = useState("")
  const [childGrade, setChildGrade] = useState("")
  const [childInterests, setChildInterests] = useState("")
  const [situationSynopsis, setSituationSynopsis] = useState("")
  const [retainedAttorneyName, setRetainedAttorneyName] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<{ type: string; last4: string | null; brand: string | null; issuer: string | null; pm_metadata?: Record<string, unknown> } | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/assessment")
        return
      }
      setUser(session.user as { id: string })
    })
  }, [router])

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from("user_profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("payment_methods").select("type, last4, brand, issuer, pm_metadata").eq("user_id", user.id).eq("is_default", true).maybeSingle(),
    ]).then(([profileRes, pmRes]) => {
      if (profileRes.data) {
        const d = profileRes.data
        setState(d.state ?? "")
        setCounty(d.county ?? "")
        setPrimaryGoal(d.primary_goal ?? "")
        setChildAge(d.child_age ?? "")
        setChildGrade(d.child_grade ?? "")
        setChildInterests(d.child_interests ?? "")
        setSituationSynopsis(d.situation_synopsis ?? "")
        setRetainedAttorneyName(d.retained_attorney_name ?? "")
      }
      if (pmRes.data) setPaymentMethod(pmRes.data)
      setLoading(false)
    })
  }, [user])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    try {
      await supabase.from("user_profiles").upsert({
        id: user.id,
        state: state || null,
        county: county || null,
        primary_goal: primaryGoal || null,
        child_age: childAge || null,
        child_grade: childGrade || null,
        child_interests: childInterests || null,
        situation_synopsis: situationSynopsis.slice(0, 500) || null,
        retained_attorney_name: retainedAttorneyName || null,
        updated_at: new Date().toISOString(),
      })
      router.push("/dashboard")
    } finally {
      setSaving(false)
    }
  }

  if (loading || !user) {
    return (
      <main className="section" style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      </main>
    )
  }

  return (
    <main className="section" style={{ minHeight: "80vh", paddingTop: "var(--space-xl)", paddingBottom: "var(--space-2xl)" }}>
      <div className="container" style={{ maxWidth: 520 }}>
        <Link href="/dashboard" style={{ display: "inline-block", marginBottom: "var(--space-lg)", color: "var(--accent-muted)", fontSize: "0.9375rem" }}>
          ← Back to Dashboard
        </Link>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "var(--space-lg)", color: "var(--text-primary)" }}>Profile</h1>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "var(--space-xs)", color: "var(--text-secondary)" }}>
              State <span style={{ color: "var(--accent-cyan)" }}>*</span>
            </label>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              required
              style={{ width: "100%", padding: "var(--space-md)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)", fontSize: "1rem" }}
            >
              {US_STATES.map((s) => (
                <option key={s.value || "empty"} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "var(--space-xs)", color: "var(--text-secondary)" }}>
              County <span style={{ color: "var(--accent-cyan)" }}>*</span>
            </label>
            <input
              type="text"
              value={county}
              onChange={(e) => setCounty(e.target.value)}
              required
              placeholder="e.g. Fulton"
              style={{ width: "100%", padding: "var(--space-md)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)" }}
            />
          </div>
          {paymentMethod && (
            <div
              style={{
                padding: "var(--space-md)",
                background: "var(--bg-elevated)",
                borderRadius: "8px",
                border: "1px solid var(--border)",
              }}
            >
              <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "var(--space-xs)" }}>Payment method on file</p>
              <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>
                {paymentMethod.type === "card" && paymentMethod.brand
                  ? `${paymentMethod.brand.charAt(0).toUpperCase() + paymentMethod.brand.slice(1)} •••• ${paymentMethod.last4 ?? "****"}`
                  : paymentMethod.type === "klarna"
                  ? "Klarna"
                  : paymentMethod.type === "cashapp"
                  ? "Cash App"
                  : `•••• ${paymentMethod.last4 ?? "****"}`}
              </p>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "var(--space-xs)" }}>
                {paymentMethod.issuer && <p>Issuer: {paymentMethod.issuer}</p>}
                {paymentMethod.pm_metadata && (
                  <>
                    {paymentMethod.pm_metadata.network && (
                      <p>Scheme: {String(paymentMethod.pm_metadata.network)}</p>
                    )}
                    {paymentMethod.pm_metadata.funding && (
                      <p>Funding: {String(paymentMethod.pm_metadata.funding)}</p>
                    )}
                  </>
                )}
              </div>
              <Link href="/dashboard/payment" style={{ fontSize: "0.8125rem", color: "var(--accent-muted)", marginTop: "var(--space-xs)", display: "inline-block" }}>
                Update payment method
              </Link>
            </div>
          )}
          <div>
            <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "var(--space-sm)", color: "var(--text-secondary)" }}>
              Primary goal
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
              {GOALS.map((g) => (
                <label key={g.value} style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="goal"
                    value={g.value}
                    checked={primaryGoal === g.value}
                    onChange={() => setPrimaryGoal(g.value)}
                  />
                  {g.label}
                </label>
              ))}
            </div>
          </div>
          <details style={{ fontSize: "0.9375rem" }}>
            <summary style={{ cursor: "pointer", color: "var(--text-secondary)" }}>Optional: Child & case details</summary>
            <div style={{ marginTop: "var(--space-md)", display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "var(--space-xs)", color: "var(--text-secondary)" }}>Child age</label>
                <input type="text" value={childAge} onChange={(e) => setChildAge(e.target.value)} placeholder="e.g. 8" style={{ width: "100%", padding: "var(--space-md)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "var(--space-xs)", color: "var(--text-secondary)" }}>Child grade</label>
                <input type="text" value={childGrade} onChange={(e) => setChildGrade(e.target.value)} placeholder="e.g. 3rd" style={{ width: "100%", padding: "var(--space-md)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "var(--space-xs)", color: "var(--text-secondary)" }}>Child interests</label>
                <input type="text" value={childInterests} onChange={(e) => setChildInterests(e.target.value)} placeholder="Sports, activities" style={{ width: "100%", padding: "var(--space-md)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "var(--space-xs)", color: "var(--text-secondary)" }}>Situation synopsis (max 500 chars)</label>
                <textarea
                  value={situationSynopsis}
                  onChange={(e) => setSituationSynopsis(e.target.value.slice(0, 500))}
                  rows={4}
                  placeholder="Brief summary to help match your case..."
                  style={{ width: "100%", padding: "var(--space-md)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)", resize: "vertical" }}
                />
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "var(--space-xs)" }}>{situationSynopsis.length}/500</p>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "var(--space-xs)", color: "var(--text-secondary)" }}>Retained attorney name</label>
                <input type="text" value={retainedAttorneyName} onChange={(e) => setRetainedAttorneyName(e.target.value)} placeholder="Optional" style={{ width: "100%", padding: "var(--space-md)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)" }} />
              </div>
            </div>
          </details>
          <button type="submit" disabled={saving} className="btn-primary" style={{ width: "100%" }}>
            {saving ? "Saving…" : "Save Profile"}
          </button>
        </form>
        <p style={{ marginTop: "var(--space-md)", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
          Adding details helps us match your case to relevant precedents. Only state and county are required.
        </p>
      </div>
    </main>
  )
}
