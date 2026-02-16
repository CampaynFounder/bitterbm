"use client"

import { useMemo } from "react"
import { ComposableMap, Geographies, Geography } from "react-simple-maps"
import { FIPS_TO_STATE } from "@/lib/fipsToState"

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"

type USAMapProps = {
  supportedStates: string[]
  className?: string
}

export function USAMap({ supportedStates, className }: USAMapProps) {
  const supportedSet = useMemo(() => new Set(supportedStates.map((s) => s.toUpperCase())), [supportedStates])

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
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    className={isSupported ? "usa-map-state-supported" : undefined}
                    fill={isSupported ? "var(--accent-cyan)" : "var(--bg-elevated)"}
                    stroke="var(--border-accent)"
                    strokeWidth={0.5}
                    style={{
                      default: { outline: "none", transition: "fill 0.3s ease" },
                      hover: { outline: "none", fill: isSupported ? "var(--accent-muted)" : "var(--border)" },
                      pressed: { outline: "none" },
                    }}
                  />
                )
              })
          }
        </Geographies>
      </ComposableMap>
      <div style={{ display: "flex", gap: "var(--space-lg)", justifyContent: "center", marginTop: "var(--space-sm)", fontSize: "0.75rem", color: "var(--text-muted)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)" }}>
          <span style={{ width: 12, height: 12, background: "var(--accent-cyan)", borderRadius: 2 }} aria-hidden />
          Supported
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)" }}>
          <span style={{ width: 12, height: 12, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 2 }} aria-hidden />
          Coming soon
        </span>
      </div>
    </div>
  )
}
