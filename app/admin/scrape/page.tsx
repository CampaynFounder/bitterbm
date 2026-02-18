"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { ScraperFlow, ScraperStep } from "@/lib/scraper/types"

const STEP_TYPES: { value: string; label: string }[] = [
  { value: "navigate", label: "Go to URL" },
  { value: "pause_for_login", label: "Pause for login" },
  { value: "switch_frame", label: "Switch to iframe" },
  { value: "switch_frame_main", label: "Switch to main page" },
  { value: "wait", label: "Wait for element" },
  { value: "fill_field", label: "Fill text field" },
  { value: "date_range", label: "Set date range" },
  { value: "select_dropdown", label: "Select dropdown" },
  { value: "checkbox", label: "Check / uncheck box" },
  { value: "click", label: "Click" },
  { value: "for_each_option", label: "For each filter option" },
  { value: "for_each_result", label: "For each result row" },
  { value: "condition_group", label: "Filter row (condition group)" },
  { value: "extract_field", label: "Extract field" },
  { value: "extract_link", label: "Extract link" },
  { value: "extract_pdf_url", label: "Extract PDF URL (appends to pdf_urls)" },
  { value: "extract_to_memory", label: "Extract to memory (state, county)" },
  { value: "extract_text", label: "Extract text content" },
  { value: "extract_pdf", label: "Download PDF → Supabase storage" },
  { value: "store_memory", label: "Copy memory to row (state, county)" },
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
    case "switch_frame":
      return { ...base, type: "switch_frame", config: { selector: "iframe[name=\"main\"]" } }
    case "switch_frame_main":
      return { ...base, type: "switch_frame_main", config: {} }
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
    case "condition_group":
      return { ...base, type: "condition_group", config: { fieldId: "", operator: "not_empty" } }
    case "extract_to_memory":
      return { ...base, type: "extract_to_memory", config: { source: "row", key: "state", memoryKey: "state" } }
    case "extract_pdf":
      return { ...base, type: "extract_pdf", config: { fieldId: "pdf_urls", uploadToStorage: true, screenshot: false } }
    case "store_memory":
      return { ...base, type: "store_memory", config: { keys: ["state", "county"] } }
    case "extract_field":
      return { ...base, type: "extract_field", config: { fieldId: "", selector: "", attr: "text" } }
    case "extract_link":
      return { ...base, type: "extract_link", config: { fieldId: "", selector: "", makeAbsolute: true } }
    case "extract_pdf_url":
      return { ...base, type: "extract_pdf_url", config: { selector: "", fieldId: "pdf_urls", makeAbsolute: true } }
    case "extract_text":
      return { ...base, type: "extract_text", config: { fieldId: "text_content", selector: "" } }
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
  minHeight: 44,
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
        {step.type === "switch_frame" && (
          <>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "var(--space-sm)" }}>
              Use one: CSS selector (preferred), frame name, or URL partial match.
            </p>
            <div>
              <label style={labelStyle}>iframe CSS selector</label>
              <input
                value={String(cfg.selector ?? "")}
                onChange={(e) => update("selector", e.target.value)}
                placeholder='iframe[name="main"], iframe#content'
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Or frame name</label>
              <input
                value={String(cfg.name ?? "")}
                onChange={(e) => update("name", e.target.value)}
                placeholder='main'
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Or frame URL (partial match)</label>
              <input
                value={String(cfg.url ?? "")}
                onChange={(e) => update("url", e.target.value)}
                placeholder="Main.aspx"
                style={inputStyle}
              />
            </div>
          </>
        )}
        {step.type === "switch_frame_main" && (
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
            Switches back to the top-level document. Use after extracting from a frame.
          </p>
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
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "var(--space-xs)" }}>
                Leave empty to wait a fixed time (use Timeout below).
              </p>
            </div>
            <div>
              <label style={labelStyle}>Wait until</label>
              <select
                value={String(cfg.waitUntil ?? "visible")}
                onChange={(e) => update("waitUntil", e.target.value)}
                style={inputStyle}
              >
                <option value="visible">Visible</option>
                <option value="hidden">Hidden</option>
                <option value="attached">Attached</option>
              </select>
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
            <div>
              <label style={labelStyle}>Method</label>
              <select
                value={String(cfg.method ?? "fill")}
                onChange={(e) => update("method", e.target.value)}
                style={inputStyle}
              >
                <option value="fill">Fill (fast)</option>
                <option value="type">Type (simulates keystrokes)</option>
              </select>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", fontSize: "0.875rem" }}>
              <input
                type="checkbox"
                checked={!!cfg.clearFirst}
                onChange={(e) => update("clearFirst", e.target.checked)}
              />
              Clear first
            </label>
            {cfg.method === "type" && (
              <div>
                <label style={labelStyle}>Type delay (ms) - keystroke interval</label>
                <input
                  type="number"
                  value={Number(cfg.typeDelay ?? 50)}
                  onChange={(e) => update("typeDelay", parseInt(e.target.value, 10) || 50)}
                  min={0}
                  style={inputStyle}
                />
              </div>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", fontSize: "0.875rem" }}>
              <input
                type="checkbox"
                checked={!!cfg.pressEnter}
                onChange={(e) => update("pressEnter", e.target.checked)}
              />
              Press Enter after fill
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
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", fontSize: "0.875rem" }}>
              <input
                type="checkbox"
                checked={cfg.scrollIntoView !== false}
                onChange={(e) => update("scrollIntoView", e.target.checked)}
              />
              Scroll into view before click
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", fontSize: "0.875rem" }}>
              <input
                type="checkbox"
                checked={!!cfg.force}
                onChange={(e) => update("force", e.target.checked)}
              />
              Force click
            </label>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Uncheck scroll if element is already visible. Use force click when visibility check times out in frames.
            </p>
            <div>
              <label style={labelStyle}>Wait after (ms)</label>
              <input
                type="number"
                value={Number(cfg.waitAfter ?? 1000)}
                onChange={(e) => update("waitAfter", parseInt(e.target.value, 10) || 0)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Wait for selector (optional)</label>
              <input
                value={String(cfg.waitForSelector ?? "")}
                onChange={(e) => update("waitForSelector", e.target.value)}
                placeholder=".results-loaded, #content"
                style={inputStyle}
              />
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "var(--space-xs)" }}>
                After click, wait for this element before continuing.
              </p>
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
            <div>
              <label style={labelStyle}>Output value var (optional)</label>
              <input
                value={String(cfg.outputValueVar ?? "")}
                onChange={(e) => update("outputValueVar", e.target.value)}
                placeholder="current_option_value"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Output text var (optional)</label>
              <input
                value={String(cfg.outputTextVar ?? "")}
                onChange={(e) => update("outputTextVar", e.target.value)}
                placeholder="current_option_text"
                style={inputStyle}
              />
            </div>
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
                <option value="value">Input value</option>
              </select>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", fontSize: "0.875rem" }}>
              <input
                type="checkbox"
                checked={!!cfg.required}
                onChange={(e) => update("required", e.target.checked)}
              />
              Required (fail if not found)
            </label>
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
        {step.type === "extract_pdf_url" && (
          <>
            <div>
              <label style={labelStyle}>PDF link selector</label>
              <input
                value={String(cfg.selector ?? "")}
                onChange={(e) => update("selector", e.target.value)}
                placeholder="a[href$='.pdf'], .pdf-link"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Target field (default pdf_urls)</label>
              <input
                value={String(cfg.fieldId ?? "pdf_urls")}
                onChange={(e) => update("fieldId", e.target.value)}
                placeholder="pdf_urls"
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
        {step.type === "condition_group" && (
          <>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "var(--space-sm)" }}>
              Skip remaining steps for this row if condition fails. Use for simple flows: filter → extract PDF.
            </p>
            <div>
              <label style={labelStyle}>Field to check</label>
              <input
                value={String(cfg.fieldId ?? "")}
                onChange={(e) => update("fieldId", e.target.value)}
                placeholder="case_type, pdf_urls"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Operator</label>
              <select
                value={String(cfg.operator ?? "not_empty")}
                onChange={(e) => update("operator", e.target.value)}
                style={inputStyle}
              >
                <option value="not_empty">Not empty</option>
                <option value="equals">Equals</option>
                <option value="contains">Contains</option>
                <option value="matches">Matches regex</option>
                <option value="in">In list</option>
              </select>
            </div>
            {cfg.operator && !["not_empty"].includes(String(cfg.operator)) && (
              <div>
                <label style={labelStyle}>Value (for equals/contains) or regex (for matches)</label>
                <input
                  value={String(cfg.value ?? cfg.pattern ?? "")}
                  onChange={(e) =>
                    cfg.operator === "matches"
                      ? update("pattern", e.target.value)
                      : update("value", e.target.value)
                  }
                  placeholder={cfg.operator === "matches" ? "\\d{4}" : "value"}
                  style={inputStyle}
                />
              </div>
            )}
          </>
        )}
        {step.type === "extract_to_memory" && (
          <>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "var(--space-sm)" }}>
              Store state, county, or other values from row/vars into memory for later rows.
            </p>
            <div>
              <label style={labelStyle}>Source</label>
              <select
                value={String(cfg.source ?? "row")}
                onChange={(e) => update("source", e.target.value)}
                style={inputStyle}
              >
                <option value="row">From row</option>
                <option value="vars">From vars</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Key to read</label>
              <input
                value={String(cfg.key ?? "")}
                onChange={(e) => update("key", e.target.value)}
                placeholder="state, county"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Memory key (optional)</label>
              <input
                value={String(cfg.memoryKey ?? "")}
                onChange={(e) => update("memoryKey", e.target.value)}
                placeholder="Same as key if empty"
                style={inputStyle}
              />
            </div>
          </>
        )}
        {step.type === "store_memory" && (
          <>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "var(--space-sm)" }}>
              Copy memory (state, county) into row before store_row.
            </p>
            <div>
              <label style={labelStyle}>Keys to copy (comma-separated)</label>
              <input
                value={Array.isArray(cfg.keys) ? cfg.keys.join(", ") : "state, county"}
                onChange={(e) =>
                  update(
                    "keys",
                    e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
                placeholder="state, county"
                style={inputStyle}
              />
            </div>
          </>
        )}
        {step.type === "extract_pdf" && (
          <>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "var(--space-sm)" }}>
              Download PDF, upload to Supabase scraped-pdfs bucket, insert into pdf_documents (state/county for RAG).
            </p>
            <div>
              <label style={labelStyle}>URL from row field (or use selector)</label>
              <input
                value={String(cfg.fieldId ?? "")}
                onChange={(e) => update("fieldId", e.target.value)}
                placeholder="pdf_urls, pdf_url"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Or PDF link selector</label>
              <input
                value={String(cfg.selector ?? "")}
                onChange={(e) => update("selector", e.target.value)}
                placeholder="a[href$='.pdf']"
                style={inputStyle}
              />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", fontSize: "0.875rem" }}>
              <input
                type="checkbox"
                checked={cfg.uploadToStorage !== false}
                onChange={(e) => update("uploadToStorage", e.target.checked)}
              />
              Upload to Supabase storage
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", fontSize: "0.875rem" }}>
              <input
                type="checkbox"
                checked={!!cfg.screenshot}
                onChange={(e) => update("screenshot", e.target.checked)}
              />
              Take screenshot of PDF
            </label>
          </>
        )}
        {step.type === "extract_text" && (
          <>
            <div>
              <label style={labelStyle}>Field name</label>
              <input
                value={String(cfg.fieldId ?? "")}
                onChange={(e) => update("fieldId", e.target.value)}
                placeholder="text_content, transcript_summary"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Selector (omit for full page)</label>
              <input
                value={String(cfg.selector ?? "")}
                onChange={(e) => update("selector", e.target.value)}
                placeholder=".transcript-body, main"
                style={inputStyle}
              />
            </div>
          </>
        )}
        {step.type === "store_row" && (
          <>
            <div>
              <label style={labelStyle}>Source site name</label>
              <input
                value={String(cfg.sourceSite ?? "")}
                onChange={(e) => update("sourceSite", e.target.value)}
                placeholder="example-court"
                style={inputStyle}
              />
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "var(--space-sm)" }}>
              Use extract_field with fieldId: state, county, court, judge, attorney, gal, case_number, case_name; extract_pdf_url for pdf_urls; extract_text for text_content.
            </p>
          </>
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
              <label style={labelStyle}>Stop when</label>
              <select
                value={String(cfg.stopWhen ?? "disabled")}
                onChange={(e) => update("stopWhen", e.target.value)}
                style={inputStyle}
              >
                <option value="disabled">Next button disabled</option>
                <option value="missing">Next button missing</option>
              </select>
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
  const [flowId, setFlowId] = useState<string | null>(null)
  const [flowName, setFlowName] = useState("Court Records Search")
  const [flowDescription, setFlowDescription] = useState("")
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
    { key: "state", value: "" },
    { key: "county", value: "" },
  ])
  const [adminSecret, setAdminSecret] = useState(() => {
    if (typeof window === "undefined") return ""
    return sessionStorage.getItem("scraper_admin_secret") ?? ""
  })
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{
    jobId?: string
    rowsStored?: number
    pdfDocumentsStored?: number
    error?: string
    logs?: string[]
    dryRun?: boolean
    previewRows?: Record<string, unknown>[]
    stoppedAt?: number
    pageUrl?: string
  } | null>(null)
  const [runUpToStep, setRunUpToStep] = useState<number | "">("")
  const [showJson, setShowJson] = useState(false)
  const [loadModalOpen, setLoadModalOpen] = useState(false)
  const [loadSearch, setLoadSearch] = useState("")
  const [flowsList, setFlowsList] = useState<{ id: string; name: string; description?: string; flow_json: { flow?: { name: string; steps: ScraperStep[] }; vars?: Record<string, string | number> } }[]>([])
  const [flowsLoading, setFlowsLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [importPaste, setImportPaste] = useState("")
  const [showImportModal, setShowImportModal] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [sessionReady, setSessionReady] = useState(false)
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
    const hasGeo = varsList.some((v) => v.key.trim() === "state" || v.key.trim() === "county")
    return {
      name: flowName,
      version: "1.0",
      steps,
      geographic: hasGeo ? { fromVars: true } : undefined,
    }
  }

  function buildVars(): Record<string, string | number> {
    const out: Record<string, string | number> = {}
    varsList.forEach(({ key, value }) => {
      if (key.trim()) out[key.trim()] = value.trim() || ""
    })
    return out
  }

  const filteredFlows = loadSearch.trim()
    ? flowsList.filter(
        (f) =>
          (f.name ?? "").toLowerCase().includes(loadSearch.trim().toLowerCase()) ||
          (f.description ?? "").toLowerCase().includes(loadSearch.trim().toLowerCase())
      )
    : flowsList

  const authHeaders = () => {
    const h: Record<string, string> = {}
    if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`
    if (adminSecret) h["X-Admin-Secret"] = adminSecret
    return h
  }

  useEffect(() => {
    if (loadModalOpen && (adminSecret || session?.access_token)) {
      setFlowsLoading(true)
      fetch(`/api/admin/scraper/flows`, { headers: authHeaders() })
        .then((res) => res.json())
        .then((data) => setFlowsList(data.flows ?? []))
        .catch(() => setFlowsList([]))
        .finally(() => setFlowsLoading(false))
    }
  }, [loadModalOpen, adminSecret, session?.access_token])

  function applyImportedPayload(payload: { flow?: { name?: string; steps?: ScraperStep[] }; vars?: Record<string, string | number> }) {
    const flow = payload.flow ?? payload
    const steps = (flow as { steps?: ScraperStep[] }).steps
    if (Array.isArray(steps) && steps.length > 0) {
      setSteps(steps)
    }
    const name = (flow as { name?: string }).name
    if (typeof name === "string" && name) setFlowName(name)
    const vars = payload.vars
    if (vars && typeof vars === "object") {
      setVarsList(Object.entries(vars).map(([k, v]) => ({ key: k, value: String(v ?? "") })))
    }
    setFlowId(null)
  }

  async function handleSave() {
    if (!flowName.trim()) {
      setSaveError("Flow name required")
      return
    }
    if (!adminSecret && !session?.access_token) {
      setSaveError("Enter admin secret or ensure your email is in ADMIN_EMAILS")
      return
    }
    setSaveLoading(true)
    setSaveError(null)
    try {
      const flowJson = { flow: buildFlow(), vars: buildVars() }
      const res = await fetch("/api/admin/scraper/flows", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          id: flowId ?? undefined,
          name: flowName.trim(),
          description: flowDescription.trim() || undefined,
          flow_json: flowJson,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Save failed")
      setFlowId(data.id)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaveLoading(false)
    }
  }

  function handleSelectFlow(f: (typeof flowsList)[0]) {
    const fj = f.flow_json
    if (fj?.flow?.steps) setSteps(fj.flow.steps)
    if (fj?.flow?.name) setFlowName(fj.flow.name)
    if (fj?.vars && typeof fj.vars === "object") {
      setVarsList(Object.entries(fj.vars).map(([k, v]) => ({ key: k, value: String(v ?? "") })))
    }
    setFlowDescription(f.description ?? "")
    setFlowId(f.id)
    setLoadModalOpen(false)
    setLoadSearch("")
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result))
        applyImportedPayload(payload)
        setShowImportModal(false)
        setImportPaste("")
      } catch {
        setSaveError("Invalid JSON file")
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  function handleImportPaste() {
    try {
      const payload = JSON.parse(importPaste)
      applyImportedPayload(payload)
      setShowImportModal(false)
      setImportPaste("")
    } catch {
      setSaveError("Invalid JSON")
    }
  }

  async function runScraper(options: { dryRun?: boolean; stopAtStep?: number }) {
    if (!session?.access_token && !adminSecret) {
      setResult({ error: "Session not ready or admin secret required. Wait a moment or log in again." })
      return
    }
    setRunning(true)
    setResult(null)
    try {
      const modalUrl = process.env.NEXT_PUBLIC_MODAL_SCRAPER_URL
      const url = modalUrl || "/api/admin/scrape/run"
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        ...(adminSecret ? { "X-Admin-Secret": adminSecret } : {}),
      }
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          flow: buildFlow(),
          vars: buildVars(),
          flowId: flowId ?? undefined,
          dryRun: options.dryRun,
          stopAtStep: options.stopAtStep,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = data?.error ?? "Request failed"
        const hint = res.status === 401
          ? " Add your email to ADMIN_EMAILS or enter the admin secret."
          : res.status === 404
            ? " The run API is not available. Deploy modal_scraper.py and set NEXT_PUBLIC_MODAL_SCRAPER_URL."
            : ""
        throw new Error(msg + hint)
      }
      setResult(data)
    } catch (err) {
      setResult({
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setRunning(false)
    }
  }

  function handleRun() {
    runScraper({})
  }

  function handleValidate() {
    runScraper({ dryRun: true })
  }

  function handleRunUpTo() {
    const n = runUpToStep === "" ? undefined : Number(runUpToStep)
    if (n !== undefined && (n < 0 || n >= steps.length)) return
    runScraper({ stopAtStep: n })
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }} className="scraper-page">
      <header
        style={{
          padding: "var(--space-sm) var(--space-md)",
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
            gap: "var(--space-sm)",
          }}
        >
          <h1 style={{ fontSize: "1.125rem", fontWeight: 700 }}>Scraper</h1>
          <Link href="/admin/dashboard" style={{ color: "var(--accent-muted)", fontSize: "0.875rem" }}>
            ← Dashboard
          </Link>
        </div>
      </header>

      <main
        className="container"
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "var(--space-sm)",
          paddingBottom: "var(--space-2xl)",
        }}
      >
        <section
          style={{
            padding: "var(--space-md)",
            borderRadius: "12px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            marginBottom: "var(--space-lg)",
          }}
        >
          <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>Flow</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
            <div>
              <label style={labelStyle}>Name</label>
              <input
                value={flowName}
                onChange={(e) => setFlowName(e.target.value)}
                placeholder="e.g. Court Records Search"
                style={{ ...inputStyle, maxWidth: "100%" }}
              />
            </div>
            <div>
              <label style={labelStyle}>Description (optional)</label>
              <input
                value={flowDescription}
                onChange={(e) => setFlowDescription(e.target.value)}
                placeholder="Brief description"
                style={{ ...inputStyle, maxWidth: "100%" }}
              />
            </div>
          </div>
          <div style={{ marginBottom: "var(--space-md)" }}>
            <label style={labelStyle}>Admin secret (saved for session; optional if your email is in ADMIN_EMAILS)</label>
            <input type="password" value={adminSecret} onChange={(e) => setAdminSecret(e.target.value)} placeholder="ADMIN_SECRET" style={{ ...inputStyle, maxWidth: 280 }} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-xs)", alignItems: "center" }}>
            <button type="button" onClick={handleSave} disabled={saveLoading} className="btn-primary" style={{ padding: "var(--space-xs) var(--space-sm)", fontSize: "0.8125rem" }}>
              {saveLoading ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setLoadModalOpen(true)} style={btnSecondary}>
              Load
            </button>
            <button
              type="button"
              onClick={() => {
                const payload = { flow: buildFlow(), vars: buildVars() }
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
                const a = document.createElement("a")
                a.href = URL.createObjectURL(blob)
                a.download = `${flowName.replace(/\s+/g, "-") || "scraper-flow"}.json`
                a.click()
                URL.revokeObjectURL(a.href)
              }}
              style={btnSecondary}
            >
              Export
            </button>
            <button type="button" onClick={() => setShowImportModal(true)} style={btnSecondary}>
              Import
            </button>
            {saveError && <span style={{ fontSize: "0.8125rem", color: "var(--accent-gold)" }}>{saveError}</span>}
          </div>
        </section>

        {loadModalOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.5)",
              padding: "var(--space-md)",
            }}
            onClick={() => setLoadModalOpen(false)}
          >
            <div
              style={{
                background: "var(--bg-card)",
                borderRadius: "12px",
                border: "1px solid var(--border)",
                maxWidth: 480,
                width: "100%",
                maxHeight: "80vh",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ padding: "var(--space-md)", borderBottom: "1px solid var(--border)" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-sm)" }}>Load flow</h3>
                <input
                  type="text"
                  value={loadSearch}
                  onChange={(e) => setLoadSearch(e.target.value)}
                  placeholder="Search by name…"
                  style={{ ...inputStyle, marginBottom: 0 }}
                  autoFocus
                />
              </div>
              <div style={{ overflow: "auto", flex: 1, padding: "var(--space-sm)" }}>
                {flowsLoading ? (
                  <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Loading…</p>
                ) : filteredFlows.length === 0 ? (
                  <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>No flows found</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {filteredFlows.map((f) => (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectFlow(f)}
                          style={{
                            width: "100%",
                            padding: "var(--space-sm)",
                            textAlign: "left",
                            background: "none",
                            border: "none",
                            borderRadius: "8px",
                            cursor: "pointer",
                            fontSize: "0.875rem",
                            color: "var(--text-primary)",
                          }}
                          className="hover:bg-[var(--bg-elevated)]"
                        >
                          <span style={{ fontWeight: 500 }}>{f.name}</span>
                          {f.description && <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)" }}>{f.description}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {showImportModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.5)",
              padding: "var(--space-md)",
            }}
            onClick={() => { setShowImportModal(false); setImportPaste(""); setSaveError(null) }}
          >
            <div
              style={{
                background: "var(--bg-card)",
                borderRadius: "12px",
                border: "1px solid var(--border)",
                maxWidth: 480,
                width: "100%",
                padding: "var(--space-md)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-sm)" }}>Import JSON</h3>
              <input
                ref={(el) => { fileInputRef.current = el }}
                type="file"
                accept=".json,application/json"
                onChange={handleImportFile}
                style={{ display: "none" }}
              />
              <button type="button" onClick={() => fileInputRef.current?.click()} style={{ ...btnSecondary, marginBottom: "var(--space-sm)" }}>
                Choose file
              </button>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "var(--space-xs)" }}>Or paste JSON:</p>
              <textarea
                value={importPaste}
                onChange={(e) => setImportPaste(e.target.value)}
                placeholder='{"flow":{"name":"...","steps":[...]},"vars":{...}}'
                style={{ ...inputStyle, minHeight: 120, resize: "vertical", fontFamily: "monospace", fontSize: "0.8125rem" }}
              />
              <div style={{ display: "flex", gap: "var(--space-sm)", marginTop: "var(--space-sm)" }}>
                <button type="button" onClick={handleImportPaste} className="btn-primary" style={{ padding: "var(--space-xs) var(--space-sm)" }}>
                  Import
                </button>
                <button type="button" onClick={() => { setShowImportModal(false); setImportPaste(""); setSaveError(null) }} style={btnSecondary}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <section
          style={{
            padding: "var(--space-md)",
            borderRadius: "12px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            marginBottom: "var(--space-lg)",
          }}
        >
          <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>
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
            <strong> state</strong> and <strong> county</strong> are stored for RAG jurisdiction filtering when provided.
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
            padding: "var(--space-md)",
            borderRadius: "12px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            marginBottom: "var(--space-lg)",
          }}
        >
          <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "var(--space-sm)", color: "var(--text-primary)" }}>Run</h2>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "var(--space-md)" }}>
            Validate (dry run) to preview extracted rows without saving. Run up to step N to checkpoint.
          </p>
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={handleValidate}
              disabled={running || !sessionReady}
              style={{ ...btnSecondary, borderColor: "var(--accent-cyan)" }}
            >
              {running ? "Running…" : "Validate (dry run)"}
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)" }}>
              <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Run up to step</label>
              <select
                value={runUpToStep}
                onChange={(e) => setRunUpToStep(e.target.value === "" ? "" : Number(e.target.value))}
                style={{ ...inputStyle, width: 56, padding: "var(--space-xs)" }}
              >
                <option value="">—</option>
                {steps.map((_, i) => (
                  <option key={i} value={i}>{i + 1}</option>
                ))}
              </select>
              <button type="button" onClick={handleRunUpTo} disabled={running || !sessionReady || runUpToStep === ""} style={btnSecondary} title={runUpToStep === "" ? "Select a step first" : ""}>
                Go
              </button>
            </div>
            <button
              type="button"
              onClick={handleRun}
              disabled={running || !sessionReady}
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
            Validate and Run use <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>npm run dev</code> locally, or Modal when <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>NEXT_PUBLIC_MODAL_SCRAPER_URL</code> is set. For sites requiring login: export the flow, then run headed locally:{" "}
            <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>npm run scraper:headed -- scraper-flow.json</code>
          </p>
        </section>

        {result && (
          <section
            style={{
              padding: "var(--space-md)",
              borderRadius: "12px",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              marginBottom: "var(--space-lg)",
            }}
          >
            <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-md)", color: result.error ? "var(--accent-gold)" : "var(--accent-cyan)" }}>
              Result {result.dryRun ? "(dry run)" : ""} {result.stoppedAt !== undefined ? `(stopped at step ${result.stoppedAt + 1})` : ""}
            </h2>
            <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>
              {result.dryRun ? "Would have stored" : "Rows stored"}: {result.rowsStored ?? 0}
              {result.pdfDocumentsStored != null && result.pdfDocumentsStored > 0 && ` · PDFs stored: ${result.pdfDocumentsStored}`}
              {result.jobId && !result.dryRun && ` · Job: ${result.jobId}`}
              {result.pageUrl && <span style={{ display: "block", fontSize: "0.8125rem", marginTop: "var(--space-xs)", wordBreak: "break-all" }}>URL: {result.pageUrl}</span>}
            </p>
            {result.error && <p style={{ marginTop: "var(--space-sm)", color: "var(--accent-gold)" }}>{result.error}</p>}
            {result.previewRows && result.previewRows.length > 0 && (
              <div style={{ marginTop: "var(--space-md)" }}>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "var(--space-xs)" }}>Preview rows</h3>
                <pre style={{ padding: "var(--space-md)", background: "var(--bg-elevated)", borderRadius: "8px", fontSize: "0.75rem", overflow: "auto", maxHeight: 200 }}>
                  {JSON.stringify(result.previewRows, null, 2)}
                </pre>
              </div>
            )}
            {result.logs && result.logs.length > 0 && (
              <details style={{ marginTop: "var(--space-md)" }}>
                <summary style={{ cursor: "pointer", fontSize: "0.875rem" }}>Logs</summary>
                <pre style={{ marginTop: "var(--space-sm)", padding: "var(--space-md)", background: "var(--bg-elevated)", borderRadius: "8px", fontSize: "0.75rem", overflow: "auto", maxHeight: 240 }}>
                  {result.logs.join("\n")}
                </pre>
              </details>
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
