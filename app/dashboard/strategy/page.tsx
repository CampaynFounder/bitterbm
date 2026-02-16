"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { UpgradeGate } from "@/components/dashboard/UpgradeGate"

type Profile = { state: string | null; county: string | null; situation_synopsis: string | null; retained_attorney_name: string | null }
type Analysis = { alienation_score: number | null; custody_change_likelihood: number | null; summary: string | null }
type EvidenceItem = { file_name: string | null }

export default function StrategyPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [plan, setPlan] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [evidence, setEvidence] = useState<EvidenceItem[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/signin")
        return
      }
      setUser(session.user as { id: string })
      supabase
        .from("subscriptions")
        .select("plan")
        .eq("user_id", session.user.id)
        .maybeSingle()
        .then(
          ({ data }) => {
            const p = (data as { plan?: string } | null)?.plan ?? "free"
            setPlan(p)
            setLoading(false)
          },
          () => {
            setPlan("free")
            setLoading(false)
          }
        )
    })
  }, [router])

  useEffect(() => {
    if (!user || plan !== "flat") return
    supabase.from("user_profiles").select("state, county, situation_synopsis, retained_attorney_name").eq("id", user.id).maybeSingle().then(({ data }) => {
      setProfile((data as Profile) ?? null)
    })
    supabase.from("cases").select("id").eq("user_id", user.id).then(({ data: cases }) => {
      const ids = (cases ?? []).map((c: { id: string }) => c.id)
      if (ids.length === 0) return
      supabase.from("analysis_results").select("alienation_score, custody_change_likelihood, summary").in("case_id", ids).order("created_at", { ascending: false }).limit(5).then(({ data }) => {
        setAnalyses((data as Analysis[]) ?? [])
      })
      supabase.from("evidence").select("file_name").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20).then(({ data }) => {
        setEvidence((data as EvidenceItem[]) ?? [])
      })
    })
  }, [user, plan])

  if (loading || !user) {
    return (
      <main className="section" style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      </main>
    )
  }

  const latestAnalysis = analyses[0]

  return (
    <UpgradeGate plan={plan} feature="Overall Strategy">
      <main className="section" style={{ minHeight: "80vh", paddingTop: "var(--space-2xl)", paddingBottom: "var(--space-2xl)" }}>
        <div
          className="container"
          style={{
            maxWidth: 800,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-xl)",
            animation: "fadeInUp 0.4s var(--ease-out-expo) both",
          }}
        >
          <Link href="/dashboard" style={{ alignSelf: "flex-start", color: "var(--accent-muted)", fontSize: "0.9375rem" }}>
            ← Back to Dashboard
          </Link>
          <header>
            <h1 style={{ fontSize: "1.5rem", marginBottom: "var(--space-sm)", color: "var(--text-primary)" }}>Overall Strategy</h1>
            <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              Centralized view of your case details, evidence, analyses, and a cohesive plan to prove alienation.
            </p>
          </header>

          <div style={{ display: "grid", gap: "var(--space-lg)", gridTemplateColumns: "1fr" }}>
            <section
              style={{
                padding: "var(--space-xl)",
                background: "var(--bg-card)",
                borderRadius: "12px",
                border: "1px solid var(--border)",
                animation: "fadeInUp 0.3s var(--ease-out-expo) 0.05s both",
              }}
            >
              <h2 style={{ fontSize: "1.125rem", marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>Case Details</h2>
              {profile ? (
                <dl style={{ display: "grid", gap: "var(--space-sm)", fontSize: "0.9375rem" }}>
                  {profile.state && <div><dt style={{ color: "var(--text-muted)" }}>State</dt><dd>{profile.state}</dd></div>}
                  {profile.county && <div><dt style={{ color: "var(--text-muted)" }}>County</dt><dd>{profile.county}</dd></div>}
                  {profile.retained_attorney_name && <div><dt style={{ color: "var(--text-muted)" }}>Attorney</dt><dd>{profile.retained_attorney_name}</dd></div>}
                  {profile.situation_synopsis && <div><dt style={{ color: "var(--text-muted)" }}>Synopsis</dt><dd style={{ lineHeight: 1.6 }}>{profile.situation_synopsis}</dd></div>}
                </dl>
              ) : (
                <p style={{ color: "var(--text-muted)", fontSize: "0.9375rem" }}>No profile details yet.</p>
              )}
              <Link href="/dashboard/profile" style={{ marginTop: "var(--space-md)", display: "inline-block", fontSize: "0.875rem", color: "var(--accent-muted)" }}>
                Edit profile
              </Link>
            </section>

            {latestAnalysis && (
              <section
                style={{
                  padding: "var(--space-xl)",
                  background: "var(--bg-card)",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  animation: "fadeInUp 0.3s var(--ease-out-expo) 0.1s both",
                }}
              >
                <h2 style={{ fontSize: "1.125rem", marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>Latest Case Analysis</h2>
                <div style={{ display: "flex", gap: "var(--space-xl)", marginBottom: "var(--space-md)", flexWrap: "wrap" }}>
                  <div>
                    <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Evidence relevance</p>
                    <p style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--accent-muted)" }}>{latestAnalysis.alienation_score ?? "—"}%</p>
                  </div>
                  <div>
                    <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Custody change likelihood</p>
                    <p style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--accent-cyan)" }}>{latestAnalysis.custody_change_likelihood ?? "—"}%</p>
                  </div>
                </div>
                {latestAnalysis.summary && <p style={{ fontSize: "0.9375rem", lineHeight: 1.6, color: "var(--text-secondary)" }}>{latestAnalysis.summary}</p>}
                <Link href="/dashboard/analysis" style={{ marginTop: "var(--space-md)", display: "inline-block", fontSize: "0.875rem", color: "var(--accent-muted)" }}>
                  Analyze more evidence
                </Link>
              </section>
            )}

            <section
              style={{
                padding: "var(--space-xl)",
                background: "var(--bg-card)",
                borderRadius: "12px",
                border: "1px solid var(--border)",
                animation: "fadeInUp 0.3s var(--ease-out-expo) 0.15s both",
              }}
            >
              <h2 style={{ fontSize: "1.125rem", marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>Evidence on File</h2>
              {evidence.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.9375rem" }}>No evidence uploaded yet.</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {evidence.slice(0, 10).map((e, i) => (
                    <li key={i} style={{ padding: "var(--space-xs) 0", fontSize: "0.9375rem", color: "var(--text-secondary)" }}>
                      📄 {e.file_name ?? "Untitled"}
                    </li>
                  ))}
                  {evidence.length > 10 && <li style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>+{evidence.length - 10} more</li>}
                </ul>
              )}
            </section>

            <section
              style={{
                padding: "var(--space-xl)",
                background: "var(--bg-card)",
                borderRadius: "12px",
                border: "1px solid var(--accent-glow)",
                animation: "fadeInUp 0.3s var(--ease-out-expo) 0.2s both",
              }}
            >
              <h2 style={{ fontSize: "1.125rem", marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>Prove-It Plan</h2>
              <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "var(--space-md)" }}>
                Your cohesive strategy will combine case analysis, GAL insights, judge tendencies, county precedent, and attorney evaluation into a clear plan.
              </p>
              <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                Complete GAL, Judge, County, and Attorney analysis to unlock your full Prove-It Plan.
              </p>
            </section>
          </div>
        </div>
      </main>
    </UpgradeGate>
  )
}
