"use client"

import * as React from "react"
import { motion } from "motion/react"

export interface ProgressiveRevealProps {
  children: React.ReactNode
  duration?: number
  startingDelay?: number
  /** Labels for each phase */
  labels?: {
    starting?: string
    generating?: string
    completed?: string
  }
}

export function ProgressiveReveal({
  children,
  duration = 6000,
  startingDelay = 800,
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
    const startingTimeout = setTimeout(() => {
      setLoadingState("generating")

      const startTime = Date.now()

      const interval = setInterval(() => {
        const elapsedTime = Date.now() - startTime
        const progressPercentage = Math.min(100, (elapsedTime / duration) * 100)

        setProgress(progressPercentage)

        if (progressPercentage >= 100) {
          clearInterval(interval)
          setLoadingState("completed")
        }
      }, 16)

      return () => clearInterval(interval)
    }, startingDelay)

    return () => clearTimeout(startingTimeout)
  }, [duration, startingDelay])

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
        <motion.div
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
          }}
          initial={false}
          animate={{
            clipPath: `polygon(0 ${progress}%, 100% ${progress}%, 100% 100%, 0 100%)`,
            opacity: loadingState === "completed" ? 0 : 1,
          }}
          transition={{ opacity: { duration: 0.4 } }}
        />
      </div>
    </div>
  )
}
