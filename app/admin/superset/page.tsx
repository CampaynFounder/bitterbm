"use client"

import { useState, useEffect, useMemo, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { ScraperStep } from "@/lib/scraper/types"

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
  minHeight: 44,
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  color: "var(--text-secondary)",
  cursor: "pointer",
  fontSize: "0.8125rem",
} as const

// ——— Superset flow (Phase 1): allowed step types for "one search" flow ———
const SUPERSET_STEP_TYPES: { value: string; label: string }[] = [
  { value: "navigate", label: "Go to URL" },
  { value: "switch_frame", label: "Switch to iframe" },
  { value: "switch_frame_main", label: "Switch to main page" },
  { value: "wait", label: "Wait for element" },
  { value: "fill_field", label: "Fill text field" },
  { value: "date_range", label: "Set date range" },
  { value: "form_fill", label: "Form fill (multiple fields + submit)" },
  { value: "checkbox", label: "Check / uncheck box" },
  { value: "click", label: "Click" },
  { value: "delay", label: "Delay (ms)" },
]

function createBlankSupersetStep(type: string): ScraperStep {
  const base = { label: "" }
  switch (type) {
    case "navigate":
      return { ...base, type: "navigate", config: { url: "", waitUntil: "networkidle" } }
    case "switch_frame":
      return { ...base, type: "switch_frame", config: { selector: "iframe#content" } }
    case "switch_frame_main":
      return { ...base, type: "switch_frame_main", config: {} }
    case "wait":
      return { ...base, type: "wait", config: { selector: "", timeout: 10000 } }
    case "fill_field":
      return { ...base, type: "fill_field", config: { selector: "", value: "", clearFirst: true } }
    case "date_range":
      return { ...base, type: "date_range", config: { fromSelector: "", toSelector: "", fromValue: "{{date_from}}", toValue: "{{date_to}}" } }
    case "form_fill":
      return { ...base, type: "form_fill", config: { fields: [], submit: "" } }
    case "checkbox":
      return { ...base, type: "checkbox", config: { selector: "", state: "checked" } }
    case "click":
      return { ...base, type: "click", config: { selector: "", waitAfter: 1000 } }
    case "delay":
      return { ...base, type: "delay", config: { ms: 1000 } }
    default:
      return { ...base, type, config: {} } as ScraperStep
  }
}

// ——— Site config type and default ———
export type SiteConfigState = {
  siteId: string
  baseUrl: string
  description?: string
  iframe: { selector?: string; urlContains?: string }
  searchForm: {
    patternField: { selector: string; type: string }
    wildcard: string
    minNonWildcardChars: number
    caseSensitive: boolean
    submitSelector: string
    dateRange?: { fromSelector?: string; toSelector?: string; fromValue?: string; toValue?: string }
    checkboxes?: Array<{ selector: string; checked: boolean }>
    dropdowns?: Array<{ selector: string; value: string }>
  }
  patternGeneration: { alphabet: string; length: number; useWildcard: boolean; wildcardChar: string }
  resultTable: {
    tableSelector: string
    rowSelector: string
    primaryId: { source: "column" | "link"; columnIndex?: number; linkSelector?: string; linkAttribute?: string }
    signatureColumns?: number[]
    threshold: number
    /** Optional human-readable labels; UI shows these, JSON still uses columnIndex (nth child). */
    columnNames?: string[]
    /** How to combine row filter conditions: "and" = all must match, "or" = any must match. */
    rowFilterLogic?: "and" | "or"
    /** Only include rows where conditions match (combined by rowFilterLogic). Each condition can have not: true to invert. */
    rowFilter?: Array<{ columnIndex: number; operator: "equals" | "in"; value: string | string[]; not?: boolean }>
    /** Column indices (and optional output keys) to extract per matching row; primaryId is always extracted as id. */
    extractColumns?: Array<{ columnIndex: number; outputKey?: string }>
    /** Within each parent row, check nested tables/elements; include or exclude parent based on exists/not_exists. */
    nestedRowFilters?: Array<{
      /** CSS selector evaluated within the parent row (e.g. td:nth-child(3) table tbody tr = 3rd cell’s nested table rows). */
      selectorWithinRow: string
      /** "exists" = at least one element matches; "not_exists" = zero elements match. */
      condition: "exists" | "not_exists"
      /** true = include parent row when condition holds; false = exclude parent row when condition holds. */
      includeParentWhen: boolean
      /** Optional label for UI (e.g. "Has filings in nested table"). */
      description?: string
    }>
    /** Nested table checks: absolute or row-scoped CSS selector(s); check if value(s) exist in column/row; output name, boolean, selectors, nth-child. */
    nestedTableChecks?: Array<{
      /** Display name (printed in output). */
      name: string
      /** CSS selector for the nested table (or container). Can be absolute (page) or relative to row. */
      tableSelector: string
      /** "row" = selector is evaluated within parent row; "page" = from page/frame root. */
      scope?: "row" | "page"
      /** Optional: row selector within the table (e.g. tbody tr). */
      rowSelector?: string
      /** 0-based column index (nth child) to check. */
      columnIndex?: number
      /** "exists" = element/table exists (no column value check); "equals" or "in" for value check. */
      operator?: "exists" | "equals" | "in"
      /** Value(s) to match in that column. */
      value?: string | string[]
      /** If set, output includes: name, exists (boolean), tableSelector, columnIndex, rowIndex (nth row match). */
      outputInRow?: boolean
    }>
  }
  pagination: { mode: string }
}

