"use client"

import { useEffect, useState } from "react"

export type AnalysisResult = {
  alienationScore: number
  custodyChangeLikelihood: number
  likelihoodAllEvidenceReviewed?: number
  alienationTactics: string[]
  thingsToProve: { label: string; category?: string }[]
  summary: string
}

type Props = {
  result: AnalysisResult
  onHelpMeProveIt: () => void
  onBack?: () => void
}

function ScoreGauge({ value, label }: { value: number; label: string }) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    const duration = 800
    const start = Date.now()
    const tick = () => {
      const elapsed = Date.now() - start
      const t = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - t, 2) // ease out quad
      setDisplay(Math.round(value * eased))
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [value])

  return (
    <div style={{ marginBottom: "var(--space-lg)" }}>
      <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "var(--space-xs)" }}>{label}</p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-md)",
        }}
      >
        <div
          style={{
            flex: 1,
            height: 12,
            background: "var(--bg-elevated)",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${display}%`,
              height: "100%",
              background:
                display >= 70 ? "var(--accent-cyan)" : display >= 40 ? "var(--accent-gold)" : "var(--accent-primary)",
              borderRadius: 6,
              transition: "width 80ms linear",
            }}
          />
        </div>
        <span style={{ fontSize: "1.125rem", fontWeight: 600, minWidth: 48 }}>{display}%</span>
      </div>
    </div>
  )
}

export function ResultsCard({ result, onHelpMeProveIt, onBack }: Props) {
  return (
    <div
      style={{
        padding: "var(--space-xl)",
        background: "var(--bg-card)",
        borderRadius: "12px",
        border: "1px solid var(--border)",
        maxWidth: 520,
        margin: "0 auto",
      }}
    >
      <h3 style={{ fontSize: "1.25rem", marginBottom: "var(--space-lg)", color: "var(--text-primary)" }}>
        Your Analysis Results
      </h3>
      <ScoreGauge value={result.alienationScore} label="Evidence relevance score" />
      <ScoreGauge value={result.custodyChangeLikelihood} label="Custody change likelihood" />
      {typeof result.likelihoodAllEvidenceReviewed === "number" && (
        <ScoreGauge
          value={result.likelihoodAllEvidenceReviewed}
          label="Likelihood all text message evidence will be reviewed"
        />
      )}
      {result.alienationTactics.length > 0 && (
        <div style={{ marginBottom: "var(--space-lg)" }}>
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "var(--space-sm)" }}>
            Alienation tactics identified
          </p>
          <ul style={{ margin: 0, paddingLeft: "var(--space-lg)", fontSize: "0.9375rem" }}>
            {result.alienationTactics.map((t, i) => (
              <li key={i} style={{ marginBottom: "var(--space-xs)" }}>
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p style={{ fontSize: "0.9375rem", marginBottom: "var(--space-lg)", lineHeight: 1.6 }}>{result.summary}</p>
      {result.thingsToProve.length > 0 && (
        <div style={{ marginBottom: "var(--space-lg)" }}>
          <p style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "var(--space-sm)", color: "var(--text-primary)" }}>
            Things you may need to prove
          </p>
          <ul style={{ margin: 0, paddingLeft: "var(--space-lg)", fontSize: "0.9375rem" }}>
            {result.thingsToProve.map((t, i) => (
              <li key={i} style={{ marginBottom: "var(--space-xs)" }}>
                {t.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        onClick={onHelpMeProveIt}
        className="btn-primary"
        style={{ width: "100%" }}
      >
        Help Me Prove It
      </button>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          style={{
            marginTop: "var(--space-md)",
            background: "none",
            border: "none",
            padding: 0,
            fontSize: "0.9375rem",
            color: "var(--accent-muted)",
            textDecoration: "none",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.textDecoration = "underline"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.textDecoration = "none"
          }}
        >
          My Kids Don&apos;t Need Me
        </button>
      )}
    </div>
  )
}
