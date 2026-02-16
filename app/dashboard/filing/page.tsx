"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { UpgradeGate } from "@/components/dashboard/UpgradeGate"
import { UploadZone } from "@/components/assessment/UploadZone"

export default function FilingAnalysisPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [plan, setPlan] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [files, setFiles] = useState<File[]>([])
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (files.length === 0) return
    setSubmitting(true)
    try {
      await new Promise((r) => setTimeout(r, 1500))
      setResult("Filing analysis will evaluate opposing counsel filings. Backend integration coming soon.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !user) {
    return <main className="section" style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "var(--text-muted)" }}>Loading…</p></main>
  }

  return (
    <UpgradeGate plan={plan} feature="Filing Analysis">
      <main className="section" style={{ minHeight: "80vh", paddingTop: "var(--space-2xl)", paddingBottom: "var(--space-2xl)" }}>
        <div className="container" style={{ maxWidth: 600, margin: "0 auto", animation: "fadeInUp 0.4s var(--ease-out-expo) both" }}>
          <Link href="/dashboard" style={{ display: "inline-block", marginBottom: "var(--space-lg)", color: "var(--accent-muted)", fontSize: "0.9375rem" }}>← Back to Dashboard</Link>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "var(--space-sm)", color: "var(--text-primary)", textAlign: "center" }}>Filing Analysis</h1>
          <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", marginBottom: "var(--space-xl)", lineHeight: 1.6, textAlign: "center" }}>Upload filings by opposing counsel. We analyze how the county and judge may view them.</p>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)", alignItems: "center" }}>
            <div style={{ width: "100%", animation: "fadeInUp 0.3s var(--ease-out-expo) 0.1s both" }}>
              <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "var(--space-sm)", color: "var(--text-secondary)" }}>Opposing counsel filings</label>
              <UploadZone maxFiles={10} onFilesSelected={setFiles} />
            </div>
            <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
              <button type="submit" disabled={submitting || files.length === 0} className="btn-primary" style={{ width: "100%", maxWidth: 320 }}>{submitting ? "Analyzing…" : "Analyze Filings"}</button>
            </div>
          </form>
          {result && <div style={{ marginTop: "var(--space-xl)", padding: "var(--space-xl)", background: "var(--bg-card)", borderRadius: "12px", border: "1px solid var(--border)", animation: "fadeInUp 0.3s var(--ease-out-expo) 0.1s both", textAlign: "center" }}><p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>{result}</p></div>}
        </div>
      </main>
    </UpgradeGate>
  )
}
