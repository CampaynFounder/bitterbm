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
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0)
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
    setExpandedIndex(at)
    setInsertAt(null)
  }

  const removeStep = (index: number) => {
    const next = steps.filter((_, i) => i !== index)
    onStepsChange(next)
    if (expandedIndex !== null && expandedIndex >= next.length) setExpandedIndex(Math.max(0, next.length - 1))
  }

  const moveStep = (index: number, dir: "up" | "down") => {
    const next = [...steps]
    const j = dir === "up" ? index - 1 : index + 1
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    onStepsChange(next)
    setExpandedIndex(j)
  }

  const duplicateStep = (index: number) => {
    const next = [...steps]
    next.splice(index + 1, 0, { ...steps[index] })
    onStepsChange(next)
    setExpandedIndex(index + 1)
  }

  return (
    <div>
      <div style={{ marginBottom: "var(--space-md)" }}>
        <label style={labelStyle}>Flow name</label>
        <input value={flowName} onChange={(e) => onFlowNameChange(e.target.value)} placeholder="superset-search" style={{ ...inputStyle, maxWidth: 320 }} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
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
            expanded={expandedIndex === index}
            onToggle={() => setExpandedIndex((i) => (i === index ? null : index))}
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

  return (
    <div style={{ borderRadius: 12, background: "var(--bg-elevated)", border: "1px solid var(--border)", marginBottom: "var(--space-md)", overflow: "hidden" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "var(--space-sm)", padding: "var(--space-md)", cursor: "pointer" }} onClick={onToggle}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", flex: 1, minWidth: 0 }}>
          <span style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block" }}>▶</span>
          <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{index + 1}. {typeLabel}</span>
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

// ——— Visual site config form ———
function SiteConfigForm({ config, onChange }: { config: SiteConfigState; onChange: (c: SiteConfigState) => void }) {
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
      {section("Site", (
        <>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Site ID</label><input value={config.siteId} onChange={(e) => update("siteId", e.target.value)} style={inputStyle} /></div>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Base URL</label><input value={config.baseUrl} onChange={(e) => update("baseUrl", e.target.value)} placeholder="https://..." style={inputStyle} /></div>
          <div><label style={labelStyle}>Description (optional)</label><input value={config.description ?? ""} onChange={(e) => update("description", e.target.value)} style={inputStyle} /></div>
        </>
      ))}
      {section("Iframe", (
        <>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Selector</label><input value={config.iframe.selector ?? ""} onChange={(e) => update("iframe.selector", e.target.value)} placeholder="iframe#content" style={inputStyle} /></div>
          <div><label style={labelStyle}>URL contains (optional)</label><input value={config.iframe.urlContains ?? ""} onChange={(e) => update("iframe.urlContains", e.target.value)} style={inputStyle} /></div>
        </>
      ))}
      {section("Search form", (
        <>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Pattern field selector</label><input value={config.searchForm.patternField.selector} onChange={(e) => update("searchForm.patternField.selector", e.target.value)} placeholder="#tbPersonSearch" style={inputStyle} /></div>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Pattern field type</label><select value={config.searchForm.patternField.type} onChange={(e) => update("searchForm.patternField.type", e.target.value)} style={inputStyle}><option value="text">text</option></select></div>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Wildcard character</label><input value={config.searchForm.wildcard} onChange={(e) => update("searchForm.wildcard", e.target.value)} placeholder="%" style={{ ...inputStyle, maxWidth: 80 }} /></div>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Min non-wildcard chars</label><input type="number" value={config.searchForm.minNonWildcardChars} onChange={(e) => update("searchForm.minNonWildcardChars", parseInt(e.target.value, 10) || 0)} style={{ ...inputStyle, maxWidth: 100 }} /></div>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-sm)" }}><input type="checkbox" checked={config.searchForm.caseSensitive} onChange={(e) => update("searchForm.caseSensitive", e.target.checked)} />Case sensitive</label>
          <div><label style={labelStyle}>Submit button selector</label><input value={config.searchForm.submitSelector} onChange={(e) => update("searchForm.submitSelector", e.target.value)} placeholder="#btnSearch" style={inputStyle} /></div>
        </>
      ))}
      {section("Pattern generation", (
        <>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Alphabet</label><input value={config.patternGeneration.alphabet} onChange={(e) => update("patternGeneration.alphabet", e.target.value)} style={inputStyle} /></div>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Length</label><input type="number" value={config.patternGeneration.length} onChange={(e) => update("patternGeneration.length", parseInt(e.target.value, 10) || 3)} style={{ ...inputStyle, maxWidth: 80 }} /></div>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-sm)" }}><input type="checkbox" checked={config.patternGeneration.useWildcard} onChange={(e) => update("patternGeneration.useWildcard", e.target.checked)} />Use wildcard</label>
          <div><label style={labelStyle}>Wildcard character</label><input value={config.patternGeneration.wildcardChar} onChange={(e) => update("patternGeneration.wildcardChar", e.target.value)} style={{ ...inputStyle, maxWidth: 80 }} /></div>
        </>
      ))}
      {section("Result table", (
        <>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Table selector</label><input value={config.resultTable.tableSelector} onChange={(e) => update("resultTable.tableSelector", e.target.value)} placeholder="table#gvResults" style={inputStyle} /></div>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Row selector</label><input value={config.resultTable.rowSelector} onChange={(e) => update("resultTable.rowSelector", e.target.value)} placeholder="tbody tr" style={inputStyle} /></div>
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Primary ID source</label><select value={config.resultTable.primaryId.source} onChange={(e) => update("resultTable.primaryId.source", e.target.value as "column" | "link")} style={inputStyle}><option value="column">column</option><option value="link">link</option></select></div>
          {config.resultTable.primaryId.source === "column" && <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Column index (0-based)</label><input type="number" value={config.resultTable.primaryId.columnIndex ?? 0} onChange={(e) => update("resultTable.primaryId.columnIndex", parseInt(e.target.value, 10) || 0)} style={{ ...inputStyle, maxWidth: 100 }} /></div>}
          {config.resultTable.primaryId.source === "link" && (<><div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Link selector</label><input value={config.resultTable.primaryId.linkSelector ?? ""} onChange={(e) => update("resultTable.primaryId.linkSelector", e.target.value)} style={inputStyle} /></div><div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Link attribute</label><input value={config.resultTable.primaryId.linkAttribute ?? "href"} onChange={(e) => update("resultTable.primaryId.linkAttribute", e.target.value)} style={inputStyle} /></div></>)}
          <div style={{ marginBottom: "var(--space-sm)" }}><label style={labelStyle}>Threshold (min rows)</label><input type="number" value={config.resultTable.threshold} onChange={(e) => update("resultTable.threshold", parseInt(e.target.value, 10) || 5)} style={{ ...inputStyle, maxWidth: 100 }} /></div>
        </>
      ))}
      {section("Pagination", (
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

  const [savedFlowsList, setSavedFlowsList] = useState<{ id: string; name: string; description?: string; flow_json: unknown }[]>([])
  const [savedConfigsList, setSavedConfigsList] = useState<{ id: string; name: string; description?: string; flow_json: unknown }[]>([])
  const [loadFlowModalOpen, setLoadFlowModalOpen] = useState(false)
  const [loadConfigModalOpen, setLoadConfigModalOpen] = useState(false)
  const [saveFlowModalOpen, setSaveFlowModalOpen] = useState(false)
  const [saveConfigModalOpen, setSaveConfigModalOpen] = useState(false)
  const [saveName, setSaveName] = useState("")
  const [saveDescription, setSaveDescription] = useState("")
  const [flowSearch, setFlowSearch] = useState("")
  const [configSearch, setConfigSearch] = useState("")
  const [savedFlowsLoading, setSavedFlowsLoading] = useState(false)
  const [savedConfigsLoading, setSavedConfigsLoading] = useState(false)
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

  const filteredSavedFlows = flowSearch.trim()
    ? savedFlowsList.filter((f) => (f.name ?? "").toLowerCase().includes(flowSearch.trim().toLowerCase()) || (f.description ?? "").toLowerCase().includes(flowSearch.trim().toLowerCase()))
    : savedFlowsList
  const filteredSavedConfigs = configSearch.trim()
    ? savedConfigsList.filter((f) => (f.name ?? "").toLowerCase().includes(configSearch.trim().toLowerCase()) || (f.description ?? "").toLowerCase().includes(configSearch.trim().toLowerCase()))
    : savedConfigsList

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

          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", marginBottom: "var(--space-sm)" }}>
            <label style={labelStyle}>Superset flow (one search)</label>
            <button type="button" onClick={() => setFlowJsonMode((m) => !m)} style={btnSecondary}>
              {flowJsonMode ? "Use visual editor" : "Edit as JSON"}
            </button>
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
            <button type="button" onClick={() => { try { downloadJson("superset-flow.json", flowJsonMode ? JSON.parse(flowJsonText) : { name: flowName, steps }) } catch { setRetrievalResult((r) => ({ ...r, error: "Invalid flow JSON" })) } }} style={btnSecondary}>
              Download flow.json
            </button>
            <button type="button" onClick={() => { setSaveName(flowName); setSaveDescription(""); setSaveError(null); setSaveFlowModalOpen(true) }} style={btnSecondary}>
              Save flow
            </button>
            <button type="button" onClick={() => setLoadFlowModalOpen(true)} style={btnSecondary}>
              Load flow
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", marginTop: "var(--space-lg)", marginBottom: "var(--space-sm)" }}>
            <label style={labelStyle}>Site config (pattern, threshold, selectors)</label>
            <button type="button" onClick={() => setSiteConfigJsonMode((m) => !m)} style={btnSecondary}>
              {siteConfigJsonMode ? "Use form" : "Edit as JSON"}
            </button>
          </div>
          {siteConfigJsonMode ? (
            <>
              <textarea value={siteConfigJsonText} onChange={(e) => setSiteConfigJsonText(e.target.value)} style={{ ...inputStyle, minHeight: 220, fontFamily: "monospace", fontSize: "0.8125rem" }} />
              <button type="button" onClick={applySiteConfigJson} style={{ ...btnSecondary, marginTop: "var(--space-sm)" }}>Apply JSON</button>
            </>
          ) : (
            <SiteConfigForm config={siteConfig} onChange={setSiteConfig} />
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-sm)", marginTop: "var(--space-md)" }}>
            <button type="button" onClick={() => { try { downloadJson("site-config.json", siteConfigJsonMode ? JSON.parse(siteConfigJsonText) : siteConfig) } catch { setRetrievalResult((r) => ({ ...r, error: "Invalid config JSON" })) } }} style={btnSecondary}>
              Download site-config.json
            </button>
            <button type="button" onClick={() => { setSaveName(siteConfig.siteId); setSaveDescription(""); setSaveError(null); setSaveConfigModalOpen(true) }} style={btnSecondary}>
              Save site config
            </button>
            <button type="button" onClick={() => setLoadConfigModalOpen(true)} style={btnSecondary}>
              Load site config
            </button>
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
        {loadFlowModalOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: "var(--space-md)" }} onClick={() => setLoadFlowModalOpen(false)}>
            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "1px solid var(--border)", maxWidth: 480, width: "100%", maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: "var(--space-md)", borderBottom: "1px solid var(--border)" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-sm)" }}>Load superset flow</h3>
                <input type="text" value={flowSearch} onChange={(e) => setFlowSearch(e.target.value)} placeholder="Search by name…" style={inputStyle} />
              </div>
              <div style={{ overflow: "auto", flex: 1, padding: "var(--space-sm)" }}>
                {savedFlowsLoading ? <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Loading…</p> : filteredSavedFlows.length === 0 ? <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>No saved flows</p> : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {filteredSavedFlows.map((f) => {
                      const fj = f.flow_json as { name?: string; steps?: ScraperStep[] }
                      return (
                        <li key={f.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)", marginBottom: "var(--space-xs)" }}>
                          <button type="button" onClick={() => { if (fj?.steps?.length) { setFlowName(fj.name ?? f.name); setSteps(fj.steps); setLoadFlowModalOpen(false); setFlowSearch("") } }} style={{ flex: 1, padding: "var(--space-sm)", textAlign: "left", background: "none", border: "none", borderRadius: 8, cursor: "pointer", fontSize: "0.875rem", color: "var(--text-primary)" }} className="hover:bg-[var(--bg-elevated)]">
                            <span style={{ fontWeight: 500 }}>{f.name}</span>
                            {f.description && <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)" }}>{f.description}</span>}
                          </button>
                          <button type="button" onClick={() => { downloadJson(`${(f.name || "flow").replace(/\s+/g, "-")}.json`, f.flow_json) }} style={{ ...btnSecondary, padding: "var(--space-xs)", minHeight: 32 }} title="Download">↓</button>
                          <button type="button" onClick={async () => { if (!confirm(`Delete "${f.name}"?`)) return; try { const res = await fetch("/api/admin/scraper/flows", { method: "DELETE", headers: authHeaders(), body: JSON.stringify({ id: f.id }) }); if (!res.ok) throw new Error(); setSavedFlowsList((list) => list.filter((x) => x.id !== f.id)) } catch { setSaveError("Delete failed") } }} style={{ ...btnSecondary, padding: "var(--space-xs)", minHeight: 32, color: "var(--accent-gold)" }} title="Delete">✕</button>
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
          <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: "var(--space-md)" }} onClick={() => setLoadConfigModalOpen(false)}>
            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "1px solid var(--border)", maxWidth: 480, width: "100%", maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: "var(--space-md)", borderBottom: "1px solid var(--border)" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-sm)" }}>Load site config</h3>
                <input type="text" value={configSearch} onChange={(e) => setConfigSearch(e.target.value)} placeholder="Search by name…" style={inputStyle} />
              </div>
              <div style={{ overflow: "auto", flex: 1, padding: "var(--space-sm)" }}>
                {savedConfigsLoading ? <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Loading…</p> : filteredSavedConfigs.length === 0 ? <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>No saved configs</p> : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {filteredSavedConfigs.map((f) => {
                      const cfg = f.flow_json as SiteConfigState
                      return (
                        <li key={f.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)", marginBottom: "var(--space-xs)" }}>
                          <button type="button" onClick={() => { if (cfg) { setSiteConfig(cfg); setLoadConfigModalOpen(false); setConfigSearch("") } }} style={{ flex: 1, padding: "var(--space-sm)", textAlign: "left", background: "none", border: "none", borderRadius: 8, cursor: "pointer", fontSize: "0.875rem", color: "var(--text-primary)" }} className="hover:bg-[var(--bg-elevated)]">
                            <span style={{ fontWeight: 500 }}>{f.name}</span>
                            {f.description && <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)" }}>{f.description}</span>}
                          </button>
                          <button type="button" onClick={() => { downloadJson(`${(f.name || "site-config").replace(/\s+/g, "-")}.json`, f.flow_json) }} style={{ ...btnSecondary, padding: "var(--space-xs)", minHeight: 32 }} title="Download">↓</button>
                          <button type="button" onClick={async () => { if (!confirm(`Delete "${f.name}"?`)) return; try { const res = await fetch("/api/admin/scraper/flows", { method: "DELETE", headers: authHeaders(), body: JSON.stringify({ id: f.id }) }); if (!res.ok) throw new Error(); setSavedConfigsList((list) => list.filter((x) => x.id !== f.id)) } catch { setSaveError("Delete failed") } }} style={{ ...btnSecondary, padding: "var(--space-xs)", minHeight: 32, color: "var(--accent-gold)" }} title="Delete">✕</button>
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
