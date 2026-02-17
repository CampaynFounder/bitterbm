"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { ScraperFlow } from "@/lib/scraper/types"

const SAMPLE_FLOW: ScraperFlow = {
  name: "Court Records Search",
  version: "1.0",
  steps: [
    {
      type: "navigate",
      label: "Go to search page",
      config: { url: "https://example.com/search", waitUntil: "networkidle" },
    },
    {
      type: "fill_field",
      label: "Enter search term",
      config: {
        selector: "#q",
        value: "{{search_term}}",
        method: "fill",
        clearFirst: true,
      },
    },
    {
      type: "select_dropdown",
      label: "Court filter",
      config: { selector: "#court", selectBy: "label", value: "{{court}}" },
    },
    {
      type: "click",
      label: "Submit search",
      config: { selector: "#btn-search", waitAfter: 2000 },
    },
    {
      type: "wait",
      label: "Wait for results",
      config: { selector: ".results tbody tr", timeout: 15000 },
    },
    {
      type: "for_each_result",
      label: "For each result row",
      config: { selector: ".results tbody tr", limit: 100 },
    },
    {
      type: "extract_field",
      label: "Get case number",
      config: {
        fieldId: "case_number",
        selector: "td:nth-child(1)",
        attr: "text",
        required: true,
      },
    },
    {
      type: "extract_field",
      label: "Get case name",
      config: { fieldId: "case_name", selector: "td:nth-child(2)", attr: "text" },
    },
    {
      type: "extract_link",
      label: "Get detail URL",
      config: { fieldId: "detail_url", selector: "td a", makeAbsolute: true },
    },
    {
      type: "store_row",
      label: "Store to database",
      config: { sourceSite: "example-court" },
    },
    {
      type: "paginate",
      label: "Next page",
      config: { selector: "a.next-page", maxPages: 50, waitAfter: 2000 },
    },
  ],
}

const labelStyle = {
  display: "block",
  fontSize: "0.875rem",
  fontWeight: 500,
  marginBottom: "var(--space-xs)",
  color: "var(--text-secondary)",
} as const

const inputStyle = {
  width: "100%",
  padding: "var(--space-sm) var(--space-md)",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  color: "var(--text-primary)",
  fontSize: "1rem",
} as const