const defaultSiteConfigObj: SiteConfigState = {
  siteId: "example",
  baseUrl: "https://...",
  iframe: { selector: "iframe#content" },
  searchForm: {
    patternField: { selector: "#search", type: "text" },
    wildcard: "%",
    minNonWildcardChars: 1,
    caseSensitive: false,
    submitSelector: "#btnSearch",
  },
  patternGeneration: { alphabet: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", length: 3, useWildcard: true, wildcardChar: "%" },
  resultTable: { tableSelector: "table#results", rowSelector: "tbody tr", primaryId: { source: "column", columnIndex: 0 }, threshold: 5 },
  pagination: { mode: "all_in_dom" },
}

const defaultSiteConfig = JSON.stringify(defaultSiteConfigObj, null, 2)

const defaultSupersetFlow = `{
  "name": "superset-search",
  "steps": [
    { "type": "navigate", "config": { "url": "https://..." } },
    { "type": "switch_frame", "config": { "selector": "iframe#content" } },
    { "type": "form_fill", "config": { "fields": [], "submit": "#btnSearch" } },
    { "type": "wait", "config": { "selector": "table tbody tr", "timeout": 10000 } }
  ]
}
`

const defaultRetrievalFlow = `{
  "name": "retrieval",
  "steps": [
    { "type": "for_each_id", "config": { "idsVar": "ids", "limit": 0 } },
    { "type": "navigate", "config": { "url": "https://.../detail/{{current_id}}" } },
    { "type": "extract_field", "config": { "fieldId": "case_number", "selector": ".case-num", "attr": "text" } },
    { "type": "extract_pdf", "config": { "fieldId": "pdf_url", "screenshot": true } },
    { "type": "store_row", "config": {} }
  ]
}
`

/** Minimal flow that hits example.com so Phase 2 can be tested without a real target site. */
const quickTestRetrievalFlow = `{
  "name": "retrieval-quick-test",
  "steps": [
    { "type": "for_each_id", "config": { "idsVar": "ids", "limit": 0 } },
    { "type": "navigate", "config": { "url": "https://example.com/#{{current_id}}" } },
    { "type": "wait", "config": { "selector": "h1", "timeout": 5000 } },
    { "type": "extract_field", "config": { "fieldId": "page_title", "selector": "h1", "attr": "text" } },
    { "type": "store_row", "config": {} }
  ]
}
`
const quickTestIds = '["test-1", "test-2"]'

function downloadJson(filename: string, data: unknown) {
  const str = typeof data === "string" ? data : JSON.stringify(data, null, 2)
  const blob = new Blob([str], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ——— Visual superset flow editor (step cards + config) ———
function SupersetFlowEditor({
  flowName,
  steps,
  onFlowNameChange,
  onStepsChange,
  onError,
}: {
  flowName: string
  steps: ScraperStep[]
  onFlowNameChange: (name: string) => void
  onStepsChange: (steps: ScraperStep[]) => void
  onError: (msg: string) => void
}) {
  const [expandedSet, setExpandedSet] = useState<Set<number>>(() => new Set([0]))
  const [insertAt, setInsertAt] = useState<number | null>(null)

  const updateStep = (index: number, step: ScraperStep) => {
    const next = [...steps]
    next[index] = step
    onStepsChange(next)
  }

  const changeStepType = (index: number, newType: string) => {
    const blank = createBlankSupersetStep(newType)
    const prev = steps[index] as { config?: Record<string, unknown> }
    if (prev?.config && typeof prev.config === "object") {
      blank.config = { ...prev.config, ...(blank as { config?: Record<string, unknown> }).config }
    }
    updateStep(index, blank)
  }

  const insertStep = (at: number, type: string) => {
    const next = [...steps]
    next.splice(at, 0, createBlankSupersetStep(type))
    onStepsChange(next)
    setExpandedSet((s) => new Set(Array.from(s)).add(at))
    setInsertAt(null)
  }

  const removeStep = (index: number) => {
    const next = steps.filter((_, i) => i !== index)
    onStepsChange(next)
    setExpandedSet((s) => new Set(Array.from(s).filter((i) => i !== index).map((i) => (i >= index ? i - 1 : i))))
  }

  const moveStep = (index: number, dir: "up" | "down") => {
    const next = [...steps]
    const j = dir === "up" ? index - 1 : index + 1
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    onStepsChange(next)
    setExpandedSet((s) => {
      const out = new Set(Array.from(s))
      out.delete(index)
      out.delete(j)
      out.add(j)
      return out
    })
  }

  const duplicateStep = (index: number) => {
    const next = [...steps]
    next.splice(index + 1, 0, { ...steps[index] })
    onStepsChange(next)
    setExpandedSet((s) => new Set(Array.from(s)).add(index + 1))
  }

  return (
    <div>
      <div style={{ marginBottom: "var(--space-md)" }}>
        <label style={labelStyle}>Flow name</label>
        <input value={flowName} onChange={(e) => onFlowNameChange(e.target.value)} placeholder="superset-search" style={{ ...inputStyle, maxWidth: 320 }} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-sm)", marginBottom: "var(--space-md)", alignItems: "center" }}>
        <button type="button" onClick={() => setExpandedSet(new Set(steps.map((_, i) => i)))} style={btnSecondary}>
          Expand all
        </button>
        <button type="button" onClick={() => setExpandedSet(new Set())} style={btnSecondary}>
          Collapse all
        </button>
        <select
          value=""
          onChange={(e) => {
            const v = e.target.value
            if (v) { insertStep(steps.length, v); e.target.value = "" }
          }}
          style={{ ...inputStyle, maxWidth: 260 }}
        >
          <option value="">+ Add step at end</option>
          {SUPERSET_STEP_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      {steps.map((step, index) => (
        <div key={index}>
          {insertAt === index && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-sm)", padding: "var(--space-sm)", background: "var(--bg-elevated)", borderRadius: 8, border: "1px dashed var(--border)" }}>
              <span style={{ fontSize: "0.8125rem" }}>Insert:</span>
              <select
                onChange={(e) => { const v = e.target.value; if (v) insertStep(index, v) }}
                style={{ ...inputStyle, maxWidth: 240 }}
              >
                <option value="">Choose type…</option>
                {SUPERSET_STEP_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <button type="button" onClick={() => setInsertAt(null)} style={btnSecondary}>Cancel</button>
            </div>
          )}
          <SupersetStepCard
            step={step}
            index={index}
            total={steps.length}
            expanded={expandedSet.has(index)}
            onToggle={() => setExpandedSet((s) => { const n = new Set(Array.from(s)); if (n.has(index)) n.delete(index); else n.add(index); return n })}
            onChange={(s) => updateStep(index, s)}
            onTypeChange={(newType) => changeStepType(index, newType)}
            onRemove={() => removeStep(index)}
            onInsertAbove={() => setInsertAt(index)}
            onInsertBelow={() => setInsertAt(index + 1)}
            onMoveUp={() => moveStep(index, "up")}
            onMoveDown={() => moveStep(index, "down")}
            onDuplicate={() => duplicateStep(index)}
          />
        </div>
      ))}
    </div>
  )
}

function SupersetStepCard({
  step,
  index,
  total,
  expanded,
  onToggle,
  onChange,
  onTypeChange,
  onRemove,
  onInsertAbove,
  onInsertBelow,
  onMoveUp,
  onMoveDown,
  onDuplicate,
}: {
  step: ScraperStep
  index: number
  total: number
  expanded: boolean
  onToggle: () => void
  onChange: (s: ScraperStep) => void
  onTypeChange: (newType: string) => void
  onRemove: () => void
  onInsertAbove: () => void
  onInsertBelow: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDuplicate: () => void
}) {
  const cfg = (step as { config?: Record<string, unknown> }).config ?? {}
  const update = (key: string, value: unknown) => {
    onChange({ ...step, config: { ...cfg, [key]: value } } as ScraperStep)
  }
  const typeLabel = SUPERSET_STEP_TYPES.find((t) => t.value === step.type)?.label ?? step.type
  const stepLabel = (step as { label?: string }).label ?? ""

  return (
    <div style={{ borderRadius: 12, background: "var(--bg-elevated)", border: "1px solid var(--border)", marginBottom: "var(--space-md)", overflow: "hidden" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "var(--space-sm)", padding: "var(--space-md)", cursor: "pointer" }} onClick={onToggle}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", flex: 1, minWidth: 0 }}>
          <span style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block" }}>▶</span>
          <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{index + 1}. {typeLabel}</span>
          {stepLabel && <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>— {stepLabel}</span>}
        </div>
        <div style={{ display: "flex", gap: "var(--space-xs)", flexWrap: "wrap", alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={onInsertAbove} style={{ ...btnSecondary, borderColor: "var(--accent-cyan)", color: "var(--accent-cyan)" }}>+ above</button>
          <button type="button" onClick={onInsertBelow} style={{ ...btnSecondary, borderColor: "var(--accent-cyan)", color: "var(--accent-cyan)" }}>+ below</button>
          <button type="button" onClick={onDuplicate} style={btnSecondary}>Duplicate</button>
          <button type="button" onClick={onMoveUp} disabled={index === 0} style={btnSecondary}>↑</button>
          <button type="button" onClick={onMoveDown} disabled={index >= total - 1} style={btnSecondary}>↓</button>
          <button type="button" onClick={onRemove} style={{ ...btnSecondary, color: "var(--accent-gold)" }}>Remove</button>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: "0 var(--space-md) var(--space-md)", borderTop: "1px solid var(--border)" }}>
          <div style={{ marginBottom: "var(--space-md)" }}>
            <label style={labelStyle}>Step label (optional)</label>
            <input value={stepLabel} onChange={(e) => onChange({ ...step, label: e.target.value } as ScraperStep)} placeholder="e.g. Go to search page" style={{ ...inputStyle, maxWidth: 320 }} onClick={(e) => e.stopPropagation()} />
          </div>
          <div style={{ marginBottom: "var(--space-md)" }}>
            <label style={labelStyle}>Step type</label>
            <select value={step.type} onChange={(e) => onTypeChange(e.target.value)} style={{ ...inputStyle, maxWidth: 280 }}>
              {SUPERSET_STEP_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          {step.type === "navigate" && (
            <>
              <div><label style={labelStyle}>URL</label><input value={String(cfg.url ?? "")} onChange={(e) => update("url", e.target.value)} placeholder="https://..." style={inputStyle} /></div>
              <div><label style={labelStyle}>Wait for page</label><select value={String(cfg.waitUntil ?? "networkidle")} onChange={(e) => update("waitUntil", e.target.value)} style={inputStyle}><option value="domcontentloaded">DOM ready</option><option value="load">Load</option><option value="networkidle">Network idle</option></select></div>
            </>
          )}
          {step.type === "switch_frame" && (
            <>
              <div><label style={labelStyle}>iframe CSS selector</label><input value={String(cfg.selector ?? "")} onChange={(e) => update("selector", e.target.value)} placeholder='iframe#content' style={inputStyle} /></div>
              <div><label style={labelStyle}>Or frame name</label><input value={String(cfg.name ?? "")} onChange={(e) => update("name", e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Or frame URL (partial)</label><input value={String(cfg.url ?? "")} onChange={(e) => update("url", e.target.value)} style={inputStyle} /></div>
            </>
          )}
          {step.type === "switch_frame_main" && <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Switches back to the top-level document.</p>}
          {step.type === "wait" && (
            <>
              <div><label style={labelStyle}>CSS selector</label><input value={String(cfg.selector ?? "")} onChange={(e) => update("selector", e.target.value)} placeholder="table tbody tr" style={inputStyle} /></div>
              <div><label style={labelStyle}>Wait until</label><select value={String(cfg.waitUntil ?? "visible")} onChange={(e) => update("waitUntil", e.target.value)} style={inputStyle}><option value="visible">Visible</option><option value="hidden">Hidden</option><option value="attached">Attached</option></select></div>
              <div><label style={labelStyle}>Timeout (ms)</label><input type="number" value={Number(cfg.timeout ?? 10000)} onChange={(e) => update("timeout", parseInt(e.target.value, 10) || 10000)} style={inputStyle} /></div>
            </>
          )}
          {step.type === "fill_field" && (
            <>
              <div><label style={labelStyle}>Selector</label><input value={String(cfg.selector ?? "")} onChange={(e) => update("selector", e.target.value)} placeholder="#search" style={inputStyle} /></div>
              <div><label style={labelStyle}>Value (use {"{{pattern}}"} for vars)</label><input value={String(cfg.value ?? "")} onChange={(e) => update("value", e.target.value)} placeholder="{{pattern}}" style={inputStyle} /></div>
            </>
          )}
          {step.type === "date_range" && (
            <>
              <div><label style={labelStyle}>From selector</label><input value={String(cfg.fromSelector ?? "")} onChange={(e) => update("fromSelector", e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>To selector</label><input value={String(cfg.toSelector ?? "")} onChange={(e) => update("toSelector", e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>From value</label><input value={String(cfg.fromValue ?? "")} onChange={(e) => update("fromValue", e.target.value)} placeholder="{{date_from}}" style={inputStyle} /></div>
              <div><label style={labelStyle}>To value</label><input value={String(cfg.toValue ?? "")} onChange={(e) => update("toValue", e.target.value)} placeholder="{{date_to}}" style={inputStyle} /></div>
            </>
          )}
          {step.type === "form_fill" && (
            <>
              <div><label style={labelStyle}>Submit button selector</label><input value={String(cfg.submit ?? "")} onChange={(e) => update("submit", e.target.value)} placeholder="#btnSearch" style={inputStyle} /></div>
              <FormFillFieldsEditor fields={(cfg.fields ?? []) as Array<{ selector?: string; value?: string; name?: string }>} onChange={(fields) => update("fields", fields)} />
            </>
          )}
          {step.type === "checkbox" && (
            <>
              <div><label style={labelStyle}>Checkbox selector</label><input value={String(cfg.selector ?? "")} onChange={(e) => update("selector", e.target.value)} placeholder="#activeOnly, input[name=civil]" style={inputStyle} /></div>
              <div><label style={labelStyle}>State</label><select value={String(cfg.state ?? "checked")} onChange={(e) => update("state", e.target.value)} style={inputStyle}><option value="checked">Checked (true)</option><option value="unchecked">Unchecked (false)</option></select></div>
            </>
          )}
          {step.type === "click" && (
            <>
              <div><label style={labelStyle}>Selector</label><input value={String(cfg.selector ?? "")} onChange={(e) => update("selector", e.target.value)} placeholder="#btnSearch" style={inputStyle} /></div>
              <div><label style={labelStyle}>Wait after (ms)</label><input type="number" value={Number(cfg.waitAfter ?? 1000)} onChange={(e) => update("waitAfter", parseInt(e.target.value, 10) || 0)} style={inputStyle} /></div>
            </>
          )}
          {step.type === "delay" && (
            <div><label style={labelStyle}>Delay (ms)</label><input type="number" value={Number(cfg.ms ?? 1000)} onChange={(e) => update("ms", parseInt(e.target.value, 10) || 1000)} style={inputStyle} /></div>
          )}
        </div>
      )}
    </div>
  )
}

function FormFillFieldsEditor({ fields, onChange }: { fields: Array<{ selector?: string; value?: string; name?: string }>; onChange: (f: Array<{ selector?: string; value?: string; name?: string }>) => void }) {
  const add = () => onChange([...fields, { selector: "", value: "" }])
  const updateAt = (i: number, key: string, value: string) => {
    const next = [...fields]
    next[i] = { ...next[i], [key]: value }
    onChange(next)
  }
  const remove = (i: number) => onChange(fields.filter((_, j) => j !== i))
  return (
    <div>
      <label style={labelStyle}>Fields (selector or name + value)</label>
      {fields.map((f, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "var(--space-sm)", marginBottom: "var(--space-sm)", alignItems: "end" }}>
          <input value={f.selector ?? ""} onChange={(e) => updateAt(i, "selector", e.target.value)} placeholder="Selector #field" style={inputStyle} />
          <input value={f.value ?? ""} onChange={(e) => updateAt(i, "value", e.target.value)} placeholder="Value or {{var}}" style={inputStyle} />
          <button type="button" onClick={() => remove(i)} style={btnSecondary}>Remove</button>
        </div>
      ))}
      <button type="button" onClick={add} style={{ ...btnSecondary, marginTop: "var(--space-xs)" }}>+ Add field</button>
    </div>
  )
}

const SITE_CONFIG_SECTIONS = ["resultTable", "patternGeneration", "site", "iframe", "searchForm", "pagination"] as const
type SiteConfigSection = (typeof SITE_CONFIG_SECTIONS)[number]

// ——— Visual site config form ———
function SiteConfigForm({ config, onChange, onlySections }: { config: SiteConfigState; onChange: (c: SiteConfigState) => void; onlySections?: SiteConfigSection[] }) {
  const show = (s: SiteConfigSection) => !onlySections || onlySections.includes(s)
  const update = (path: string, value: unknown) => {
    const keys = path.split(".")
    const next = JSON.parse(JSON.stringify(config)) as SiteConfigState
    let cur: Record<string, unknown> = next
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]
      if (!(k in cur)) (cur as Record<string, unknown>)[k] = {}
      cur = cur[k] as Record<string, unknown>
    }
    cur[keys[keys.length - 1]] = value
    onChange(next)
  }
  const section = (title: string, children: ReactNode) => (
    <div style={{ marginBottom: "var(--space-lg)" }}>
      <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "var(--space-sm)", color: "var(--text-secondary)" }}>{title}</h3>
      {children}
    </div>
  )
  return (
    <div>
      {show("resultTable") && section("Result table", (() => {
        const rt = config.resultTable
        const columnNames = rt.columnNames ?? []
        const maxCol = Math.max(11, columnNames.length)
        const columnLabel = (idx: number) => (columnNames[idx] != null ? `${columnNames[idx]} (column ${idx})` : `Column ${idx}`)
        return (
        <>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Table selector</label><input value={rt.tableSelector} onChange={(e) => update("resultTable.tableSelector", e.target.value)} placeholder="table#gvResults" style={inputStyle} /></div>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Row selector</label><input value={rt.rowSelector} onChange={(e) => update("resultTable.rowSelector", e.target.value)} placeholder="tbody tr" style={inputStyle} /></div>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Column names (optional, comma-separated)</label><input value={columnNames.join(", ")} onChange={(e) => update("resultTable.columnNames", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} placeholder="Case #, Status, Case Type, …" style={inputStyle} /><span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginTop: 2 }}>Labels for UX only; config still uses 0-based column index (nth child).</span></div>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Primary ID source</label><select value={rt.primaryId.source} onChange={(e) => update("resultTable.primaryId.source", e.target.value as "column" | "link")} style={inputStyle}><option value="column">column</option><option value="link">link</option></select></div>
          {rt.primaryId.source === "column" && <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Primary ID column</label><select value={String(rt.primaryId.columnIndex ?? 0)} onChange={(e) => update("resultTable.primaryId.columnIndex", parseInt(e.target.value, 10) || 0)} style={inputStyle}>{Array.from({ length: maxCol + 1 }, (_, i) => <option key={i} value={i}>{columnLabel(i)}</option>)}</select></div>}
          {rt.primaryId.source === "link" && (<><div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Link selector</label><input value={rt.primaryId.linkSelector ?? ""} onChange={(e) => update("resultTable.primaryId.linkSelector", e.target.value)} style={inputStyle} /></div><div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Link attribute</label><input value={rt.primaryId.linkAttribute ?? "href"} onChange={(e) => update("resultTable.primaryId.linkAttribute", e.target.value)} style={inputStyle} /></div></>)}
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Threshold (min rows)</label><input type="number" value={rt.threshold} onChange={(e) => update("resultTable.threshold", parseInt(e.target.value, 10) || 5)} style={{ ...inputStyle, maxWidth: 100 }} /></div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "var(--space-sm)" }}>DOM: tableSelector + rowSelector find rows. Row filter (below) keeps only rows matching conditions (AND/OR + optional NOT). For matching rows we extract primary ID and any extract columns; output = search criteria + list of ids (and those values).</p>
          <div style={{ marginTop: "var(--space-md)" }}>
            <label style={labelStyle}>Row filter logic</label>
            <select value={rt.rowFilterLogic ?? "and"} onChange={(e) => update("resultTable.rowFilterLogic", e.target.value as "and" | "or")} style={{ ...inputStyle, maxWidth: 180 }}>
              <option value="and">Match all (AND)</option>
              <option value="or">Match any (OR)</option>
            </select>
          </div>
          {(rt.rowFilter ?? []).length > 0 && (
            <div style={{ marginTop: "var(--space-sm)" }}>
              <label style={labelStyle}>Row conditions (nth child = value / in values; NOT inverts)</label>
              {(rt.rowFilter ?? []).map((f, i) => (
                <div key={i} style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-xs)", flexWrap: "wrap", alignItems: "center" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.8125rem" }}><input type="checkbox" checked={f.not ?? false} onChange={(e) => { const arr = [...(rt.rowFilter ?? [])]; arr[i] = { ...arr[i], not: e.target.checked }; update("resultTable.rowFilter", arr) }} />NOT</label>
                  <select value={String(f.columnIndex)} onChange={(e) => { const arr = [...(rt.rowFilter ?? [])]; arr[i] = { ...arr[i], columnIndex: parseInt(e.target.value, 10) || 0 }; update("resultTable.rowFilter", arr) }} style={{ ...inputStyle, width: 180 }} title="Column (nth child)">{Array.from({ length: maxCol + 1 }, (_, j) => <option key={j} value={j}>{columnLabel(j)}</option>)}</select>
                  <select value={f.operator} onChange={(e) => { const arr = [...(rt.rowFilter ?? [])]; arr[i] = { ...arr[i], operator: e.target.value as "equals" | "in" }; update("resultTable.rowFilter", arr) }} style={{ ...inputStyle, width: 90 }}><option value="equals">equals</option><option value="in">in</option></select>
                  <input value={Array.isArray(f.value) ? f.value.join(", ") : String(f.value ?? "")} onChange={(e) => { const v = e.target.value; const arr = [...(rt.rowFilter ?? [])]; arr[i] = { ...arr[i], value: f.operator === "in" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v }; update("resultTable.rowFilter", arr) }} placeholder={f.operator === "in" ? "A, B, C" : "value"} style={{ ...inputStyle, flex: 1, minWidth: 100 }} />
                  <button type="button" onClick={() => update("resultTable.rowFilter", (rt.rowFilter ?? []).filter((_, j) => j !== i))} style={btnSecondary}>Remove</button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={() => update("resultTable.rowFilter", [...(rt.rowFilter ?? []), { columnIndex: 0, operator: "equals" as const, value: "", not: false }])} style={{ ...btnSecondary, marginTop: "var(--space-sm)" }}>+ Add row condition</button>
          <div style={{ marginTop: "var(--space-lg)" }}>
            <label style={labelStyle}>Extract columns (optional; primary ID is always extracted as id)</label>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "var(--space-xs)" }}>For each matching row, also extract these column values; output key defaults to col_0, col_1, or set a name.</p>
            {(rt.extractColumns ?? []).map((ec, i) => (
              <div key={i} style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-xs)", flexWrap: "wrap", alignItems: "center" }}>
                <select value={String(ec.columnIndex)} onChange={(e) => { const arr = [...(rt.extractColumns ?? [])]; arr[i] = { ...arr[i], columnIndex: parseInt(e.target.value, 10) || 0 }; update("resultTable.extractColumns", arr) }} style={{ ...inputStyle, width: 180 }}>{Array.from({ length: maxCol + 1 }, (_, j) => <option key={j} value={j}>{columnLabel(j)}</option>)}</select>
                <input value={ec.outputKey ?? ""} onChange={(e) => { const arr = [...(rt.extractColumns ?? [])]; arr[i] = { ...arr[i], outputKey: e.target.value.trim() || undefined }; update("resultTable.extractColumns", arr) }} placeholder="Output key (e.g. status) or leave blank for col_N" style={{ ...inputStyle, width: 140 }} />
                <button type="button" onClick={() => update("resultTable.extractColumns", (rt.extractColumns ?? []).filter((_, j) => j !== i))} style={btnSecondary}>Remove</button>
              </div>
            ))}
            <button type="button" onClick={() => update("resultTable.extractColumns", [...(rt.extractColumns ?? []), { columnIndex: 0, outputKey: undefined }])} style={{ ...btnSecondary, marginTop: "var(--space-sm)" }}>+ Add extract column</button>
          </div>
          <div style={{ marginTop: "var(--space-lg)" }}>
            <label style={labelStyle}>Nested table filters (exists / not exists)</label>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "var(--space-sm)" }}>Within each result row, Playwright checks the selector (e.g. <code>td:nth-child(3) table tbody tr</code> for 3rd cell’s nested table rows). Use to include or exclude parent rows based on whether nested content exists.</p>
            {(rt.nestedRowFilters ?? []).map((nf, i) => (
              <div key={i} style={{ marginBottom: "var(--space-sm)", padding: "var(--space-sm)", background: "var(--bg-elevated)", borderRadius: 8, border: "1px solid var(--border)" }}>
                <div style={{ marginBottom: "var(--space-xs)" }}><input value={nf.description ?? ""} onChange={(e) => { const arr = [...(rt.nestedRowFilters ?? [])]; arr[i] = { ...arr[i], description: e.target.value.trim() || undefined }; update("resultTable.nestedRowFilters", arr) }} placeholder="Label (optional)" style={{ ...inputStyle, maxWidth: 240 }} /></div>
                <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", alignItems: "center", marginBottom: "var(--space-xs)" }}>
                  <span style={{ fontSize: "0.8125rem" }}>Within row:</span>
                  <input value={nf.selectorWithinRow} onChange={(e) => { const arr = [...(rt.nestedRowFilters ?? [])]; arr[i] = { ...arr[i], selectorWithinRow: e.target.value }; update("resultTable.nestedRowFilters", arr) }} placeholder="td:nth-child(3) table tbody tr" style={{ ...inputStyle, flex: 1, minWidth: 200 }} title="CSS selector relative to parent row" />
                </div>
                <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", alignItems: "center" }}>
                  <select value={nf.condition} onChange={(e) => { const arr = [...(rt.nestedRowFilters ?? [])]; arr[i] = { ...arr[i], condition: e.target.value as "exists" | "not_exists" }; update("resultTable.nestedRowFilters", arr) }} style={{ ...inputStyle, width: 120 }}><option value="exists">exists</option><option value="not_exists">not exists</option></select>
                  <select value={nf.includeParentWhen ? "include" : "exclude"} onChange={(e) => { const arr = [...(rt.nestedRowFilters ?? [])]; arr[i] = { ...arr[i], includeParentWhen: e.target.value === "include" }; update("resultTable.nestedRowFilters", arr) }} style={{ ...inputStyle, width: 160 }}><option value="include">Include parent when</option><option value="exclude">Exclude parent when</option></select>
                  <button type="button" onClick={() => update("resultTable.nestedRowFilters", (rt.nestedRowFilters ?? []).filter((_, j) => j !== i))} style={btnSecondary}>Remove</button>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => update("resultTable.nestedRowFilters", [...(rt.nestedRowFilters ?? []), { selectorWithinRow: "td:nth-child(1) table tr", condition: "exists" as const, includeParentWhen: true }])} style={{ ...btnSecondary, marginTop: "var(--space-xs)" }}>+ Add nested filter</button>
          </div>
          <div style={{ marginTop: "var(--space-lg)" }}>
            <label style={labelStyle}>Nested table checks (output: name, exists, rowIndex)</label>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "var(--space-sm)" }}>
              <strong>Scope:</strong> <em>row</em> = look inside this result row (or its next row for expandable grids). <em>page</em> = look from the whole page/frame (use when the nested table is not inside the current row). <strong>Row selector</strong> = CSS for rows inside the table (e.g. <code>tbody tr</code>); required for equals/in. <strong>Check:</strong> exists = table has any rows; equals = one value; in = any of several (comma-separated).
            </p>
            {(rt.nestedTableChecks ?? []).map((nc, i) => (
              <div key={i} style={{ marginBottom: "var(--space-sm)", padding: "var(--space-sm)", background: "var(--bg-elevated)", borderRadius: 8, border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", marginBottom: "var(--space-xs)" }}>
                  <input value={nc.name} onChange={(e) => { const arr = [...(rt.nestedTableChecks ?? [])]; arr[i] = { ...arr[i], name: e.target.value }; update("resultTable.nestedTableChecks", arr) }} placeholder="Name (output label)" style={{ ...inputStyle, width: 140 }} />
                  <select value={nc.scope ?? "row"} onChange={(e) => { const arr = [...(rt.nestedTableChecks ?? [])]; arr[i] = { ...arr[i], scope: e.target.value as "row" | "page" }; update("resultTable.nestedTableChecks", arr) }} style={{ ...inputStyle, width: 100 }} title="row = inside this result row (or next row); page = whole page"><option value="row">row</option><option value="page">page</option></select>
                  <input value={nc.tableSelector} onChange={(e) => { const arr = [...(rt.nestedTableChecks ?? [])]; arr[i] = { ...arr[i], tableSelector: e.target.value }; update("resultTable.nestedTableChecks", arr) }} placeholder="Table CSS (e.g. table#EventGrid)" style={{ ...inputStyle, flex: 1, minWidth: 160 }} title="CSS selector for the nested table" />
                </div>
                <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", alignItems: "center", marginBottom: "var(--space-xs)" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Row selector (CSS):</span>
                  <input value={nc.rowSelector ?? ""} onChange={(e) => { const v = e.target.value; const arr = [...(rt.nestedTableChecks ?? [])]; arr[i] = { ...arr[i], rowSelector: v === "" ? undefined : v }; update("resultTable.nestedTableChecks", arr) }} placeholder="e.g. tbody tr" style={{ ...inputStyle, width: 120 }} title="CSS for rows inside the table (spaces allowed, e.g. tbody tr)" />
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Check:</span>
                  <select value={nc.operator ?? "equals"} onChange={(e) => { const arr = [...(rt.nestedTableChecks ?? [])]; arr[i] = { ...arr[i], operator: e.target.value as "exists" | "equals" | "in" }; update("resultTable.nestedTableChecks", arr) }} style={{ ...inputStyle, width: 88 }}><option value="exists">exists</option><option value="equals">equals</option><option value="in">in</option></select>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Column index (0-based):</span>
                  <input type="number" min={0} value={Math.max(0, nc.columnIndex ?? 0)} onChange={(e) => { const v = Math.max(0, parseInt(e.target.value, 10) || 0); const arr = [...(rt.nestedTableChecks ?? [])]; arr[i] = { ...arr[i], columnIndex: v }; update("resultTable.nestedTableChecks", arr) }} style={{ ...inputStyle, width: 56 }} title="Column in the nested table to check (0 = first)" />
                  <input value={Array.isArray(nc.value) ? (nc.value as string[]).join(", ") : String(nc.value ?? "")} onChange={(e) => { const v = e.target.value; const arr = [...(rt.nestedTableChecks ?? [])]; arr[i] = { ...arr[i], value: (nc.operator ?? "equals") === "in" ? v.split(",").map((s) => s.trim()) : v }; update("resultTable.nestedTableChecks", arr) }} placeholder={(nc.operator ?? "equals") === "in" ? "A, B, C (comma-separated)" : "Value"} style={{ ...inputStyle, width: 200 }} title="One value for equals; for 'in', type several values separated by commas" />
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.8125rem" }}><input type="checkbox" checked={nc.outputInRow ?? false} onChange={(e) => { const arr = [...(rt.nestedTableChecks ?? [])]; arr[i] = { ...arr[i], outputInRow: e.target.checked }; update("resultTable.nestedTableChecks", arr) }} />Output in row</label>
                </div>
                <button type="button" onClick={() => update("resultTable.nestedTableChecks", (rt.nestedTableChecks ?? []).filter((_, j) => j !== i))} style={btnSecondary}>Remove</button>
              </div>
            ))}
            <button type="button" onClick={() => update("resultTable.nestedTableChecks", [...(rt.nestedTableChecks ?? []), { name: "Nested table 1", tableSelector: "table.nested", scope: "page", operator: "exists" as const, outputInRow: true }])} style={{ ...btnSecondary, marginTop: "var(--space-xs)" }}>+ Add nested table check</button>
          </div>
        </>
        )
      })())}
      {show("resultTable") && section("Result config (table + filters + search loop in one JSON)", (
        <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "var(--space-sm)" }}>Save or load the result table, row filters, nested filters, extract columns, and pattern generation (search loop) as a single JSON. The search loop runs separately in Phase 1 (e.g. AAB, AAC) and uses this config to filter and extract from the result table.</p>
      ))}
      {show("patternGeneration") && section("Pattern generation (AAB, AAC … search loop)", (
        <>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Alphabet</label><input value={config.patternGeneration.alphabet} onChange={(e) => update("patternGeneration.alphabet", e.target.value)} style={inputStyle} /></div>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Length</label><input type="number" value={config.patternGeneration.length} onChange={(e) => update("patternGeneration.length", parseInt(e.target.value, 10) || 3)} style={{ ...inputStyle, maxWidth: 80 }} /></div>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-sm)" }}><input type="checkbox" checked={config.patternGeneration.useWildcard} onChange={(e) => update("patternGeneration.useWildcard", e.target.checked)} />Use wildcard</label>
          <div><label style={labelStyle}>Wildcard character</label><input value={config.patternGeneration.wildcardChar} onChange={(e) => update("patternGeneration.wildcardChar", e.target.value)} style={{ ...inputStyle, maxWidth: 80 }} /></div>
        </>
      ))}
      {show("site") && section("Site", (
        <>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Site ID</label><input value={config.siteId} onChange={(e) => update("siteId", e.target.value)} style={inputStyle} /></div>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Base URL</label><input value={config.baseUrl} onChange={(e) => update("baseUrl", e.target.value)} placeholder="https://..." style={inputStyle} /></div>
          <div><label style={labelStyle}>Description (optional)</label><input value={config.description ?? ""} onChange={(e) => update("description", e.target.value)} style={inputStyle} /></div>
        </>
      ))}
      {show("iframe") && section("Iframe", (
        <>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Selector</label><input value={config.iframe.selector ?? ""} onChange={(e) => update("iframe.selector", e.target.value)} placeholder="iframe#content" style={inputStyle} /></div>
          <div><label style={labelStyle}>URL contains (optional)</label><input value={config.iframe.urlContains ?? ""} onChange={(e) => update("iframe.urlContains", e.target.value)} style={inputStyle} /></div>
        </>
      ))}
      {show("searchForm") && section("Search form", (
        <>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Pattern field selector</label><input value={config.searchForm.patternField.selector} onChange={(e) => update("searchForm.patternField.selector", e.target.value)} placeholder="#tbPersonSearch" style={inputStyle} /></div>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Pattern field type</label><select value={config.searchForm.patternField.type} onChange={(e) => update("searchForm.patternField.type", e.target.value)} style={inputStyle}><option value="text">text</option></select></div>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Wildcard character</label><input value={config.searchForm.wildcard} onChange={(e) => update("searchForm.wildcard", e.target.value)} placeholder="%" style={{ ...inputStyle, maxWidth: 80 }} /></div>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Min non-wildcard chars</label><input type="number" value={config.searchForm.minNonWildcardChars} onChange={(e) => update("searchForm.minNonWildcardChars", parseInt(e.target.value, 10) || 0)} style={{ ...inputStyle, maxWidth: 100 }} /></div>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-sm)" }}><input type="checkbox" checked={config.searchForm.caseSensitive} onChange={(e) => update("searchForm.caseSensitive", e.target.checked)} />Case sensitive</label>
          <div><label style={labelStyle}>Submit button selector</label><input value={config.searchForm.submitSelector} onChange={(e) => update("searchForm.submitSelector", e.target.value)} placeholder="#btnSearch" style={inputStyle} /></div>
        </>
      ))}
      {show("pagination") && section("Pagination", (
        <div><label style={labelStyle}>Mode</label><select value={config.pagination.mode} onChange={(e) => update("pagination.mode", e.target.value)} style={inputStyle}><option value="all_in_dom">all_in_dom</option></select></div>
      ))}
    </div>
  )
}

