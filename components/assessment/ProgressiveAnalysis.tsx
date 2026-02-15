"use client"

import { useEffect, useState, useRef } from "react"

const STAGES = [
  { label: "Extracting text from images...", progress: 20, duration: 1500 },
  { label: "Identifying communication patterns...", progress: 50, duration: 1500 },
  { label: "Detecting alienation tactics...", progress: 75, duration: 1500 },
  { label: "Analyzing legal relevance...", progress: 95, duration: 1500 },
  { label: "Generating summary...", progress: 100, duration: 1200 },
]

const MIN_TOTAL_MS = 6000

type Props = {
  onComplete: () => void
  analyze: () => Promise<void>
}

export function ProgressiveAnalysis({ onComplete, analyze }: Props) {
  const [stageIndex, setStageIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [label, setLabel] = useState(STAGES[0].label)
  const onCompleteRef = useRef(onComplete)
  const analyzeRef = useRef(analyze)
  onCompleteRef.current = onComplete
  analyzeRef.current = analyze

  useEffect(() => {
    let cancelled = false
    const start = Date.now()

    const run = async () => {
      await analyzeRef.current()
      if (cancelled) return
      const elapsed = Date.now() - start
      const wait = Math.max(0, MIN_TOTAL_MS - elapsed)
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      if (cancelled) return
      onCompleteRef.current()
    }

    run()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (stageIndex >= STAGES.length) return
    const s = STAGES[stageIndex]
    setLabel(s.label)
    setProgress(s.progress)

    const t = setTimeout(() => {
      setStageIndex((i) => Math.min(i + 1, STAGES.length))
    }, s.duration)
    return () => clearTimeout(t)
  }, [stageIndex])

  return (
    <div
      className="progressive-analysis"
      style={{
        padding: "var(--space-2xl)",
        background: "var(--bg-card)",
        borderRadius: "12px",
        border: "1px solid var(--border)",
        maxWidth: 420,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          height: 8,
          background: "var(--bg-elevated)",
          borderRadius: 4,
          overflow: "hidden",
          marginBottom: "var(--space-lg)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            background: "var(--accent-primary)",
            borderRadius: 4,
            transition: "width 300ms ease-out",
          }}
        />
      </div>
      <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", marginBottom: "var(--space-sm)" }}>
        {label}
      </p>
      <p
        style={{
          fontSize: "1.25rem",
          fontWeight: 600,
          color: "var(--accent-muted)",
          transition: "opacity 200ms",
        }}
      >
        {progress}%
      </p>
    </div>
  )
}
