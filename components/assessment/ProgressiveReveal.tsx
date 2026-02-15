"use client"

import * as React from "react"
import { motion } from "motion/react"

/** Easing: linear | ease-in | ease-in-slow | ease-out | ease-in-out */
type Easing = "linear" | "ease-in" | "ease-in-slow" | "ease-out" | "ease-in-out"

function easeProgress(t: number, easing: Easing): number {
  const clamped = Math.min(1, Math.max(0, t))
  switch (easing) {
    case "ease-in":
      return clamped * clamped
    case "ease-in-slow":
      return clamped * clamped * clamped // cubic - very slow start
    case "ease-out":
      return 1 - (1 - clamped) * (1 - clamped)
    case "ease-in-out":
      return clamped < 0.5
        ? 2 * clamped * clamped
        : 1 - Math.pow(-2 * clamped + 2, 2) / 2
    default:
      return clamped
  }
}

export interface ProgressiveRevealProps {
  children: React.ReactNode
  duration?: number
  startingDelay?: number
  /** Easing for reveal progress; default ease-in-slow (very slow start) */
  easing?: Easing
  /** Labels for each phase */
  labels?: {
    starting?: string
    generating?: string
    completed?: string
  }
}

export function ProgressiveReveal({
  children,
  duration = 9000,
  startingDelay = 800,
  easing = "ease-in-slow",
  labels = {},
}: ProgressiveRevealProps) {
  const [progress, setProgress] = React.useState(0)
  const [loadingState, setLoadingState] = React.useState<
    "starting" | "generating" | "completed"
  >("starting")

  const {
    starting = "Preparing results…",
    generating = "Revealing analysis.",
    completed = "Analysis complete.",
  } = labels

  React.useEffect(() => {
    let rafId: number
    let cancelled = false

    const startingTimeout = setTimeout(() => {
      if (cancelled) return
      setLoadingState("generating")

      const startTime = Date.now()

      const tick = () => {
        if (cancelled) return
        const elapsedTime = Date.now() - startTime
        const linearT = Math.min(1, elapsedTime / duration)
        const easedT = easeProgress(linearT, easing)
        const progressPercentage = easedT * 100

        setProgress(progressPercentage)

        if (progressPercentage < 100) {
          rafId = requestAnimationFrame(tick)
        } else {
          setLoadingState("completed")
        }
      }

      rafId = requestAnimationFrame(tick)
    }, startingDelay)

    return () => {
      cancelled = true
      clearTimeout(startingTimeout)
      cancelAnimationFrame(rafId)
    }
  }, [duration, startingDelay, easing])

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
      <motion.span
        style={{
          background:
            "linear-gradient(110deg, var(--text-muted) 35%, var(--text-primary) 50%, var(--text-muted) 75%, var(--text-muted))",
          backgroundSize: "200% 100%",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          fontSize: "1rem",
          fontWeight: 500,
        }}
        initial={{ backgroundPosition: "200% 0" }}
        animate={{
          backgroundPosition: loadingState === "completed" ? "0% 0" : "-200% 0",
        }}
        transition={{
          repeat: loadingState === "completed" ? 0 : Infinity,
          duration: 3,
          ease: "linear",
        }}
      >
        {loadingState === "starting" && starting}
        {loadingState === "generating" && generating}
        {loadingState === "completed" && completed}
      </motion.span>
      <div
        style={{
          position: "relative",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        {children}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "125%",
            marginTop: "-25%",
            pointerEvents: "none",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            background: "rgba(8, 9, 12, 0.7)",
            clipPath: `polygon(0 ${progress}%, 100% ${progress}%, 100% 100%, 0 100%)`,
            WebkitClipPath: `polygon(0 ${progress}%, 100% ${progress}%, 100% 100%, 0 100%)`,
            opacity: loadingState === "completed" ? 0 : 1,
            transition: "opacity 0.3s ease-out",
          }}
        />
      </div>
    </div>
  )
}