function parseFlowJson(json: string): { name: string; steps: ScraperStep[] } {
  const data = JSON.parse(json) as { name?: string; steps?: unknown[] }
  const name = data.name ?? "superset-search"
  const steps = Array.isArray(data.steps) ? (data.steps as ScraperStep[]) : []
  return { name, steps }
}

export default function AdminSupersetPage() {
  const router = useRouter()
  const [session, setSession] = useState<{ access_token?: string } | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [adminSecret, setAdminSecret] = useState(() => {
    if (typeof window === "undefined") return ""
    return sessionStorage.getItem("scraper_admin_secret") ?? ""
  })

  const [flowJsonMode, setFlowJsonMode] = useState(false)
  const [siteConfigJsonMode, setSiteConfigJsonMode] = useState(false)
  const [flowName, setFlowName] = useState("superset-search")
  const [steps, setSteps] = useState<ScraperStep[]>(() => {
    try {
      return parseFlowJson(defaultSupersetFlow).steps
    } catch {
      return []
    }
  })
  const [siteConfig, setSiteConfig] = useState<SiteConfigState>(() => {
    try {
      return JSON.parse(defaultSiteConfig) as SiteConfigState
    } catch {
      return defaultSiteConfigObj
    }
  })
  const supersetFlowJson = useMemo(() => JSON.stringify({ name: flowName, steps }, null, 2), [flowName, steps])
  const siteConfigJson = useMemo(() => JSON.stringify(siteConfig, null, 2), [siteConfig])
  const [flowJsonText, setFlowJsonText] = useState(supersetFlowJson)
  const [siteConfigJsonText, setSiteConfigJsonText] = useState(siteConfigJson)
  useEffect(() => {
    if (flowJsonMode) setFlowJsonText(supersetFlowJson)
  }, [flowJsonMode, supersetFlowJson])
  useEffect(() => {
    if (siteConfigJsonMode) setSiteConfigJsonText(siteConfigJson)
  }, [siteConfigJsonMode, siteConfigJson])

  const applyFlowJson = () => {
    try {
      const { name, steps: s } = parseFlowJson(flowJsonText)
      setFlowName(name)
      setSteps(s)
    } catch {
      setRetrievalResult((r) => ({ ...r, error: "Invalid flow JSON" }))
    }
  }
  const applySiteConfigJson = () => {
    try {
      setSiteConfig(JSON.parse(siteConfigJsonText) as SiteConfigState)
    } catch {
      setRetrievalResult((r) => ({ ...r, error: "Invalid site config JSON" }))
    }
  }

  const [idsInput, setIdsInput] = useState("")
  const [retrievalFlowJson, setRetrievalFlowJson] = useState(defaultRetrievalFlow)
  const [retrievalLoading, setRetrievalLoading] = useState(false)
  const [retrievalResult, setRetrievalResult] = useState<{ jobId?: string; rowsStored?: number; pdfDocumentsStored?: number; error?: string; logs?: string[] } | null>(null)

  type SavedFlowRow = { id: string; name: string; description?: string; flow_json: unknown; kind?: string }
  const [savedFlowsList, setSavedFlowsList] = useState<SavedFlowRow[]>([])
  const [savedConfigsList, setSavedConfigsList] = useState<SavedFlowRow[]>([])
  const [savedResultConfigsList, setSavedResultConfigsList] = useState<SavedFlowRow[]>([])
  const [savedE2EList, setSavedE2EList] = useState<SavedFlowRow[]>([])
  const [sectionExpanded, setSectionExpanded] = useState({ flow: true, results: true, siteConfig: true })
  const [loadFlowModalOpen, setLoadFlowModalOpen] = useState(false)
  const [loadConfigModalOpen, setLoadConfigModalOpen] = useState(false)
  const [loadResultConfigModalOpen, setLoadResultConfigModalOpen] = useState(false)
  const [loadE2EModalOpen, setLoadE2EModalOpen] = useState(false)
  const [saveFlowModalOpen, setSaveFlowModalOpen] = useState(false)
  const [saveConfigModalOpen, setSaveConfigModalOpen] = useState(false)
  const [saveResultConfigModalOpen, setSaveResultConfigModalOpen] = useState(false)
  const [saveE2EModalOpen, setSaveE2EModalOpen] = useState(false)
  const [e2ESearch, setE2ESearch] = useState("")
  const [savedE2ELoading, setSavedE2ELoading] = useState(false)
  const [saveName, setSaveName] = useState("")
  const [saveDescription, setSaveDescription] = useState("")
  const [flowSearch, setFlowSearch] = useState("")
  const [configSearch, setConfigSearch] = useState("")
  const [resultConfigSearch, setResultConfigSearch] = useState("")
  const [savedFlowsLoading, setSavedFlowsLoading] = useState(false)
  const [savedConfigsLoading, setSavedConfigsLoading] = useState(false)
  const [savedResultConfigsLoading, setSavedResultConfigsLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (loadFlowModalOpen && (adminSecret || session?.access_token)) {
      setSavedFlowsLoading(true)
      fetch(`/api/admin/scraper/flows?kind=superset_flow`, { headers: authHeaders() })
        .then((res) => res.json())
        .then((data) => setSavedFlowsList(data.flows ?? []))
        .catch(() => setSavedFlowsList([]))
        .finally(() => setSavedFlowsLoading(false))
    }
  }, [loadFlowModalOpen, adminSecret, session?.access_token])
  useEffect(() => {
    if (loadConfigModalOpen && (adminSecret || session?.access_token)) {
      setSavedConfigsLoading(true)
      fetch(`/api/admin/scraper/flows?kind=superset_site_config`, { headers: authHeaders() })
        .then((res) => res.json())
        .then((data) => setSavedConfigsList(data.flows ?? []))
        .catch(() => setSavedConfigsList([]))
        .finally(() => setSavedConfigsLoading(false))
    }
  }, [loadConfigModalOpen, adminSecret, session?.access_token])
  useEffect(() => {
    if (loadResultConfigModalOpen && (adminSecret || session?.access_token)) {
      setSavedResultConfigsLoading(true)
      fetch(`/api/admin/scraper/flows?kind=superset_result_config`, { headers: authHeaders() })
        .then((res) => res.json())
        .then((data) => setSavedResultConfigsList(data.flows ?? []))
        .catch(() => setSavedResultConfigsList([]))
        .finally(() => setSavedResultConfigsLoading(false))
    }
  }, [loadResultConfigModalOpen, adminSecret, session?.access_token])
  useEffect(() => {
    if (loadE2EModalOpen && (adminSecret || session?.access_token)) {
      setSavedE2ELoading(true)
      fetch(`/api/admin/scraper/flows?kind=superset_e2e`, { headers: authHeaders() })
        .then((res) => res.json())
        .then((data) => setSavedE2EList(data.flows ?? []))
        .catch(() => setSavedE2EList([]))
        .finally(() => setSavedE2ELoading(false))
    }
  }, [loadE2EModalOpen, adminSecret, session?.access_token])

  const filteredSavedFlows = (flowSearch.trim()
    ? savedFlowsList.filter((f) => (f.name ?? "").toLowerCase().includes(flowSearch.trim().toLowerCase()) || (f.description ?? "").toLowerCase().includes(flowSearch.trim().toLowerCase()))
    : savedFlowsList).filter((f) => !f.kind || f.kind === "superset_flow")
  const filteredSavedConfigs = (configSearch.trim()
    ? savedConfigsList.filter((f) => (f.name ?? "").toLowerCase().includes(configSearch.trim().toLowerCase()) || (f.description ?? "").toLowerCase().includes(configSearch.trim().toLowerCase()))
    : savedConfigsList).filter((f) => !f.kind || f.kind === "superset_site_config")
  const filteredSavedResultConfigs = (resultConfigSearch.trim()
    ? savedResultConfigsList.filter((f) => (f.name ?? "").toLowerCase().includes(resultConfigSearch.trim().toLowerCase()) || (f.description ?? "").toLowerCase().includes(resultConfigSearch.trim().toLowerCase()))
    : savedResultConfigsList).filter((f) => !f.kind || f.kind === "superset_result_config")
  const filteredSavedE2E = (e2ESearch.trim()
    ? savedE2EList.filter((f) => (f.name ?? "").toLowerCase().includes(e2ESearch.trim().toLowerCase()) || (f.description ?? "").toLowerCase().includes(e2ESearch.trim().toLowerCase()))
    : savedE2EList).filter((f) => !f.kind || f.kind === "superset_e2e")

  async function handleSaveFlow() {
    if (!saveName.trim()) { setSaveError("Name required"); return }
    setSaveLoading(true)
    setSaveError(null)
    try {
      const res = await fetch("/api/admin/scraper/flows", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name: saveName.trim(), description: saveDescription.trim() || undefined, flow_json: { name: flowName, steps }, kind: "superset_flow" }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Save failed")
      setSaveFlowModalOpen(false)
      setSaveName("")
      setSaveDescription("")
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaveLoading(false)
    }
  }
  async function handleSaveConfig() {
    if (!saveName.trim()) { setSaveError("Name required"); return }
    setSaveLoading(true)
    setSaveError(null)
    try {
      const res = await fetch("/api/admin/scraper/flows", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name: saveName.trim(), description: saveDescription.trim() || undefined, flow_json: siteConfig, kind: "superset_site_config" }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Save failed")
      setSaveConfigModalOpen(false)
      setSaveName("")
      setSaveDescription("")
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaveLoading(false)
    }
  }
  function getResultConfigBlob() {
    return { resultTable: siteConfig.resultTable, patternGeneration: siteConfig.patternGeneration }
  }
  async function handleSaveResultConfig() {
    if (!saveName.trim()) { setSaveError("Name required"); return }
    setSaveLoading(true)
    setSaveError(null)
    try {
      const res = await fetch("/api/admin/scraper/flows", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name: saveName.trim(), description: saveDescription.trim() || undefined, flow_json: getResultConfigBlob(), kind: "superset_result_config" }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Save failed")
      setSaveResultConfigModalOpen(false)
      setSaveName("")
      setSaveDescription("")
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaveLoading(false)
    }
  }
  function getE2EBlob() {
    return { flow: { name: flowName, steps }, siteConfig }
  }
  async function handleSaveE2E() {
    if (!saveName.trim()) { setSaveError("Name required"); return }
    setSaveLoading(true)
    setSaveError(null)
    try {
      const res = await fetch("/api/admin/scraper/flows", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name: saveName.trim(), description: saveDescription.trim() || undefined, flow_json: getE2EBlob(), kind: "superset_e2e" }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Save failed")
      setSaveE2EModalOpen(false)
      setSaveName("")
      setSaveDescription("")
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaveLoading(false)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s) {
        router.replace("/admin/login")
        return
      }
      setSession(s)
      setSessionReady(true)
    })
  }, [router])

  useEffect(() => {
    if (typeof window !== "undefined" && adminSecret !== undefined) {
      if (adminSecret) sessionStorage.setItem("scraper_admin_secret", adminSecret)
      else sessionStorage.removeItem("scraper_admin_secret")
    }
  }, [adminSecret])

  const authHeaders = () => {
    const h: Record<string, string> = { "Content-Type": "application/json" }
    if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`
    if (adminSecret) h["X-Admin-Secret"] = adminSecret
    return h
  }

  async function handleDeleteFlow(id: string, name: string, setList: React.Dispatch<React.SetStateAction<SavedFlowRow[]>>, list: SavedFlowRow[]) {
    if (!confirm(`Delete "${name}"?`)) return
    const deleteId = id != null ? String(id).trim() : ""
    if (!deleteId) {
      setSaveError("Cannot delete: missing id")
      return
    }
    const prev = list
    setList((l) => l.filter((x) => x.id !== id))
    setSaveError(null)
    try {
      const res = await fetch("/api/admin/scraper/flows", { method: "POST", headers: authHeaders(), body: JSON.stringify({ action: "delete", id: deleteId }) })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setList(prev)
        setSaveError(data.error ?? "Delete failed")
      }
    } catch {
      setList(prev)
      setSaveError("Delete failed")
    }
  }

  function handleSupersetFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result))
        const ids = data.ids ?? (Array.isArray(data) ? data : [])
        setIdsInput(JSON.stringify(ids, null, 2))
      } catch {
        setRetrievalResult({ error: "Invalid superset JSON" })
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  async function handleRunRetrieval() {
    let ids: string[] = []
    try {
      const trimmed = idsInput.trim()
      if (trimmed) {
        const parsed = JSON.parse(trimmed)
        ids = Array.isArray(parsed) ? parsed : parsed?.ids ?? []
      }
    } catch {
      setRetrievalResult({ error: "Invalid ids JSON (use [\"id1\", \"id2\"] or superset file with .ids)" })
      return
    }

    let flow: { name?: string; steps: unknown[] }
    try {
      flow = JSON.parse(retrievalFlowJson)
      if (!flow?.steps?.length) throw new Error("flow.steps required")
    } catch (e) {
      setRetrievalResult({ error: "Invalid retrieval flow JSON" })
      return
    }

    setRetrievalLoading(true)
    setRetrievalResult(null)
    try {
      const res = await fetch("/api/admin/scrape/run", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          flow,
          ids: ids.length > 0 ? ids : undefined,
          vars: {},
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRetrievalResult({ error: (data as { error?: string }).error ?? "Run failed" })
        return
      }
      setRetrievalResult({
        jobId: (data as { jobId?: string }).jobId,
        rowsStored: (data as { rowsStored?: number }).rowsStored,
        pdfDocumentsStored: (data as { pdfDocumentsStored?: number }).pdfDocumentsStored,
        error: (data as { error?: string }).error,
        logs: (data as { logs?: string[] }).logs,
      })
    } catch (e) {
      setRetrievalResult({ error: e instanceof Error ? e.message : "Request failed" })
    } finally {
      setRetrievalLoading(false)
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      <header
        style={{
          padding: "var(--space-sm) var(--space-md)",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-elevated)",
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-sm)" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 700 }}>Superset builder & retrieval</h1>
          <div style={{ display: "flex", gap: "var(--space-sm)" }}>
            <Link href="/admin/autoscrape" style={{ color: "var(--accent-muted)", fontSize: "0.875rem" }}>
              Autoscrape
            </Link>
            <Link href="/admin/scrape" style={{ color: "var(--accent-muted)", fontSize: "0.875rem" }}>
              Scraper
            </Link>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "var(--space-md)", paddingBottom: "var(--space-2xl)" }}>
        <div style={{ marginBottom: "var(--space-md)" }}>
          <label style={labelStyle}>Admin secret (optional)</label>
          <input
            type="password"
            value={adminSecret}
            onChange={(e) => setAdminSecret(e.target.value)}
            placeholder="ADMIN_SECRET"
            style={{ ...inputStyle, maxWidth: 280 }}
          />
        </div>

        <section style={{ padding: "var(--space-md)", borderRadius: "12px", background: "var(--bg-card)", border: "1px solid var(--border)", marginBottom: "var(--space-lg)" }}>
          <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "var(--space-md)" }}>1. Superset flow & site config (Phase 1)</h2>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "var(--space-md)" }}>
            Configure the Playwright flow that runs one search (navigate, switch frame, form fill, submit) and the site config (selectors, threshold). Use with the Phase 1 script to build superset files locally. See{" "}
            <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>docs/SCRAPER_SUPERSET_ARCHITECTURE.md</code>.
          </p>
          <details style={{ marginBottom: "var(--space-md)", fontSize: "0.8125rem" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600, color: "var(--accent-muted)" }}>How to run superset (Phase 1 &amp; 2)</summary>
            <div style={{ marginTop: "var(--space-sm)", paddingLeft: "var(--space-sm)", borderLeft: "2px solid var(--border)" }}>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "var(--space-sm)" }}>Full config schema and table/row filter logic: <code>docs/SCRAPER_SUPERSET_ARCHITECTURE.md</code> (§6.2, resultTable.rowFilter and unique ID).</p>
              <p style={{ marginBottom: "var(--space-sm)" }}><strong>Phase 1 (build superset file):</strong></p>
              <ol style={{ marginBottom: "var(--space-md)", paddingLeft: "1.25rem" }}>
                <li>Download <strong>combined (flow + site config)</strong> as one file, or use <strong>Save superset (e2e)</strong> for a single saved preset.</li>
                <li>Run Phase 1: <code>python scraper/superset/phase1_build.py --config superset-phase1.json</code> (or <code>--flow flow.json --site-config site-config.json</code>). The script runs the flow (one search), then uses the result table config to filter rows and extract IDs. Output: superset file.</li>
              </ol>
              <p style={{ marginBottom: "var(--space-sm)" }}><strong>Phase 2 (retrieval by IDs):</strong></p>
              <ol style={{ marginBottom: 0, paddingLeft: "1.25rem" }}>
                <li>Upload or paste a superset file (or a JSON array of IDs) in the retrieval section below.</li>
                <li>Configure the retrieval flow (steps that use each ID, e.g. navigate to detail page).</li>
                <li>Run retrieval via the &quot;Run retrieval&quot; button (API) or run the headed script with <code>--ids-file</code> when available.</li>
              </ol>
            </div>
          </details>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-md)", paddingBottom: "var(--space-sm)", borderBottom: "1px solid var(--border)" }}>
            <button type="button" onClick={() => setSectionExpanded({ flow: true, results: true, siteConfig: true })} style={btnSecondary}>Expand all</button>
            <button type="button" onClick={() => setSectionExpanded({ flow: false, results: false, siteConfig: false })} style={btnSecondary}>Collapse all</button>
            <span style={{ width: "1px", height: 20, background: "var(--border)", margin: "0 var(--space-xs)" }} />
            <button type="button" onClick={() => { setSaveName(flowName); setSaveDescription(""); setSaveError(null); setSaveE2EModalOpen(true) }} style={btnSecondary} title="Save flow + site config as one superset preset">Save superset (e2e)</button>
            <button type="button" onClick={() => setLoadE2EModalOpen(true)} style={btnSecondary} title="Load a full superset preset (flow + site config)">Load superset (e2e)</button>
            <button type="button" onClick={() => { try { downloadJson("superset-phase1.json", getE2EBlob()) } catch { setRetrievalResult((r) => ({ ...r, error: "Invalid flow or config" })) } }} style={btnSecondary} title="Download single file for phase1_build.py --config superset-phase1.json">Download superset (e2e)</button>
          </div>

          <div style={{ border: "1px solid var(--border)", borderRadius: 8, marginBottom: "var(--space-md)", overflow: "hidden" }}>
            <button type="button" onClick={() => setSectionExpanded((s) => ({ ...s, flow: !s.flow }))} style={{ width: "100%", display: "flex", alignItems: "center", gap: "var(--space-sm)", padding: "var(--space-sm) var(--space-md)", background: "var(--bg-elevated)", border: "none", cursor: "pointer", fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)", textAlign: "left" }} className="hover:opacity-90">
              <span style={{ transform: sectionExpanded.flow ? "rotate(90deg)" : "none", display: "inline-block" }}>▶</span>
              1. Flow (route)
            </button>
            {sectionExpanded.flow && (
              <div style={{ padding: "var(--space-md)", borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", marginBottom: "var(--space-sm)" }}>
                  <label style={labelStyle}>Superset flow (one search)</label>
                  <button type="button" onClick={() => setFlowJsonMode((m) => !m)} style={btnSecondary}>{flowJsonMode ? "Use visual editor" : "Edit as JSON"}</button>
                </div>
                {flowJsonMode ? (
                  <>
                    <textarea value={flowJsonText} onChange={(e) => setFlowJsonText(e.target.value)} style={{ ...inputStyle, minHeight: 140, fontFamily: "monospace", fontSize: "0.8125rem" }} />
                    <button type="button" onClick={applyFlowJson} style={{ ...btnSecondary, marginTop: "var(--space-sm)" }}>Apply JSON</button>
                  </>
                ) : (
                  <SupersetFlowEditor flowName={flowName} steps={steps} onFlowNameChange={setFlowName} onStepsChange={setSteps} onError={(msg) => setRetrievalResult((r) => ({ ...r, error: msg }))} />
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-sm)", marginTop: "var(--space-md)" }}>
                  <button type="button" onClick={() => { try { downloadJson("superset-flow.json", flowJsonMode ? JSON.parse(flowJsonText) : { name: flowName, steps }) } catch { setRetrievalResult((r) => ({ ...r, error: "Invalid flow JSON" })) } }} style={btnSecondary}>Download flow.json</button>
                  <button type="button" onClick={() => { setSaveName(flowName); setSaveDescription(""); setSaveError(null); setSaveFlowModalOpen(true) }} style={btnSecondary}>Save flow</button>
                  <button type="button" onClick={() => setLoadFlowModalOpen(true)} style={btnSecondary}>Load flow</button>
                </div>
              </div>
            )}
          </div>

          <div style={{ border: "1px solid var(--border)", borderRadius: 8, marginBottom: "var(--space-md)", overflow: "hidden" }}>
            <button type="button" onClick={() => setSectionExpanded((s) => ({ ...s, results: !s.results }))} style={{ width: "100%", display: "flex", alignItems: "center", gap: "var(--space-sm)", padding: "var(--space-sm) var(--space-md)", background: "var(--bg-elevated)", border: "none", cursor: "pointer", fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)", textAlign: "left" }} className="hover:opacity-90">
              <span style={{ transform: sectionExpanded.results ? "rotate(90deg)" : "none", display: "inline-block" }}>▶</span>
              2. Results &amp; pattern
            </button>
            {sectionExpanded.results && (
              <div style={{ padding: "var(--space-md)", borderTop: "1px solid var(--border)" }}>
                <SiteConfigForm config={siteConfig} onChange={setSiteConfig} onlySections={["resultTable", "patternGeneration"]} />
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-sm)", marginTop: "var(--space-md)" }}>
                  <button type="button" onClick={() => { try { downloadJson("result-config.json", getResultConfigBlob()) } catch { setRetrievalResult((r) => ({ ...r, error: "Invalid config" })) } }} style={btnSecondary} title="Result table + filters + search loop only">Download result config</button>
                  <button type="button" onClick={() => { setSaveName("result-config"); setSaveDescription(""); setSaveError(null); setSaveResultConfigModalOpen(true) }} style={btnSecondary}>Save result config</button>
                  <button type="button" onClick={() => setLoadResultConfigModalOpen(true)} style={btnSecondary}>Load result config</button>
                </div>
              </div>
            )}
          </div>

          <div style={{ border: "1px solid var(--border)", borderRadius: 8, marginBottom: "var(--space-md)", overflow: "hidden" }}>
            <button type="button" onClick={() => setSectionExpanded((s) => ({ ...s, siteConfig: !s.siteConfig }))} style={{ width: "100%", display: "flex", alignItems: "center", gap: "var(--space-sm)", padding: "var(--space-sm) var(--space-md)", background: "var(--bg-elevated)", border: "none", cursor: "pointer", fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)", textAlign: "left" }} className="hover:opacity-90">
              <span style={{ transform: sectionExpanded.siteConfig ? "rotate(90deg)" : "none", display: "inline-block" }}>▶</span>
              3. Site config
            </button>
            {sectionExpanded.siteConfig && (
              <div style={{ padding: "var(--space-md)", borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", marginBottom: "var(--space-sm)" }}>
                  <label style={labelStyle}>Site config (pattern, threshold, selectors)</label>
                  <button type="button" onClick={() => setSiteConfigJsonMode((m) => !m)} style={btnSecondary}>{siteConfigJsonMode ? "Use form" : "Edit as JSON"}</button>
                </div>
                {siteConfigJsonMode ? (
                  <>
                    <textarea value={siteConfigJsonText} onChange={(e) => setSiteConfigJsonText(e.target.value)} style={{ ...inputStyle, minHeight: 220, fontFamily: "monospace", fontSize: "0.8125rem" }} />
                    <button type="button" onClick={applySiteConfigJson} style={{ ...btnSecondary, marginTop: "var(--space-sm)" }}>Apply JSON</button>
                  </>
                ) : (
                  <SiteConfigForm config={siteConfig} onChange={setSiteConfig} onlySections={["site", "iframe", "searchForm", "pagination"]} />
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-sm)", marginTop: "var(--space-md)" }}>
                  <button type="button" onClick={() => { try { downloadJson("site-config.json", siteConfigJsonMode ? JSON.parse(siteConfigJsonText) : siteConfig) } catch { setRetrievalResult((r) => ({ ...r, error: "Invalid config JSON" })) } }} style={btnSecondary}>Download site-config.json</button>
                  <button type="button" onClick={() => { setSaveName(siteConfig.siteId); setSaveDescription(""); setSaveError(null); setSaveConfigModalOpen(true) }} style={btnSecondary}>Save site config</button>
                  <button type="button" onClick={() => setLoadConfigModalOpen(true)} style={btnSecondary}>Load site config</button>
                </div>
              </div>
            )}
          </div>
        </section>

        {saveFlowModalOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: "var(--space-md)" }} onClick={() => setSaveFlowModalOpen(false)}>
            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "1px solid var(--border)", padding: "var(--space-md)", maxWidth: 400, width: "100%" }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-sm)" }}>Save superset flow</h3>
              <label style={labelStyle}>Name</label>
              <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. cobb-search" style={{ ...inputStyle, marginBottom: "var(--space-sm)" }} />
              <label style={labelStyle}>Description (optional)</label>
              <input value={saveDescription} onChange={(e) => setSaveDescription(e.target.value)} style={{ ...inputStyle, marginBottom: "var(--space-sm)" }} />
              {saveError && <p style={{ fontSize: "0.875rem", color: "var(--accent-gold)", marginBottom: "var(--space-sm)" }}>{saveError}</p>}
              <div style={{ display: "flex", gap: "var(--space-sm)" }}>
                <button type="button" onClick={handleSaveFlow} disabled={saveLoading} className="btn-primary" style={{ padding: "var(--space-xs) var(--space-sm)" }}>{saveLoading ? "Saving…" : "Save"}</button>
                <button type="button" onClick={() => { setSaveFlowModalOpen(false); setSaveError(null) }} style={btnSecondary}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {saveConfigModalOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: "var(--space-md)" }} onClick={() => setSaveConfigModalOpen(false)}>
            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "1px solid var(--border)", padding: "var(--space-md)", maxWidth: 400, width: "100%" }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-sm)" }}>Save site config</h3>
              <label style={labelStyle}>Name</label>
              <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. cobb-superior" style={{ ...inputStyle, marginBottom: "var(--space-sm)" }} />
              <label style={labelStyle}>Description (optional)</label>
              <input value={saveDescription} onChange={(e) => setSaveDescription(e.target.value)} style={{ ...inputStyle, marginBottom: "var(--space-sm)" }} />
              {saveError && <p style={{ fontSize: "0.875rem", color: "var(--accent-gold)", marginBottom: "var(--space-sm)" }}>{saveError}</p>}
              <div style={{ display: "flex", gap: "var(--space-sm)" }}>
                <button type="button" onClick={handleSaveConfig} disabled={saveLoading} className="btn-primary" style={{ padding: "var(--space-xs) var(--space-sm)" }}>{saveLoading ? "Saving…" : "Save"}</button>
                <button type="button" onClick={() => { setSaveConfigModalOpen(false); setSaveError(null) }} style={btnSecondary}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {saveResultConfigModalOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: "var(--space-md)" }} onClick={() => setSaveResultConfigModalOpen(false)}>
            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "1px solid var(--border)", padding: "var(--space-md)", maxWidth: 400, width: "100%" }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-sm)" }}>Save result config (table + filters + search loop)</h3>
              <label style={labelStyle}>Name</label>
              <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. cobb-result" style={{ ...inputStyle, marginBottom: "var(--space-sm)" }} />
              <label style={labelStyle}>Description (optional)</label>
              <input value={saveDescription} onChange={(e) => setSaveDescription(e.target.value)} style={{ ...inputStyle, marginBottom: "var(--space-sm)" }} />
              {saveError && <p style={{ fontSize: "0.875rem", color: "var(--accent-gold)", marginBottom: "var(--space-sm)" }}>{saveError}</p>}
              <div style={{ display: "flex", gap: "var(--space-sm)" }}>
                <button type="button" onClick={handleSaveResultConfig} disabled={saveLoading} className="btn-primary" style={{ padding: "var(--space-xs) var(--space-sm)" }}>{saveLoading ? "Saving…" : "Save"}</button>
                <button type="button" onClick={() => { setSaveResultConfigModalOpen(false); setSaveError(null) }} style={btnSecondary}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {saveE2EModalOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: "var(--space-md)" }} onClick={() => setSaveE2EModalOpen(false)}>
            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "1px solid var(--border)", padding: "var(--space-md)", maxWidth: 400, width: "100%" }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-sm)" }}>Save superset (e2e)</h3>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "var(--space-sm)" }}>Saves current flow and site config as one preset.</p>
              <label style={labelStyle}>Name</label>
              <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. cobb-superset" style={{ ...inputStyle, marginBottom: "var(--space-sm)" }} />
              <label style={labelStyle}>Description (optional)</label>
              <input value={saveDescription} onChange={(e) => setSaveDescription(e.target.value)} style={{ ...inputStyle, marginBottom: "var(--space-sm)" }} />
              {saveError && <p style={{ fontSize: "0.875rem", color: "var(--accent-gold)", marginBottom: "var(--space-sm)" }}>{saveError}</p>}
              <div style={{ display: "flex", gap: "var(--space-sm)" }}>
                <button type="button" onClick={handleSaveE2E} disabled={saveLoading} className="btn-primary" style={{ padding: "var(--space-xs) var(--space-sm)" }}>{saveLoading ? "Saving…" : "Save"}</button>
                <button type="button" onClick={() => { setSaveE2EModalOpen(false); setSaveError(null) }} style={btnSecondary}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {loadFlowModalOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: "var(--space-md)" }} onClick={() => { setLoadFlowModalOpen(false); setSaveError(null) }}>
            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "1px solid var(--border)", maxWidth: 480, width: "100%", maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: "var(--space-md)", borderBottom: "1px solid var(--border)" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-sm)" }}>Load superset flow</h3>
                <input type="text" value={flowSearch} onChange={(e) => setFlowSearch(e.target.value)} placeholder="Search by name…" style={inputStyle} />
                {saveError && <p style={{ fontSize: "0.875rem", color: "var(--accent-gold)", marginTop: "var(--space-sm)" }}>{saveError}</p>}
              </div>
              <div style={{ overflow: "auto", flex: 1, padding: "var(--space-sm)" }}>
                {savedFlowsLoading ? <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Loading…</p> : filteredSavedFlows.length === 0 ? <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>No saved flows</p> : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {filteredSavedFlows.map((f) => {
                      const raw = f.flow_json
                      const fj = (typeof raw === "string" ? (() => { try { return JSON.parse(raw) } catch { return null } })() : raw) as { name?: string; steps?: ScraperStep[] } | null
                      const stepsArr = Array.isArray(fj?.steps) ? fj.steps : []
                      return (
                        <li key={f.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)", marginBottom: "var(--space-xs)" }}>
                          <button type="button" onClick={() => { setFlowName((fj?.name ?? f.name) || "superset-search"); setSteps(stepsArr); setLoadFlowModalOpen(false); setFlowSearch("") }} style={{ flex: 1, padding: "var(--space-sm)", textAlign: "left", background: "none", border: "none", borderRadius: 8, cursor: "pointer", fontSize: "0.875rem", color: "var(--text-primary)" }} className="hover:bg-[var(--bg-elevated)]">
                            <span style={{ fontWeight: 500 }}>{f.name}</span>
                            {f.description && <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)" }}>{f.description}</span>}
                          </button>
                          <button type="button" onClick={() => { downloadJson(`${(f.name || "flow").replace(/\s+/g, "-")}.json`, f.flow_json) }} style={{ ...btnSecondary, padding: "var(--space-xs)", minHeight: 32 }} title="Download">↓</button>
                          <button type="button" onClick={() => handleDeleteFlow(f.id, f.name, setSavedFlowsList, savedFlowsList)} style={{ ...btnSecondary, padding: "var(--space-xs)", minHeight: 32, color: "var(--accent-gold)" }} title="Delete">✕</button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
        {loadConfigModalOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: "var(--space-md)" }} onClick={() => { setLoadConfigModalOpen(false); setSaveError(null) }}>
            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "1px solid var(--border)", maxWidth: 480, width: "100%", maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: "var(--space-md)", borderBottom: "1px solid var(--border)" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-sm)" }}>Load site config</h3>
                <input type="text" value={configSearch} onChange={(e) => setConfigSearch(e.target.value)} placeholder="Search by name…" style={inputStyle} />
                {saveError && <p style={{ fontSize: "0.875rem", color: "var(--accent-gold)", marginTop: "var(--space-sm)" }}>{saveError}</p>}
              </div>
              <div style={{ overflow: "auto", flex: 1, padding: "var(--space-sm)" }}>
                {savedConfigsLoading ? <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Loading…</p> : filteredSavedConfigs.length === 0 ? <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>No saved configs</p> : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {filteredSavedConfigs.map((f) => {
                      const raw = f.flow_json
                      const cfg = (typeof raw === "string" ? (() => { try { return JSON.parse(raw) as SiteConfigState } catch { return null } })() : raw) as SiteConfigState | null
                      return (
                        <li key={f.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)", marginBottom: "var(--space-xs)" }}>
                          <button type="button" onClick={() => { if (cfg && typeof cfg === "object") { setSiteConfig(cfg); setLoadConfigModalOpen(false); setConfigSearch("") } }} style={{ flex: 1, padding: "var(--space-sm)", textAlign: "left", background: "none", border: "none", borderRadius: 8, cursor: "pointer", fontSize: "0.875rem", color: "var(--text-primary)" }} className="hover:bg-[var(--bg-elevated)]">
                            <span style={{ fontWeight: 500 }}>{f.name}</span>
                            {f.description && <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)" }}>{f.description}</span>}
                          </button>
                          <button type="button" onClick={() => { downloadJson(`${(f.name || "site-config").replace(/\s+/g, "-")}.json`, f.flow_json) }} style={{ ...btnSecondary, padding: "var(--space-xs)", minHeight: 32 }} title="Download">↓</button>
                          <button type="button" onClick={() => handleDeleteFlow(f.id, f.name, setSavedConfigsList, savedConfigsList)} style={{ ...btnSecondary, padding: "var(--space-xs)", minHeight: 32, color: "var(--accent-gold)" }} title="Delete">✕</button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
        {loadResultConfigModalOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: "var(--space-md)" }} onClick={() => { setLoadResultConfigModalOpen(false); setSaveError(null) }}>
            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "1px solid var(--border)", maxWidth: 480, width: "100%", maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: "var(--space-md)", borderBottom: "1px solid var(--border)" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-sm)" }}>Load result config (table + filters + search loop)</h3>
                <input type="text" value={resultConfigSearch} onChange={(e) => setResultConfigSearch(e.target.value)} placeholder="Search by name…" style={inputStyle} />
                {saveError && <p style={{ fontSize: "0.875rem", color: "var(--accent-gold)", marginTop: "var(--space-sm)" }}>{saveError}</p>}
              </div>
              <div style={{ overflow: "auto", flex: 1, padding: "var(--space-sm)" }}>
                {savedResultConfigsLoading ? <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Loading…</p> : filteredSavedResultConfigs.length === 0 ? <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>No saved result configs</p> : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {filteredSavedResultConfigs.map((f) => {
                      const raw = f.flow_json
                      const blob = (typeof raw === "string" ? (() => { try { return JSON.parse(raw) } catch { return null } })() : raw) as { resultTable?: SiteConfigState["resultTable"]; patternGeneration?: SiteConfigState["patternGeneration"] } | null
                      return (
                        <li key={f.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)", marginBottom: "var(--space-xs)" }}>
                          <button type="button" onClick={() => { if (blob && typeof blob === "object") { setSiteConfig((prev) => ({ ...prev, resultTable: blob.resultTable ?? prev.resultTable, patternGeneration: blob.patternGeneration ?? prev.patternGeneration })); setLoadResultConfigModalOpen(false); setResultConfigSearch("") } }} style={{ flex: 1, padding: "var(--space-sm)", textAlign: "left", background: "none", border: "none", borderRadius: 8, cursor: "pointer", fontSize: "0.875rem", color: "var(--text-primary)" }} className="hover:bg-[var(--bg-elevated)]">
                            <span style={{ fontWeight: 500 }}>{f.name}</span>
                            {f.description && <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)" }}>{f.description}</span>}
                          </button>
                          <button type="button" onClick={() => downloadJson(`${(f.name || "result-config").replace(/\s+/g, "-")}.json`, f.flow_json)} style={{ ...btnSecondary, padding: "var(--space-xs)", minHeight: 32 }} title="Download">↓</button>
                          <button type="button" onClick={() => handleDeleteFlow(f.id, f.name, setSavedResultConfigsList, savedResultConfigsList)} style={{ ...btnSecondary, padding: "var(--space-xs)", minHeight: 32, color: "var(--accent-gold)" }} title="Delete">✕</button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
        {loadE2EModalOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: "var(--space-md)" }} onClick={() => { setLoadE2EModalOpen(false); setSaveError(null) }}>
            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "1px solid var(--border)", maxWidth: 480, width: "100%", maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: "var(--space-md)", borderBottom: "1px solid var(--border)" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-sm)" }}>Load superset (e2e)</h3>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "var(--space-sm)" }}>Load a full preset: flow + site config.</p>
                <input type="text" value={e2ESearch} onChange={(e) => setE2ESearch(e.target.value)} placeholder="Search by name…" style={inputStyle} />
                {saveError && <p style={{ fontSize: "0.875rem", color: "var(--accent-gold)", marginTop: "var(--space-sm)" }}>{saveError}</p>}
              </div>
              <div style={{ overflow: "auto", flex: 1, padding: "var(--space-sm)" }}>
                {savedE2ELoading ? <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Loading…</p> : filteredSavedE2E.length === 0 ? <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>No saved supersets</p> : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {filteredSavedE2E.map((f) => {
                      const raw = f.flow_json
                      const e2e = (typeof raw === "string" ? (() => { try { return JSON.parse(raw) } catch { return null } })() : raw) as { flow?: { name?: string; steps?: ScraperStep[] }; siteConfig?: SiteConfigState } | null
                      const flowPart = e2e?.flow
                      const name = flowPart?.name ?? f.name
                      const stepsArr = Array.isArray(flowPart?.steps) ? flowPart.steps : []
                      const cfg = e2e?.siteConfig
                      return (
                        <li key={f.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)", marginBottom: "var(--space-xs)" }}>
                          <button type="button" onClick={() => { setFlowName(name ?? "superset-search"); setSteps(stepsArr); if (cfg && typeof cfg === "object") setSiteConfig(cfg); setLoadE2EModalOpen(false); setE2ESearch("") }} style={{ flex: 1, padding: "var(--space-sm)", textAlign: "left", background: "none", border: "none", borderRadius: 8, cursor: "pointer", fontSize: "0.875rem", color: "var(--text-primary)" }} className="hover:bg-[var(--bg-elevated)]">
                            <span style={{ fontWeight: 500 }}>{f.name}</span>
                            {f.description && <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)" }}>{f.description}</span>}
                          </button>
                          <button type="button" onClick={() => downloadJson(`${(f.name || "superset-e2e").replace(/\s+/g, "-")}.json`, f.flow_json)} style={{ ...btnSecondary, padding: "var(--space-xs)", minHeight: 32 }} title="Download">↓</button>
                          <button type="button" onClick={() => handleDeleteFlow(f.id, f.name, setSavedE2EList, savedE2EList)} style={{ ...btnSecondary, padding: "var(--space-xs)", minHeight: 32, color: "var(--accent-gold)" }} title="Delete">✕</button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        <section style={{ padding: "var(--space-md)", borderRadius: "12px", background: "var(--bg-card)", border: "1px solid var(--border)", marginBottom: "var(--space-lg)" }}>
          <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "var(--space-md)" }}>2. Retrieval with ids (Phase 2)</h2>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "var(--space-md)" }}>
            Use an <strong>existing retrieval flow</strong> that starts with <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>for_each_id</code> (idsVar: &quot;ids&quot;). Pass a list of ids from a superset file or paste a JSON array. Metadata and PDF screenshots are stored in the DB.
          </p>
          <label style={labelStyle}>Ids (from superset file or paste JSON array)</label>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-xs)", flexWrap: "wrap" }}>
            <input type="file" accept=".json,application/json" onChange={handleSupersetFile} />
            <button
              type="button"
              onClick={() => {
                setIdsInput(quickTestIds)
                setRetrievalFlowJson(quickTestRetrievalFlow)
                setRetrievalResult(null)
              }}
              style={btnSecondary}
            >
              Fill quick test (example.com)
            </button>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Upload superset JSON (uses .ids) or paste below</span>
          </div>
          <textarea
            value={idsInput}
            onChange={(e) => setIdsInput(e.target.value)}
            placeholder='["id1", "id2", "id3"]'
            style={{ ...inputStyle, minHeight: 80, fontFamily: "monospace", fontSize: "0.8125rem" }}
          />
          <label style={{ ...labelStyle, marginTop: "var(--space-md)" }}>Retrieval flow (must have for_each_id with idsVar: &quot;ids&quot;)</label>
          <textarea
            value={retrievalFlowJson}
            onChange={(e) => setRetrievalFlowJson(e.target.value)}
            style={{ ...inputStyle, minHeight: 180, fontFamily: "monospace", fontSize: "0.8125rem" }}
          />
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "var(--space-xs)" }}>
            Use <code>{`{{current_id}}`}</code> in steps (e.g. navigate URL). Build this flow in <Link href="/admin/scrape" style={{ color: "var(--accent-muted)" }}>Scraper</Link> and paste here, or paste a saved flow.json.
          </p>
          <button
            type="button"
            onClick={handleRunRetrieval}
            disabled={retrievalLoading || !sessionReady}
            className="btn-primary"
            style={{ marginTop: "var(--space-sm)", padding: "var(--space-xs) var(--space-md)" }}
          >
            {retrievalLoading ? "Running…" : "Run retrieval (API)"}
          </button>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "var(--space-sm)" }}>
            Runs headless via API. For a visible browser (e.g. login), run: <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>npx tsx scripts/run-scraper-headed.ts flow.json --ids-file superset.json</code>.
          </p>
          {retrievalResult && (
            <div style={{ marginTop: "var(--space-md)", padding: "var(--space-sm)", background: "var(--bg-elevated)", borderRadius: "8px" }}>
              {retrievalResult.error ? (
                <p style={{ color: "var(--accent-gold)" }}>{retrievalResult.error}</p>
              ) : (
                <p style={{ fontSize: "0.875rem" }}>
                  Job: <code style={{ background: "var(--bg-primary)", padding: "2px 6px", borderRadius: 4 }}>{retrievalResult.jobId}</code>
                  {retrievalResult.rowsStored != null && ` · Rows: ${retrievalResult.rowsStored}`}
                  {retrievalResult.pdfDocumentsStored != null && ` · PDFs: ${retrievalResult.pdfDocumentsStored}`}
                </p>
              )}
              {retrievalResult.logs?.length ? (
                <details style={{ marginTop: "var(--space-sm)" }}>
                  <summary style={{ cursor: "pointer", fontSize: "0.8125rem" }}>Logs</summary>
                  <pre style={{ marginTop: "var(--space-xs)", fontSize: "0.75rem", overflow: "auto", maxHeight: 200 }}>{retrievalResult.logs.join("\n")}</pre>
                </details>
              ) : null}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