export default function AdminScrapePage() {
  const router = useRouter()
  const [session, setSession] = useState<{ access_token?: string } | null>(null)
  const [flowJson, setFlowJson] = useState(() => JSON.stringify(SAMPLE_FLOW, null, 2))
  const [varsJson, setVarsJson] = useState(
    () =>
      JSON.stringify(
        { search_term: "Smith", court: "Superior Court" },
        null,
        2
      )
  )
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{
    jobId?: string
    rowsStored?: number
    error?: string
    logs?: string[]
  } | null>(null)
  const [adminSecret, setAdminSecret] = useState("")
  const [flows, setFlows] = useState<{ id: string; name: string }[]>([])
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s) {
        router.replace("/admin/login")
        return
      }
      setSession(s)
    })
  }, [router])

  useEffect(() => {
    async function loadFlows() {
      const { data } = await supabase
        .from("scraper_flows")
        .select("id, name")
        .order("updated_at", { ascending: false })
      setFlows((data as { id: string; name: string }[]) ?? [])
    }
    loadFlows().catch(() => {})
  }, [])

  async function handleRun() {
    if (!session?.access_token || !adminSecret) {
      setResult({ error: "Session or admin secret required" })
      return
    }
    let flow: ScraperFlow
    try {
      flow = JSON.parse(flowJson) as ScraperFlow
    } catch {
      setResult({ error: "Invalid flow JSON" })
      return
    }
    let vars: Record<string, string | number> = {}
    try {
      vars = JSON.parse(varsJson) as Record<string, string | number>
    } catch {
      vars = {}
    }
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch("/api/admin/scrape/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          "X-Admin-Secret": adminSecret,
        },
        body: JSON.stringify({
          flow,
          vars,
          flowId: selectedFlowId ?? undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Request failed")
      setResult(data)
    } catch (err) {
      setResult({
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setRunning(false)
    }
  }

  function loadSample() {
    setFlowJson(JSON.stringify(SAMPLE_FLOW, null, 2))
    setVarsJson(
      JSON.stringify({ search_term: "Smith", court: "Superior Court" }, null, 2)
    )
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      <header
        style={{
          padding: "var(--space-lg)",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-elevated)",
        }}
      >
        <div
          className="container"
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>
            Scraper Flow Builder
          </h1>
          <Link href="/admin/dashboard" style={{ color: "var(--accent-muted)" }}>
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="container" style={{ maxWidth: 1200, margin: "0 auto", padding: "var(--space-xl)" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: "var(--space-xl)",
          }}
        >
          <div
            style={{
              padding: "var(--space-xl)",
              borderRadius: "12px",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
            }}
          >
            <h2
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                marginBottom: "var(--space-md)",
                color: "var(--accent-muted)",
              }}
            >
              Flow JSON
            </h2>
            <p
              style={{
                fontSize: "0.9375rem",
                color: "var(--text-secondary)",
                marginBottom: "var(--space-md)",
              }}
            >
              Define steps: navigate, fill_field, select_dropdown, for_each_option
              (court/judge/status), for_each_result, extract_field, extract_link,
              store_row, paginate. Use {"{{variable}}"} for runtime values.
            </p>
            <textarea
              value={flowJson}
              onChange={(e) => setFlowJson(e.target.value)}
              rows={18}
              style={{
                ...inputStyle,
                fontFamily: "var(--font-mono)",
                fontSize: "0.8125rem",
                minHeight: 400,
              }}
              spellCheck={false}
            />
            <div style={{ display: "flex", gap: "var(--space-md)", marginTop: "var(--space-md)" }}>
              <button
                type="button"
                onClick={loadSample}
                style={{
                  padding: "var(--space-sm) var(--space-md)",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                Load sample
              </button>
            </div>
          </div>

          <div
            style={{
              padding: "var(--space-xl)",
              borderRadius: "12px",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
            }}
          >
            <h2
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                marginBottom: "var(--space-md)",
                color: "var(--accent-muted)",
              }}
            >
              Variables
            </h2>
            <p
              style={{
                fontSize: "0.9375rem",
                color: "var(--text-secondary)",
                marginBottom: "var(--space-md)",
              }}
            >
              search_term, date_from, date_to, court, case_type, case_status,
              etc.
            </p>
            <textarea
              value={varsJson}
              onChange={(e) => setVarsJson(e.target.value)}
              rows={6}
              style={{
                ...inputStyle,
                fontFamily: "var(--font-mono)",
                fontSize: "0.8125rem",
              }}
              spellCheck={false}
            />

            <div style={{ marginTop: "var(--space-lg)" }}>
              <label style={labelStyle}>Admin secret (X-Admin-Secret)</label>
              <input
                type="password"
                value={adminSecret}
                onChange={(e) => setAdminSecret(e.target.value)}
                placeholder="ADMIN_SECRET"
                style={inputStyle}
              />
            </div>

            <button
              type="button"
              onClick={handleRun}
              disabled={running}
              className="btn-primary"
              style={{
                marginTop: "var(--space-xl)",
                padding: "var(--space-md) var(--space-xl)",
              }}
            >
              {running ? "Running…" : "Run flow"}
            </button>
          </div>

          {result && (
            <div
              style={{
                padding: "var(--space-xl)",
                borderRadius: "12px",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
              }}
            >
              <h2
                style={{
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  marginBottom: "var(--space-md)",
                  color: result.error ? "var(--accent-gold)" : "var(--accent-cyan)",
                }}
              >
                Result
              </h2>
              <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>
                Job: {result.jobId ?? "—"} · Rows stored: {result.rowsStored ?? 0}
              </p>
              {result.error && (
                <p
                  style={{
                    marginTop: "var(--space-md)",
                    color: "var(--accent-gold)",
                  }}
                >
                  {result.error}
                </p>
              )}
              {result.logs && result.logs.length > 0 && (
                <pre
                  style={{
                    marginTop: "var(--space-md)",
                    padding: "var(--space-md)",
                    background: "var(--bg-elevated)",
                    borderRadius: "8px",
                    fontSize: "0.75rem",
                    overflow: "auto",
                    maxHeight: 200,
                  }}
                >
                  {result.logs.join("\n")}
                </pre>
              )}
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: "var(--space-2xl)",
            padding: "var(--space-xl)",
            borderRadius: "12px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          <h2
            style={{
              fontSize: "1.125rem",
              fontWeight: 600,
              marginBottom: "var(--space-md)",
              color: "var(--accent-muted)",
            }}
          >
            Supported step types
          </h2>
          <ul
            style={{
              fontSize: "0.9375rem",
              color: "var(--text-secondary)",
              lineHeight: 1.8,
              listStyle: "disc",
              paddingLeft: "var(--space-xl)",
            }}
          >
            <li>
              <strong>navigate</strong> — Load URL (waitUntil: domcontentloaded,
              load, networkidle)
            </li>
            <li>
              <strong>wait</strong> — Wait for selector or timeout
            </li>
            <li>
              <strong>fill_field</strong> — Type into input (value, selector,
              clearFirst, method: fill|type)
            </li>
            <li>
              <strong>date_range</strong> — Fill from/to date inputs
            </li>
            <li>
              <strong>select_dropdown</strong> — Select option (value, label,
              index)
            </li>
            <li>
              <strong>checkbox</strong> — Check/uncheck
            </li>
            <li>
              <strong>click</strong> — Click element (waitAfter, waitForSelector)
            </li>
            <li>
              <strong>for_each_option</strong> — Loop through select options
              (court, judge, case type, status); nested steps run per option
            </li>
            <li>
              <strong>for_each_result</strong> — Loop through table rows / result
              cards
            </li>
            <li>
              <strong>extract_field</strong> — Get text/attr from element
              (fieldId, selector, attr: text|html|href)
            </li>
            <li>
              <strong>extract_link</strong> — Get href (makeAbsolute)
            </li>
            <li>
              <strong>store_row</strong> — Save to scraped_cases table
            </li>
            <li>
              <strong>paginate</strong> — Click next page (maxPages, waitAfter)
            </li>
            <li>
              <strong>delay</strong> — Sleep (ms)
            </li>
          </ul>
        </div>
      </main>
    </div>
  )
}
