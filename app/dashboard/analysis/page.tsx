"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { UploadZone } from "@/components/assessment/UploadZone"
import { ProgressiveAnalysis } from "@/components/assessment/ProgressiveAnalysis"
import { ResultsCard, type AnalysisResult } from "@/components/assessment/ResultsCard"
import { ProgressiveReveal } from "@/components/assessment/ProgressiveReveal"
import { supabase } from "@/lib/supabase"

type Step = "upload" | "analyzing" | "results"

const MAX_ENROLLED_FILES = 20

export default function DashboardAnalysisPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [plan, setPlan] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<Step>("upload")
  const [files, setFiles] = useState<File[]>([])
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [saving, setSaving] = useState(false)

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
        .then(({ data }) => {
          const p = (data as { plan?: string } | null)?.plan
          if (p !== "monthly" && p !== "flat") {
            router.replace("/dashboard")
            return
          }
          setPlan(p)
          setLoading(false)
        })
    })
  }, [router])

  const handleAnalyze = useCallback(async () => {
    if (files.length === 0 || !user) return
    const fd = new FormData()
    files.forEach((f) => fd.append("files", f))
    const res = await fetch("/api/analyze", {
      method: "POST",
      body: fd,
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Analysis failed")
    }
    const data = await res.json()
    setResult({
      alienationScore: data.alienationScore ?? 0,
      custodyChangeLikelihood: data.custodyChangeLikelihood ?? 0,
      likelihoodAllEvidenceReviewed: data.likelihoodAllEvidenceReviewed,
      alienationTactics: data.alienationTactics ?? [],
      thingsToProve: data.thingsToProve ?? [],
      summary: data.summary ?? "",
    })
  }, [files, user])

  const handleAnalyzeClick = () => {
    if (files.length === 0) return
    setStep("analyzing")
  }

  useEffect(() => {
    if (step !== "results" || !result || !user || files.length === 0) return
    setSaving(true)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setSaving(false)
        return
      }
      const fd = new FormData()
      fd.append("result", JSON.stringify(result))
      files.forEach((f) => fd.append("files", f))
      fetch("/api/save-results", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: fd,
      })
        .finally(() => setSaving(false))
        .catch(console.error)
    })
  }, [step, result, user, files])

  const handleBackFromResults = () => {
    setStep("upload")
    setResult(null)
    setFiles([])
  }

  if (loading || !user || !plan) {
    return (
      <main className="section" style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      </main>
    )
  }

  return (
    <main
      className="section"
      style={{
        minHeight: "80vh",
        paddingTop: "var(--space-2xl)",
        paddingBottom: "var(--space-2xl)",
      }}
    >
      <div
        className="container assessment-container"
        style={{
          maxWidth: 640,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
        }}
      >
        <Link
          href="/dashboard"
          style={{
            alignSelf: "flex-start",
            marginBottom: "var(--space-lg)",
            color: "var(--accent-muted)",
            fontSize: "0.9375rem",
            textDecoration: "none",
          }}
        >
          ← Back to Dashboard
        </Link>

        {step === "upload" && (
          <>
            <h1 style={{ fontSize: "1.5rem", marginBottom: "var(--space-md)", color: "var(--text-primary)", textAlign: "center" }}>
              Analyze Evidence
            </h1>
            <p style={{ marginBottom: "var(--space-xl)", color: "var(--text-secondary)", fontSize: "0.9375rem", textAlign: "center" }}>
              Upload screenshots, emails, or documents. We&apos;ll analyze patterns and refine your strategy to prove alienation.
            </p>
            <UploadZone maxFiles={MAX_ENROLLED_FILES} onFilesSelected={setFiles} />
            <div style={{ marginTop: "var(--space-xl)", width: "100%", display: "flex", justifyContent: "center" }}>
              <button
                type="button"
                className="btn-primary"
                disabled={files.length === 0}
                onClick={handleAnalyzeClick}
                style={{ width: "100%", maxWidth: 320 }}
              >
                Analyze Evidence
              </button>
            </div>
          </>
        )}

        {step === "analyzing" && (
          <div style={{ paddingTop: "var(--space-2xl)" }}>
            <ProgressiveAnalysis analyze={handleAnalyze} onComplete={() => setStep("results")} />
          </div>
        )}

        {step === "results" && result && (
          <div style={{ paddingTop: "var(--space-lg)" }}>
            <ProgressiveReveal duration={10000} startingDelay={800}>
              <ResultsCard
                result={result}
                onHelpMeProveIt={() => router.push("/dashboard")}
                onBack={handleBackFromResults}
              />
            </ProgressiveReveal>
            <p style={{ marginTop: "var(--space-md)", fontSize: "0.8125rem", color: "var(--text-muted)", textAlign: "center" }}>
              {saving ? "Saving to your case…" : "Saved to your dashboard."}
            </p>
            <Link
              href="/dashboard"
              className="btn-primary"
              style={{ marginTop: "var(--space-md)", width: "100%", maxWidth: 320, textAlign: "center" }}
            >
              View Dashboard
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}
