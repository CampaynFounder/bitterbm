"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { PricingModal } from "@/components/pricing/PricingModal"

type User = { id: string; email?: string }
type Profile = {
  state: string | null
  county: string | null
  situation_synopsis: string | null
  child_age: string | null
  child_grade: string | null
  retained_attorney_name: string | null
}
type Analysis = {
  id: string
  alienation_score: number | null
  custody_change_likelihood: number | null
  summary: string | null
  created_at: string
}
type Evidence = { id: string; file_name: string | null; created_at: string; processing_status: string }
type Subscription = { plan: string; status: string }

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPricingModal, setShowPricingModal] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/assessment")
        return
      }
      setUser(session.user as User)
    })
  }, [router])

  useEffect(() => {
    if (!user) return
    const uid = user.id

    async function load() {
      setLoading(true)
      const [profileRes, casesRes, subRes] = await Promise.all([
        supabase.from("user_profiles").select("state, county, situation_synopsis, child_age, child_grade, retained_attorney_name").eq("id", uid).maybeSingle(),
        supabase.from("cases").select("id").eq("user_id", uid),
        supabase.from("subscriptions").select("plan, status").eq("user_id", uid).maybeSingle(),
      ])
      setProfile((profileRes.data as Profile) ?? null)
      setSubscription((subRes.data as Subscription) ?? null)

      const caseIds = (casesRes.data ?? []).map((c: { id: string }) => c.id)
      if (caseIds.length > 0) {
        const [analysisRes, evidenceRes] = await Promise.all([
          supabase.from("analysis_results").select("id, alienation_score, custody_change_likelihood, summary, created_at").in("case_id", caseIds).order("created_at", { ascending: false }),
          supabase.from("evidence").select("id, file_name, created_at, processing_status").eq("user_id", uid).order("created_at", { ascending: false }),
        ])
        setAnalyses((analysisRes.data as Analysis[]) ?? [])
        setEvidence((evidenceRes.data as Evidence[]) ?? [])
      }
      setLoading(false)
    }

    load()
  }, [user])

  const latestAnalysis = analyses[0]
  const isPaid = subscription?.plan && subscription.plan !== "free"

  if (loading || !user) {
    return (
      <main className="section" style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      </main>
    )
  }

  return (
    <main className="section" style={{ minHeight: "80vh", paddingTop: "var(--space-xl)", paddingBottom: "var(--space-2xl)" }}>
      <div className="container" style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)", maxWidth: 1100 }}>
        <header style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-md)", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", color: "var(--text-primary)" }}>Your Case Dashboard</h1>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "var(--space-md)", alignItems: "center" }}>
            <button
              type="button"
              className="btn-primary"
              style={{ maxWidth: 280 }}
              onClick={() => (isPaid ? router.push("/assessment") : setShowPricingModal(true))}
            >
              Analyze More Evidence
            </button>
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut()
                router.replace("/assessment")
              }}
              style={{
                background: "none",
                border: "1px solid var(--border-accent)",
                color: "var(--text-secondary)",
                fontSize: "0.9375rem",
                padding: "var(--space-sm) var(--space-md)",
                borderRadius: "8px",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Log out
            </button>
          </div>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "var(--space-xl)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
            {profile && (
              <section
                style={{
                  padding: "var(--space-xl)",
                  background: "var(--bg-card)",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                }}
              >
                <h2 style={{ fontSize: "1.125rem", marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>Situation Details</h2>
                <dl style={{ display: "grid", gap: "var(--space-sm)", fontSize: "0.9375rem" }}>
                  {profile.state && <div><dt style={{ color: "var(--text-muted)" }}>State</dt><dd>{profile.state}</dd></div>}
                  {profile.county && <div><dt style={{ color: "var(--text-muted)" }}>County</dt><dd>{profile.county}</dd></div>}
                  {profile.child_age && <div><dt style={{ color: "var(--text-muted)" }}>Child age</dt><dd>{profile.child_age}</dd></div>}
                  {profile.child_grade && <div><dt style={{ color: "var(--text-muted)" }}>Child grade</dt><dd>{profile.child_grade}</dd></div>}
                  {profile.retained_attorney_name && <div><dt style={{ color: "var(--text-muted)" }}>Attorney</dt><dd>{profile.retained_attorney_name}</dd></div>}
                  {profile.situation_synopsis && (
                    <div><dt style={{ color: "var(--text-muted)" }}>Synopsis</dt><dd>{profile.situation_synopsis}</dd></div>
                  )}
                </dl>
                <Link
                  href="/dashboard/profile"
                  style={{ marginTop: "var(--space-md)", display: "inline-block", fontSize: "0.875rem", color: "var(--accent-muted)" }}
                >
                  Edit profile
                </Link>
              </section>
            )}

            {latestAnalysis && (
              <section
                style={{
                  padding: "var(--space-xl)",
                  background: "var(--bg-card)",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                }}
              >
                <h2 style={{ fontSize: "1.125rem", marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>Latest Analysis</h2>
                <div style={{ display: "flex", gap: "var(--space-xl)", marginBottom: "var(--space-md)" }}>
                  <div>
                    <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Evidence relevance</p>
                    <p style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--accent-muted)" }}>
                      {latestAnalysis.alienation_score ?? "—"}%
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Custody change likelihood</p>
                    <p style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--accent-cyan)" }}>
                      {latestAnalysis.custody_change_likelihood ?? "—"}%
                    </p>
                  </div>
                </div>
                {latestAnalysis.summary && <p style={{ fontSize: "0.9375rem", lineHeight: 1.6 }}>{latestAnalysis.summary}</p>}
              </section>
            )}

            <section
              style={{
                padding: "var(--space-xl)",
                background: "var(--bg-card)",
                borderRadius: "12px",
                border: "1px solid var(--border)",
              }}
            >
              <h2 style={{ fontSize: "1.125rem", marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>Evidence</h2>
              {evidence.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.9375rem" }}>No evidence uploaded yet.</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {evidence.map((e) => (
                    <li
                      key={e.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-md)",
                        padding: "var(--space-sm) 0",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <span style={{ fontSize: "1.25rem" }}>📄</span>
                      <span style={{ flex: 1, fontSize: "0.9375rem" }}>{e.file_name ?? "Untitled"}</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{e.processing_status}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div style={{ marginTop: "var(--space-md)", display: "flex", justifyContent: "center" }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ maxWidth: 280, width: "100%" }}
                  onClick={() => (isPaid ? router.push("/assessment") : setShowPricingModal(true))}
                >
                  Analyze More Evidence
                </button>
              </div>
            </section>
          </div>

          <aside
            style={{
              padding: "var(--space-xl)",
              background: "var(--bg-card)",
              borderRadius: "12px",
              border: "1px solid var(--border)",
              height: "fit-content",
            }}
          >
            <h2 style={{ fontSize: "1.125rem", marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>Next Steps</h2>
            <ul style={{ paddingLeft: "var(--space-lg)", fontSize: "0.9375rem", lineHeight: 1.8 }}>
              <li>Add more evidence to strengthen your case</li>
              <li>Complete your profile (state, county) for case matching</li>
              {!isPaid && <li>Upgrade for full case law matches and attorney analysis</li>}
            </ul>
            <p style={{ marginTop: "var(--space-lg)", fontSize: "0.875rem", color: "var(--text-muted)" }}>
              Plan: {subscription?.plan ?? "Free"}
            </p>
          </aside>
        </div>
      </div>
      {showPricingModal && (
        <PricingModal
          onClose={() => setShowPricingModal(false)}
          onSelectPlan={(plan) => {
            setShowPricingModal(false)
            // TODO: Navigate to payment flow when Stripe is wired
            router.push("/dashboard/payment")
          }}
        />
      )}
    </main>
  )
}
