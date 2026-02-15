"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { UploadZone } from "@/components/assessment/UploadZone"
import { ProgressiveAnalysis } from "@/components/assessment/ProgressiveAnalysis"
import { ResultsCard, type AnalysisResult } from "@/components/assessment/ResultsCard"
import { ProgressiveReveal } from "@/components/assessment/ProgressiveReveal"
import { AuthModal } from "@/components/auth/AuthModal"
import { supabase } from "@/lib/supabase"

type Step = "upload" | "analyzing" | "results" | "auth"

const MAX_FREE_FILES = 2

export default function AssessmentPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("upload")
  const [files, setFiles] = useState<File[]>([])
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleAnalyze = useCallback(async () => {
    if (files.length === 0) return
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
  }, [files])

  const handleAnalyzeClick = () => {
    if (files.length === 0) return
    setStep("analyzing")
  }

  const handleAnalysisComplete = useCallback(() => {
    setStep("results")
  }, [])

  const handleHelpMeProveIt = () => {
    setShowAuthModal(true)
  }

  const handleBackFromResults = () => {
    setStep("upload")
    setResult(null)
    setFiles([])
  }

  const handleAuthSuccess = useCallback(async () => {
    if (!result) return
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const fd = new FormData()
      fd.append("result", JSON.stringify(result))
      files.forEach((f) => fd.append("files", f))
      const res = await fetch("/api/save-results", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: fd,
      })
      if (!res.ok) throw new Error((await res.json()).error || "Save failed")
      setShowAuthModal(false)
      router.push("/dashboard")
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }, [result, files, router])

  return (
    <main
      className="section"
      style={{
        minHeight: "80vh",
        paddingTop: "var(--space-2xl)",
        paddingBottom: "var(--space-2xl)",
      }}
    >
      <div className="container" style={{ maxWidth: 640 }}>
        <Link
          href="/"
          style={{
            display: "inline-block",
            marginBottom: "var(--space-lg)",
            color: "var(--accent-muted)",
            fontSize: "0.9375rem",
            textDecoration: "none",
          }}
        >
          ← Back
        </Link>

        {step === "upload" && (
          <>
            <h1 style={{ fontSize: "1.5rem", marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>
              Free Evidence Analysis
            </h1>
            <p style={{ marginBottom: "var(--space-xl)", color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
              Upload up to 2 screenshots of texts, emails, or evidence. We&apos;ll analyze patterns and show your
              legal standing.
            </p>
            <UploadZone maxFiles={MAX_FREE_FILES} onFilesSelected={setFiles} />
            <button
              type="button"
              className="btn-primary"
              disabled={files.length === 0}
              onClick={handleAnalyzeClick}
              style={{ marginTop: "var(--space-xl)", width: "100%" }}
            >
              Analyze Evidence
            </button>
          </>
        )}

        {step === "analyzing" && (
          <div style={{ paddingTop: "var(--space-2xl)" }}>
            <ProgressiveAnalysis analyze={handleAnalyze} onComplete={handleAnalysisComplete} />
          </div>
        )}

        {step === "results" && result && (
          <div style={{ paddingTop: "var(--space-lg)" }}>
            <ProgressiveReveal duration={10000} startingDelay={800}>
              <ResultsCard
                result={result}
                onHelpMeProveIt={handleHelpMeProveIt}
                onBack={handleBackFromResults}
              />
            </ProgressiveReveal>
          </div>
        )}
      </div>

      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
          saving={saving}
        />
      )}
    </main>
  )
}
