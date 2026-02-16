"use client"

import { useMemo } from "react"
import { ComposableMap, Geographies, Geography } from "react-simple-maps"
import { FIPS_TO_STATE } from "@/lib/fipsToState"

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"

/* Unsupported states: gradient from dark blue (few requests) to lighter blue (many) */
const REQUEST_COLOR_MIN = "#0f2744" /* dark blue */
const REQUEST_COLOR_MAX = "#0d9488" /* teal – lighter but distinct from supported cyan */

function getRequestFill(count: number, maxCount: number): string {
  if (count <= 0) return "var(--bg-elevated)"
  if (maxCount <= 1) return REQUEST_COLOR_MIN
  const t = Math.min(1, Math.log10(count + 1) / Math.log10(maxCount + 1))
  const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)
  const hex = (r: number, g: number, b: number) =>
    "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")
  const [r1, g1, b1] = [0x0f, 0x27, 0x44]
  const [r2, g2, b2] = [0x0d, 0x94, 0x88]
  return hex(lerp(r1, r2, t), lerp(g1, g2, t), lerp(b1, b2, t))
}

type USAMapProps = {
  supportedStates: string[]
  requestCounts?: Record<string, number>
  className?: string
}

export function USAMap({ supportedStates, requestCounts = {}, className }: USAMapProps) {
  const supportedSet = useMemo(() => new Set(supportedStates.map((s) => s.toUpperCase())), [supportedStates])
  const maxRequestCount = useMemo(() => {
    let max = 0
    for (const [state, count] of Object.entries(requestCounts)) {
      if (typeof count === "number" && count > 0 && !supportedSet.has(state.toUpperCase())) {
        max = Math.max(max, count)
      }
    }
    return max
  }, [requestCounts, supportedSet])

  return (
    <div
      className={className}
      style={{
        width: "100%",
        maxWidth: 400,
        margin: "0 auto",
        aspectRatio: "1.5",
        animation: "fadeIn 0.6s var(--ease-out-expo) both",
      }}
    >
      <ComposableMap
        projection="geoAlbersUsa"
        projectionConfig={{ scale: 1000 }}
        style={{ width: "100%", height: "100%" }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies
              .filter((g) => g.id !== "02" && g.id !== "15" && !["60", "66", "69", "72", "78"].includes(g.id))
              .map((geo) => {
                const stateCode = FIPS_TO_STATE[geo.id] ?? geo.id
                const isSupported = supportedSet.has(stateCode)
                const requestCount = requestCounts[stateCode] ?? 0
                const fill = isSupported
                  ? "var(--accent-cyan)"
                  : getRequestFill(requestCount, maxRequestCount)
                const hoverFill = isSupported
                  ? "var(--accent-muted)"
                  : requestCount > 0
                    ? "#14b8a6"
                    : "var(--border)"
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    className={isSupported ? "usa-map-state-supported" : undefined}
                    fill={fill}
                    stroke="var(--border-accent)"
                    strokeWidth={0.5}
                    style={{
                      default: { outline: "none", transition: "fill 0.3s ease" },
                      hover: { outline: "none", fill: hoverFill },
                      pressed: { outline: "none" },
                    }}
                  />
                )
              })
          }
        </Geographies>
      </ComposableMap>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-md)", justifyContent: "center", marginTop: "var(--space-sm)", fontSize: "0.75rem", color: "var(--text-muted)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)" }}>
          <span style={{ width: 12, height: 12, background: "var(--accent-cyan)", borderRadius: 2 }} aria-hidden />
          Supported
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)" }}>
          <span
            style={{
              width: 24,
              height: 12,
              background: `linear-gradient(90deg, ${REQUEST_COLOR_MIN}, ${REQUEST_COLOR_MAX})`,
              borderRadius: 2,
            }}
            aria-hidden
          />
          Interest (more = lighter)
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)" }}>
          <span style={{ width: 12, height: 12, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 2 }} aria-hidden />
          No requests yet
        </span>
      </div>
    </div>
  )
}
