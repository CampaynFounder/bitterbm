"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { ScraperFlow, ScraperStep } from "@/lib/scraper/types"

const STEP_TYPES = [
  { value: "navigate", label: "Go to URL" },
  { value: "pause_for_login", label: "Pause for login" },
  { value: "wait", label: "Wait for element" },
  { value: "fill_field", label: "Fill text field" },
  { value: "date_range", label: "Set date range" },
  { value: "select_dropdown", label: "Select dropdown" },
  { value: "checkbox", label: "Check / uncheck box" },
  { value: "click", label: "Click" },
  { value: "for_each_option", label: "For each filter option" },
  { value: "for_each_result", label: "For each result row" },
  { value: "extract_field", label: "Extract field" },
  { value: "extract_link", label: "Extract link" },
  { value: "store_row", label: "Save row to database" },
  { value: "paginate", label: "Next page" },
  { value: "delay", label: "Delay" },
] as const

function createBlankStep(type: string): ScraperStep {
  const base = { label: "" }
  switch (type) {
    case "navigate":
      return { ...base, type: "navigate", config: { url: "", waitUntil: "networkidle" } }
    case "pause_for_login":
      return { ...base, type: "pause_for_login", config: { waitSeconds: 120, message: "Log in, then continue" } }
    case "wait":
      return { ...base, type: "wait", config: { selector: "", timeout: 10000 } }
    case "fill_field":
      return { ...base, type: "fill_field", config: { selector: "", value: "", clearFirst: true } }
    case "date_range":
      return { ...base, type: "date_range", config: { fromSelector: "", toSelector: "", fromValue: "{{date_from}}", toValue: "{{date_to}}" } }
    case "select_dropdown":
      return { ...base, type: "select_dropdown", config: { selector: "", selectBy: "label", value: "" } }
    case "checkbox":
      return { ...base, type: "checkbox", config: { selector: "", state: "checked" } }
    case "click":
      return { ...base, type: "click", config: { selector: "", waitAfter: 1000 } }
    case "for_each_option":
      return { ...base, type: "for_each_option", config: { selector: "", skipFirst: true } }
    case "for_each_result":
      return { ...base, type: "for_each_result", config: { selector: "", limit: 0 } }
    case "extract_field":
      return { ...base, type: "extract_field", config: { fieldId: "", selector: "", attr: "text" } }
    case "extract_link":
      return { ...base, type: "extract_link", config: { fieldId: "", selector: "", makeAbsolute: true } }
    case "store_row":
      return { ...base, type: "store_row", config: { sourceSite: "" } }
    case "paginate":
      return { ...base, type: "paginate", config: { selector: "", maxPages: 50, waitAfter: 2000 } }
    case "delay":
      return { ...base, type: "delay", config: { ms: 1000 } }
    default:
      return { ...base, type, config: {} } as ScraperStep
  }
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

const btnSecondary = {
  padding: "var(--space-xs) var(--space-sm)",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  color: "var(--text-secondary)",
  cursor: "pointer",
  fontSize: "0.8125rem",
} as const

function StepCard({
  step,
  index,
  total,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  step: ScraperStep
  index: number
  total: number
  onChange: (s: ScraperStep) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}) {
  const cfg = (step as { config?: Record<string, unknown> }).config ?? {}
  const update = (key: string, value: unknown) => {
    onChange({ ...step, config: { ...cfg, [key]: value } } as ScraperStep)
  }
  const typeLabel = STEP_TYPES.find((t) => t.value === step.type)?.label ?? step.type

  return (
    <div
      style={{
        padding: "var(--space-md)",
        borderRadius: "12px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        marginBottom: "var(--space-md)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
        <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>
          {index + 1}. {typeLabel}
        </span>
        <div style={{ display: "flex", gap: "var(--space-xs)", flexWrap: "wrap" }}>
          <button type="button" onClick={onMoveUp} disabled={index === 0} style={btnSecondary}>
            ↑
          </button>
          <button type="button" onClick={onMoveDown} disabled={index >= total - 1} style={btnSecondary}>
            ↓
          </button>
          <button type="button" onClick={onRemove} style={{ ...btnSecondary, color: "var(--accent-gold)" }}>
            Remove
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: "var(--space-md)" }}>
        {step.type === "navigate" && (
          <>
            <div>
              <label style={labelStyle}>URL</label>
              <input
                value={String(cfg.url ?? "")}
                onChange={(e) => update("url", e.target.value)}
                placeholder="https://..."
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Wait for page</label>
              <select
                value={String(cfg.waitUntil ?? "networkidle")}
                onChange={(e) => update("waitUntil", e.target.value)}
                style={inputStyle}
              >
                <option value="domcontentloaded">DOM ready</option>
                <option value="load">Load</option>
                <option value="networkidle">Network idle</option>
              </select>
            </div>
          </>
        )}
        {step.type === "pause_for_login" && (
          <>
            <div>
              <label style={labelStyle}>Seconds to wait</label>
              <input
                type="number"
                value={Number(cfg.waitSeconds ?? 120)}
                onChange={(e) => update("waitSeconds", parseInt(e.target.value, 10) || 120)}
                min={30}
                max={600}
                style={inputStyle}
              />
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "var(--space-xs)" }}>
                Waits this long before continuing. For login flows, run the scraper locally with a visible browser so you can log in during the pause.
              </p>
            </div>
          </>
        )}
        {step.type === "wait" && (
          <>
            <div>
              <label style={labelStyle}>CSS selector</label>
              <input
                value={String(cfg.selector ?? "")}
                onChange={(e) => update("selector", e.target.value)}
                placeholder=".results, #content, etc."
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Timeout (ms)</label>
              <input
                type="number"
                value={Number(cfg.timeout ?? 10000)}
                onChange={(e) => update("timeout", parseInt(e.target.value, 10) || 10000)}
                style={inputStyle}
              />
            </div>
          </>
        )}
        {step.type === "fill_field" && (
          <>
            <div>
              <label style={labelStyle}>CSS selector</label>
              <input
                value={String(cfg.selector ?? "")}
                onChange={(e) => update("selector", e.target.value)}
                placeholder="#search, input[name='q']"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Value (use {"{{var}}"})</label>
              <input
                value={String(cfg.value ?? "")}
                onChange={(e) => update("value", e.target.value)}
                placeholder="{{search_term}}"
                style={inputStyle}
              />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", fontSize: "0.875rem" }}>
              <input
                type="checkbox"
                checked={!!cfg.clearFirst}
                onChange={(e) => update("clearFirst", e.target.checked)}
              />
              Clear first
            </label>
          </>
        )}
        {step.type === "date_range" && (
          <>
            <div>
              <label style={labelStyle}>From selector</label>
              <input
                value={String(cfg.fromSelector ?? "")}
                onChange={(e) => update("fromSelector", e.target.value)}
                placeholder="#date-from"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>To selector</label>
              <input
                value={String(cfg.toSelector ?? "")}
                onChange={(e) => update("toSelector", e.target.value)}
                placeholder="#date-to"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>From value</label>
              <input
                value={String(cfg.fromValue ?? "")}
                onChange={(e) => update("fromValue", e.target.value)}
                placeholder="{{date_from}}"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>To value</label>
              <input
                value={String(cfg.toValue ?? "")}
                onChange={(e) => update("toValue", e.target.value)}
                placeholder="{{date_to}}"
                style={inputStyle}
              />
            </div>
          </>
        )}
        {step.type === "select_dropdown" && (
          <>
            <div>
              <label style={labelStyle}>Selector</label>
              <input
                value={String(cfg.selector ?? "")}
                onChange={(e) => update("selector", e.target.value)}
                placeholder="#court, select[name='type']"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Select by</label>
              <select
                value={String(cfg.selectBy ?? "label")}
                onChange={(e) => update("selectBy", e.target.value)}
                style={inputStyle}
              >
                <option value="label">Visible text</option>
                <option value="value">Value attribute</option>
                <option value="index">Index (0-based)</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Value</label>
              <input
                value={String(cfg.value ?? "")}
                onChange={(e) => update("value", e.target.value)}
                placeholder="{{court}} or Superior Court"
                style={inputStyle}
              />
            </div>
          </>
        )}
        {step.type === "checkbox" && (
          <>
            <div>
              <label style={labelStyle}>Selector</label>
              <input
                value={String(cfg.selector ?? "")}
                onChange={(e) => update("selector", e.target.value)}
                placeholder="#active-only"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>State</label>
              <select
                value={String(cfg.state ?? "checked")}
                onChange={(e) => update("state", e.target.value)}
                style={inputStyle}
              >
                <option value="checked">Checked</option>
                <option value="unchecked">Unchecked</option>
              </select>
            </div>
          </>
        )}
        {step.type === "click" && (
          <>
            <div>
              <label style={labelStyle}>Selector</label>
              <input
                value={String(cfg.selector ?? "")}
                onChange={(e) => update("selector", e.target.value)}
                placeholder="#btn-search, .submit"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Wait after (ms)</label>
              <input
                type="number"
                value={Number(cfg.waitAfter ?? 1000)}
                onChange={(e) => update("waitAfter", parseInt(e.target.value, 10) || 0)}
                style={inputStyle}
              />
            </div>
          </>
        )}
        {step.type === "for_each_option" && (
          <>
            <div>
              <label style={labelStyle}>Dropdown selector</label>
              <input
                value={String(cfg.selector ?? "")}
                onChange={(e) => update("selector", e.target.value)}
                placeholder="#court, #case-type"
                style={inputStyle}
              />
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "var(--space-xs)" }}>
                Loops through each option (court, case type, etc.). Steps below run per option.
              </p>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", fontSize: "0.875rem" }}>
              <input
                type="checkbox"
                checked={!!cfg.skipFirst}
                onChange={(e) => update("skipFirst", e.target.checked)}
              />
              Skip first option (e.g. placeholder)
            </label>
          </>
        )}
        {step.type === "for_each_result" && (
          <>
            <div>
              <label style={labelStyle}>Row selector</label>
              <input
                value={String(cfg.selector ?? "")}
                onChange={(e) => update("selector", e.target.value)}
                placeholder="tbody tr, .result-card"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Limit (0 = all)</label>
              <input
                type="number"
                value={Number(cfg.limit ?? 0)}
                onChange={(e) => update("limit", parseInt(e.target.value, 10) || 0)}
                min={0}
                style={inputStyle}
              />
            </div>
          </>
        )}
        {step.type === "extract_field" && (
          <>
            <div>
              <label style={labelStyle}>Field name (column)</label>
              <input
                value={String(cfg.fieldId ?? "")}
                onChange={(e) => update("fieldId", e.target.value)}
                placeholder="case_number, case_name"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Selector (within row)</label>
              <input
                value={String(cfg.selector ?? "")}
                onChange={(e) => update("selector", e.target.value)}
                placeholder="td:nth-child(1), .title"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Get</label>
              <select
                value={String(cfg.attr ?? "text")}
                onChange={(e) => update("attr", e.target.value)}
                style={inputStyle}
              >
                <option value="text">Text</option>
                <option value="html">HTML</option>
                <option value="href">Link URL</option>
              </select>
            </div>
          </>
        )}
        {step.type === "extract_link" && (
          <>
            <div>
              <label style={labelStyle}>Field name</label>
              <input
                value={String(cfg.fieldId ?? "")}
                onChange={(e) => update("fieldId", e.target.value)}
                placeholder="detail_url"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Link selector</label>
              <input
                value={String(cfg.selector ?? "")}
                onChange={(e) => update("selector", e.target.value)}
                placeholder="td a, .detail-link"
                style={inputStyle}
              />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", fontSize: "0.875rem" }}>
              <input
                type="checkbox"
                checked={!!cfg.makeAbsolute}
                onChange={(e) => update("makeAbsolute", e.target.checked)}
              />
              Make URL absolute
            </label>
          </>
        )}
        {step.type === "store_row" && (
          <div>
            <label style={labelStyle}>Source site name</label>
            <input
              value={String(cfg.sourceSite ?? "")}
              onChange={(e) => update("sourceSite", e.target.value)}
              placeholder="example-court"
              style={inputStyle}
            />
          </div>
        )}
        {step.type === "paginate" && (
          <>
            <div>
              <label style={labelStyle}>Next button selector</label>
              <input
                value={String(cfg.selector ?? "")}
                onChange={(e) => update("selector", e.target.value)}
                placeholder="a.next-page, .pagination .next"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Max pages</label>
              <input
                type="number"
                value={Number(cfg.maxPages ?? 50)}
                onChange={(e) => update("maxPages", parseInt(e.target.value, 10) || 50)}
                min={1}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Wait after click (ms)</label>
              <input
                type="number"
                value={Number(cfg.waitAfter ?? 2000)}
                onChange={(e) => update("waitAfter", parseInt(e.target.value, 10) || 2000)}
                style={inputStyle}
              />
            </div>
          </>
        )}
        {step.type === "delay" && (
          <div>
            <label style={labelStyle}>Milliseconds</label>
            <input
              type="number"
              value={Number(cfg.ms ?? 1000)}
              onChange={(e) => update("ms", parseInt(e.target.value, 10) || 1000)}
              style={inputStyle}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default function AdminScrapePage() {
  const router = useRouter()
  const [session, setSession] = useState<{ access_token?: string } | null>(null)
  const [flowName, setFlowName] = useState("Court Records Search")
  const [steps, setSteps] = useState<ScraperStep[]>(() => [
    createBlankStep("navigate"),
    createBlankStep("fill_field"),
    createBlankStep("select_dropdown"),
    createBlankStep("click"),
    createBlankStep("wait"),
    createBlankStep("for_each_result"),
    createBlankStep("extract_field"),
    createBlankStep("extract_link"),
    createBlankStep("store_row"),
    createBlankStep("paginate"),
  ])
  const [varsList, setVarsList] = useState<{ key: string; value: string }[]>([
    { key: "search_term", value: "" },
    { key: "court", value: "" },
  ])
  const [adminSecret, setAdminSecret] = useState("")
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{
    jobId?: string
    rowsStored?: number
    error?: string
    logs?: string[]
  } | null>(null)
  const [showJson, setShowJson] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s) {
        router.replace("/admin/login")
        return
      }
      setSession(s)
    })
  }, [router])

  function addStep(type: string) {
    setSteps((prev) => [...prev, createBlankStep(type)])
  }

  function updateStep(i: number, step: ScraperStep) {
    setSteps((prev) => {
      const next = [...prev]
      next[i] = step
      return next
    })
  }

  function moveStep(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= steps.length) return
    setSteps((prev) => {
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i))
  }

  function addVar() {
    setVarsList((prev) => [...prev, { key: "", value: "" }])
  }

  function updateVar(i: number, key: string, value: string) {
    setVarsList((prev) => {
      const next = [...prev]
      next[i] = { ...next[i], [key]: value }
      return next
    })
  }

  function removeVar(i: number) {
    setVarsList((prev) => prev.filter((_, idx) => idx !== i))
  }

  function buildFlow(): ScraperFlow {
    return {
      name: flowName,
      version: "1.0",
      steps,
    }
  }

  function buildVars(): Record<string, string | number> {
    const out: Record<string, string | number> = {}
    varsList.forEach(({ key, value }) => {
      if (key.trim()) out[key.trim()] = value.trim() || ""
    })
    return out
  }

  async function handleRun() {
    if (!session?.access_token || !adminSecret) {
      setResult({ error: "Admin secret required" })
      return
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
          flow: buildFlow(),
          vars: buildVars(),
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

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      <header
        style={{
          padding: "var(--space-md) var(--space-lg)",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-elevated)",
        }}
      >
        <div
          style={{
            maxWidth: 900,
            margin: "0 auto",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-md)",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Scraper</h1>
          <Link href="/admin/dashboard" style={{ color: "var(--accent-muted)", fontSize: "0.9375rem" }}>
            ← Dashboard
          </Link>
        </div>
      </header>

      <main
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "var(--space-md)",
        }}
      >
        <div style={{ marginBottom: "var(--space-xl)" }}>
          <label style={labelStyle}>Flow name</label>
          <input
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            placeholder="e.g. Court Records Search"
            style={{ ...inputStyle, maxWidth: 400 }}
          />
        </div>

        <section
          style={{
            padding: "var(--space-lg)",
            borderRadius: "12px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            marginBottom: "var(--space-xl)",
          }}
        >
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>
            Steps (order matters)
          </h2>
          {steps.map((step, i) => (
            <StepCard
              key={i}
              step={step}
              index={i}
              total={steps.length}
              onChange={(s) => updateStep(i, s)}
              onMoveUp={() => moveStep(i, -1)}
              onMoveDown={() => moveStep(i, 1)}
              onRemove={() => removeStep(i)}
            />
          ))}
          <div style={{ marginTop: "var(--space-md)" }}>
            <label style={labelStyle}>Add step</label>
            <select
              onChange={(e) => {
                const v = e.target.value
                if (v) {
                  addStep(v)
                  e.target.value = ""
                }
              }}
              style={{ ...inputStyle, maxWidth: 280 }}
            >
              <option value="">Choose step type…</option>
              {STEP_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section
          style={{
            padding: "var(--space-lg)",
            borderRadius: "12px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            marginBottom: "var(--space-xl)",
          }}
        >
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>
            Variables
          </h2>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "var(--space-md)" }}>
            Values to use in steps (e.g. search_term, court). Reference as {"{{name}}"} in field values.
          </p>
          {varsList.map((v, i) => (
            <div key={i} style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-sm)", flexWrap: "wrap" }}>
              <input
                value={v.key}
                onChange={(e) => updateVar(i, "key", e.target.value)}
                placeholder="Name"
                style={{ ...inputStyle, flex: "1 1 120px", minWidth: 0 }}
              />
              <input
                value={v.value}
                onChange={(e) => updateVar(i, "value", e.target.value)}
                placeholder="Value"
                style={{ ...inputStyle, flex: "1 1 120px", minWidth: 0 }}
              />
              <button type="button" onClick={() => removeVar(i)} style={btnSecondary}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" onClick={addVar} style={btnSecondary}>
            + Add variable
          </button>
        </section>

        <section
          style={{
            padding: "var(--space-lg)",
            borderRadius: "12px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            marginBottom: "var(--space-xl)",
          }}
        >
          <div style={{ marginBottom: "var(--space-md)" }}>
            <label style={labelStyle}>Admin secret</label>
            <input
              type="password"
              value={adminSecret}
              onChange={(e) => setAdminSecret(e.target.value)}
              placeholder="ADMIN_SECRET"
              style={{ ...inputStyle, maxWidth: 320 }}
            />
          </div>
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={handleRun}
              disabled={running}
              className="btn-primary"
              style={{ padding: "var(--space-md) var(--space-xl)" }}
            >
              {running ? "Running…" : "Run scraper"}
            </button>
            <button
              type="button"
              onClick={() => {
                const payload = { flow: buildFlow(), vars: buildVars() }
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
                const a = document.createElement("a")
                a.href = URL.createObjectURL(blob)
                a.download = "scraper-flow.json"
                a.click()
                URL.revokeObjectURL(a.href)
              }}
              style={btnSecondary}
            >
              Export flow
            </button>
          </div>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "var(--space-md)" }}>
            For sites requiring login: export the flow, then run locally with a visible browser:{" "}
            <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>npm run scraper:headed -- scraper-flow.json</code>
          </p>
        </section>

        {result && (
          <section
            style={{
              padding: "var(--space-lg)",
              borderRadius: "12px",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              marginBottom: "var(--space-xl)",
            }}
          >
            <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-md)", color: result.error ? "var(--accent-gold)" : "var(--accent-cyan)" }}>
              Result
            </h2>
            <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>
              Job: {result.jobId ?? "—"} · Rows stored: {result.rowsStored ?? 0}
            </p>
            {result.error && <p style={{ marginTop: "var(--space-sm)", color: "var(--accent-gold)" }}>{result.error}</p>}
            {result.logs && result.logs.length > 0 && (
              <pre style={{ marginTop: "var(--space-md)", padding: "var(--space-md)", background: "var(--bg-elevated)", borderRadius: "8px", fontSize: "0.75rem", overflow: "auto", maxHeight: 180 }}>
                {result.logs.join("\n")}
              </pre>
            )}
          </section>
        )}

        <section style={{ marginBottom: "var(--space-xl)" }}>
          <button
            type="button"
            onClick={() => setShowJson((s) => !s)}
            style={btnSecondary}
          >
            {showJson ? "Hide" : "Show"} JSON
          </button>
          {showJson && (
            <pre
              style={{
                marginTop: "var(--space-md)",
                padding: "var(--space-md)",
                background: "var(--bg-elevated)",
                borderRadius: "8px",
                fontSize: "0.75rem",
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {JSON.stringify({ flow: buildFlow(), vars: buildVars() }, null, 2)}
            </pre>
          )}
        </section>
      </main>
    </div>
  )
}
