import React from "react"

// Keep styles in sync with app/admin/superset/page.tsx
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
  minHeight: 40,
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  color: "var(--text-secondary)",
  cursor: "pointer",
  fontSize: "0.8125rem",
} as const

export type ResultTableConfig = {
  tableSelector: string
  rowSelector: string
  primaryId: {
    source: "column" | "link"
    columnIndex?: number
    linkSelector?: string
    linkAttribute?: string
  }
  signatureColumns?: number[]
  threshold: number
  columnNames?: string[] | string
  rowFilterLogic?: "and" | "or"
  rowFilter?: Array<{ columnIndex: number; operator: "equals" | "in"; value: string | string[]; not?: boolean }>
  extractColumns?: Array<{ columnIndex: number; outputKey?: string }>
  nestedRowFilters?: Array<{
    selectorWithinRow: string
    condition: "exists" | "not_exists"
    includeParentWhen: boolean
    description?: string
  }>
  nestedTableChecks?: Array<{
    name: string
    tableSelector: string
    scope?: "row" | "page"
    rowSelector?: string
    expandSelector?: string
    collapseSelector?: string
    collapseAfter?: boolean
    columnIndex?: number
    operator?: "exists" | "equals" | "in" | "all_in"
    value?: string | string[]
    outputInRow?: boolean
    /** When true, only include parent row in superset output when this check's exists is true. */
    filterParentWhenTrue?: boolean
  }>
  /** Extract column values from nested tables when a row condition matches (e.g. when col 2 is A or B, extract col 1 and 2). */
  nestedTableExtract?: Array<{
    name: string
    tableSelector: string
    scope?: "row" | "page"
    rowSelector?: string
    conditionColumnIndex: number
    conditionOperator: "equals" | "in"
    conditionValue: string | string[]
    extractColumns: Array<{ columnIndex: number; outputKey: string }>
    multipleRows?: "first" | "concat" | "array"
  }>
}

export const defaultResultTableConfig: ResultTableConfig = {
  tableSelector: "table",
  rowSelector: "tbody tr",
  primaryId: { source: "column", columnIndex: 0 },
  threshold: 5,
}

export function ResultTableEnrichForm({
  value,
  onChange,
}: {
  value: ResultTableConfig
  onChange: (v: ResultTableConfig) => void
}) {
  const rt: ResultTableConfig = {
    ...defaultResultTableConfig,
    ...(value && typeof value === 'object' ? value : {}),
    primaryId:
      value?.primaryId && typeof value.primaryId === 'object'
        ? { ...defaultResultTableConfig.primaryId, ...value.primaryId }
        : defaultResultTableConfig.primaryId,
  }
  const columnNamesArray = typeof rt.columnNames === "string"
    ? rt.columnNames.split(",").map((s) => s.trim()).filter(Boolean)
    : (rt.columnNames ?? [])
  const maxCol = Math.max(11, columnNamesArray.length)
  const columnLabel = (idx: number) =>
    columnNamesArray[idx] != null ? `${columnNamesArray[idx]} (column ${idx})` : `Column ${idx}`

  const update = (path: string, val: unknown) => {
    const keys = path.split(".")
    const next: ResultTableConfig = JSON.parse(JSON.stringify(rt))
    let cur: any = next
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]
      if (!(k in cur) || typeof cur[k] !== "object" || cur[k] === null) cur[k] = {}
      cur = cur[k]
    }
    cur[keys[keys.length - 1]] = val
    onChange(next)
  }

  return (
    <div>
      <div style={{ marginBottom: "var(--space-sm)" }}>
        <label style={labelStyle}>Table selector</label>
        <input
          value={rt.tableSelector}
          onChange={(e) => update("tableSelector", e.target.value)}
          placeholder="table#gvResults"
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: "var(--space-sm)" }}>
        <label style={labelStyle}>Row selector</label>
        <input
          value={rt.rowSelector}
          onChange={(e) => update("rowSelector", e.target.value)}
          placeholder="tbody tr"
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: "var(--space-sm)" }}>
        <label style={labelStyle}>Column names (optional, comma-separated)</label>
        <input
          value={
            typeof rt.columnNames === "string"
              ? rt.columnNames
              : Array.isArray(rt.columnNames)
                ? rt.columnNames.join(", ")
                : ""
          }
          onChange={(e) => update("columnNames", e.target.value)}
          placeholder="Case #, Status, Case Type, …"
          style={inputStyle}
        />
        <span
          style={{
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            display: "block",
            marginTop: 2,
          }}
        >
          Labels for UX only; config still uses 0-based column index (nth child).
        </span>
      </div>
      <div style={{ marginBottom: "var(--space-sm)" }}>
        <label style={labelStyle}>Primary ID source</label>
        <select
          value={rt.primaryId.source}
          onChange={(e) =>
            update("primaryId.source", e.target.value as "column" | "link")
          }
          style={inputStyle}
        >
          <option value="column">column</option>
          <option value="link">link</option>
        </select>
      </div>
      {rt.primaryId.source === "column" && (
        <div style={{ marginBottom: "var(--space-sm)" }}>
          <label style={labelStyle}>Primary ID column</label>
          <select
            value={String(rt.primaryId.columnIndex ?? 0)}
            onChange={(e) =>
              update("primaryId.columnIndex", parseInt(e.target.value, 10) || 0)
            }
            style={inputStyle}
          >
            {Array.from({ length: maxCol + 1 }, (_, i) => (
              <option key={i} value={i}>
                {columnLabel(i)}
              </option>
            ))}
          </select>
        </div>
      )}
      {rt.primaryId.source === "link" && (
        <>
          <div style={{ marginBottom: "var(--space-sm)" }}>
            <label style={labelStyle}>Link selector</label>
            <input
              value={rt.primaryId.linkSelector ?? ""}
              onChange={(e) => update("primaryId.linkSelector", e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: "var(--space-sm)" }}>
            <label style={labelStyle}>Link attribute</label>
            <input
              value={rt.primaryId.linkAttribute ?? "href"}
              onChange={(e) => update("primaryId.linkAttribute", e.target.value)}
              style={inputStyle}
            />
          </div>
        </>
      )}
      <div style={{ marginBottom: "var(--space-sm)" }}>
        <label style={labelStyle}>Threshold (min rows)</label>
        <input
          type="number"
          value={rt.threshold}
          onChange={(e) =>
            update("threshold", parseInt(e.target.value, 10) || 5)
          }
          style={{ ...inputStyle, maxWidth: 100 }}
        />
      </div>
      <p
        style={{
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          marginTop: "var(--space-sm)",
        }}
      >
        DOM: tableSelector + rowSelector find rows. Row filter (below) keeps only
        rows matching conditions (AND/OR + optional NOT). For matching rows we
        extract primary ID and any extract columns; output = search criteria +
        list of ids (and those values).
      </p>
      <div style={{ marginTop: "var(--space-md)" }}>
        <label style={labelStyle}>Row filter logic</label>
        <select
          value={rt.rowFilterLogic ?? "and"}
          onChange={(e) =>
            update("rowFilterLogic", e.target.value as "and" | "or")
          }
          style={{ ...inputStyle, maxWidth: 180 }}
        >
          <option value="and">Match all (AND)</option>
          <option value="or">Match any (OR)</option>
        </select>
      </div>
      {(rt.rowFilter ?? []).length > 0 && (
        <div style={{ marginTop: "var(--space-sm)" }}>
          <label style={labelStyle}>
            Row conditions (nth child = value / in values; NOT inverts)
          </label>
          {(rt.rowFilter ?? []).map((f, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: "var(--space-sm)",
                marginBottom: "var(--space-xs)",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: "0.8125rem",
                }}
              >
                <input
                  type="checkbox"
                  checked={f.not ?? false}
                  onChange={(e) => {
                    const arr = [...(rt.rowFilter ?? [])]
                    arr[i] = { ...arr[i], not: e.target.checked }
                    update("rowFilter", arr)
                  }}
                />
                NOT
              </label>
              <select
                value={String(f.columnIndex)}
                onChange={(e) => {
                  const arr = [...(rt.rowFilter ?? [])]
                  arr[i] = {
                    ...arr[i],
                    columnIndex: parseInt(e.target.value, 10) || 0,
                  }
                  update("rowFilter", arr)
                }}
                style={{ ...inputStyle, width: 180 }}
                title="Column (nth child)"
              >
                {Array.from({ length: maxCol + 1 }, (_, j) => (
                  <option key={j} value={j}>
                    {columnLabel(j)}
                  </option>
                ))}
              </select>
              <select
                value={f.operator}
                onChange={(e) => {
                  const arr = [...(rt.rowFilter ?? [])]
                  arr[i] = {
                    ...arr[i],
                    operator: e.target.value as "equals" | "in",
                  }
                  update("rowFilter", arr)
                }}
                style={{ ...inputStyle, width: 90 }}
              >
                <option value="equals">equals</option>
                <option value="in">in</option>
              </select>
              <input
                value={
                  Array.isArray(f.value)
                    ? f.value.join(", ")
                    : String(f.value ?? "")
                }
                onChange={(e) => {
                  const v = e.target.value
                  const arr = [...(rt.rowFilter ?? [])]
                  arr[i] = {
                    ...arr[i],
                    value:
                      f.operator === "in"
                        ? v
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean)
                        : v,
                  }
                  update("rowFilter", arr)
                }}
                placeholder={f.operator === "in" ? "A, B, C" : "value"}
                style={{ ...inputStyle, flex: 1, minWidth: 100 }}
              />
              <button
                type="button"
                onClick={() =>
                  update(
                    "rowFilter",
                    (rt.rowFilter ?? []).filter((_, j) => j !== i)
                  )
                }
                style={btnSecondary}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() =>
          update("rowFilter", [
            ...(rt.rowFilter ?? []),
            { columnIndex: 0, operator: "equals" as const, value: "", not: false },
          ])
        }
        style={{ ...btnSecondary, marginTop: "var(--space-sm)" }}
      >
        + Add row condition
      </button>
      <div style={{ marginTop: "var(--space-lg)" }}>
        <label style={labelStyle}>
          Extract columns (optional; primary ID is always extracted as id)
        </label>
        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            marginBottom: "var(--space-xs)",
          }}
        >
          For each matching row, also extract these column values; output key
          defaults to col_0, col_1, or set a name.
        </p>
        {(rt.extractColumns ?? []).map((ec, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: "var(--space-sm)",
              marginBottom: "var(--space-xs)",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <select
              value={String(ec.columnIndex)}
              onChange={(e) => {
                const arr = [...(rt.extractColumns ?? [])]
                arr[i] = {
                  ...arr[i],
                  columnIndex: parseInt(e.target.value, 10) || 0,
                }
                update("extractColumns", arr)
              }}
              style={{ ...inputStyle, width: 180 }}
            >
              {Array.from({ length: maxCol + 1 }, (_, j) => (
                <option key={j} value={j}>
                  {columnLabel(j)}
                </option>
              ))}
            </select>
            <input
              value={ec.outputKey ?? ""}
              onChange={(e) => {
                const arr = [...(rt.extractColumns ?? [])]
                arr[i] = {
                  ...arr[i],
                  outputKey: e.target.value.trim() || undefined,
                }
                update("extractColumns", arr)
              }}
              placeholder="Output key (e.g. status) or leave blank for col_N"
              style={{ ...inputStyle, width: 140 }}
            />
            <button
              type="button"
              onClick={() =>
                update(
                  "extractColumns",
                  (rt.extractColumns ?? []).filter((_, j) => j !== i)
                )
              }
              style={btnSecondary}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            update("extractColumns", [
              ...(rt.extractColumns ?? []),
              { columnIndex: 0, outputKey: undefined },
            ])
          }
          style={{ ...btnSecondary, marginTop: "var(--space-sm)" }}
        >
          + Add extract column
        </button>
      </div>
      <div style={{ marginTop: "var(--space-lg)" }}>
        <label style={labelStyle}>Nested table filters (exists / not exists)</label>
        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            marginBottom: "var(--space-sm)",
          }}
        >
          Within each result row, Playwright checks the selector (e.g.{" "}
          <code>td:nth-child(3) table tbody tr</code> for 3rd cell’s nested table
          rows). Use to include or exclude parent rows based on whether nested
          content exists.
        </p>
        {(rt.nestedRowFilters ?? []).map((nf, i) => (
          <div
            key={i}
            style={{
              marginBottom: "var(--space-sm)",
              padding: "var(--space-sm)",
              background: "var(--bg-elevated)",
              borderRadius: 8,
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ marginBottom: "var(--space-xs)" }}>
              <input
                value={nf.description ?? ""}
                onChange={(e) => {
                  const arr = [...(rt.nestedRowFilters ?? [])]
                  arr[i] = {
                    ...arr[i],
                    description: e.target.value.trim() || undefined,
                  }
                  update("nestedRowFilters", arr)
                }}
                placeholder="Label (optional)"
                style={{ ...inputStyle, maxWidth: 240 }}
              />
            </div>
            <div
              style={{
                display: "flex",
                gap: "var(--space-sm)",
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: "var(--space-xs)",
              }}
            >
              <span style={{ fontSize: "0.8125rem" }}>Within row:</span>
              <input
                value={nf.selectorWithinRow}
                onChange={(e) => {
                  const arr = [...(rt.nestedRowFilters ?? [])]
                  arr[i] = { ...arr[i], selectorWithinRow: e.target.value }
                  update("nestedRowFilters", arr)
                }}
                placeholder="td:nth-child(3) table tbody tr"
                style={{ ...inputStyle, flex: 1, minWidth: 200 }}
                title="CSS selector relative to parent row"
              />
            </div>
            <div
              style={{
                display: "flex",
                gap: "var(--space-sm)",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <select
                value={nf.condition}
                onChange={(e) => {
                  const arr = [...(rt.nestedRowFilters ?? [])]
                  arr[i] = {
                    ...arr[i],
                    condition: e.target.value as "exists" | "not_exists",
                  }
                  update("nestedRowFilters", arr)
                }}
                style={{ ...inputStyle, width: 120 }}
              >
                <option value="exists">exists</option>
                <option value="not_exists">not exists</option>
              </select>
              <select
                value={nf.includeParentWhen ? "include" : "exclude"}
                onChange={(e) => {
                  const arr = [...(rt.nestedRowFilters ?? [])]
                  arr[i] = {
                    ...arr[i],
                    includeParentWhen: e.target.value === "include",
                  }
                  update("nestedRowFilters", arr)
                }}
                style={{ ...inputStyle, width: 160 }}
              >
                <option value="include">Include parent when</option>
                <option value="exclude">Exclude parent when</option>
              </select>
              <button
                type="button"
                onClick={() =>
                  update(
                    "nestedRowFilters",
                    (rt.nestedRowFilters ?? []).filter((_, j) => j !== i)
                  )
                }
                style={btnSecondary}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            update("nestedRowFilters", [
              ...(rt.nestedRowFilters ?? []),
              {
                selectorWithinRow: "td:nth-child(1) table tr",
                condition: "exists" as const,
                includeParentWhen: true,
              },
            ])
          }
          style={{ ...btnSecondary, marginTop: "var(--space-xs)" }}
        >
          + Add nested filter
        </button>
      </div>
      <div style={{ marginTop: "var(--space-lg)" }}>
        <label style={labelStyle}>
          Nested table checks (output: name, exists, rowIndex)
        </label>
        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            marginBottom: "var(--space-sm)",
          }}
        >
          <strong>Scope:</strong> <em>row</em> = look inside this result row (or
          its next row for expandable grids). <em>page</em> = look from the whole
          page/frame (use when the nested table is not inside the current row).{" "}
          <strong>Row selector</strong> = CSS for rows inside the table (e.g.{" "}
          <code>tbody tr</code>); required for equals/in. <strong>Check:</strong>{" "}
          exists = table has any rows; equals = one value; in = any of several
          (comma-separated).
        </p>
        {(rt.nestedTableChecks ?? []).map((nc, i) => (
          <div
            key={i}
            style={{
              marginBottom: "var(--space-sm)",
              padding: "var(--space-sm)",
              background: "var(--bg-elevated)",
              borderRadius: 8,
              border: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "var(--space-sm)",
                flexWrap: "wrap",
                marginBottom: "var(--space-xs)",
              }}
            >
              <input
                value={nc.name}
                onChange={(e) => {
                  const arr = [...(rt.nestedTableChecks ?? [])]
                  arr[i] = { ...arr[i], name: e.target.value }
                  update("nestedTableChecks", arr)
                }}
                placeholder="Name (output label)"
                style={{ ...inputStyle, width: 140 }}
              />
              <select
                value={nc.scope ?? "row"}
                onChange={(e) => {
                  const arr = [...(rt.nestedTableChecks ?? [])]
                  arr[i] = {
                    ...arr[i],
                    scope: e.target.value as "row" | "page",
                  }
                  update("nestedTableChecks", arr)
                }}
                style={{ ...inputStyle, width: 100 }}
                title="row = inside this result row (or next row); page = whole page"
              >
                <option value="row">row</option>
                <option value="page">page</option>
              </select>
              <input
                value={nc.tableSelector}
                onChange={(e) => {
                  const arr = [...(rt.nestedTableChecks ?? [])]
                  arr[i] = { ...arr[i], tableSelector: e.target.value }
                  update("nestedTableChecks", arr)
                }}
                placeholder="Table CSS (e.g. table#EventGrid)"
                style={{ ...inputStyle, flex: 1, minWidth: 160 }}
                title="CSS selector for the nested table"
              />
            </div>
            <div
              style={{
                display: "flex",
                gap: "var(--space-sm)",
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: "var(--space-xs)",
              }}
            >
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  whiteSpace: "nowrap",
                }}
              >
                Row selector (CSS):
              </span>
              <input
                value={nc.rowSelector ?? ""}
                onChange={(e) => {
                  const v = e.target.value
                  const arr = [...(rt.nestedTableChecks ?? [])]
                  arr[i] = {
                    ...arr[i],
                    rowSelector: v === "" ? undefined : v,
                  }
                  update("nestedTableChecks", arr)
                }}
                placeholder="e.g. tbody tr"
                style={{ ...inputStyle, width: 120 }}
                title="CSS for rows inside the table (spaces allowed, e.g. tbody tr)"
              />
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Expand selector:
              </span>
              <input
                value={nc.expandSelector ?? ""}
                onChange={(e) => {
                  const v = e.target.value
                  const arr = [...(rt.nestedTableChecks ?? [])]
                  arr[i] = {
                    ...arr[i],
                    expandSelector: v === "" ? undefined : v,
                  }
                  update("nestedTableChecks", arr)
                }}
                placeholder="e.g. img[src*='add.png']"
                style={{ ...inputStyle, width: 140 }}
                title="CSS selector to click to expand hidden sibling row (optional)"
              />
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: "0.8125rem",
                }}
              >
                <input
                  type="checkbox"
                  checked={nc.collapseAfter ?? false}
                  onChange={(e) => {
                    const arr = [...(rt.nestedTableChecks ?? [])]
                    arr[i] = { ...arr[i], collapseAfter: e.target.checked }
                    update("nestedTableChecks", arr)
                  }}
                />
                Collapse after
              </label>
            </div>
            <div
              style={{
                display: "flex",
                gap: "var(--space-sm)",
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: "var(--space-xs)",
              }}
            >
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Check:
              </span>
              <select
                value={nc.operator ?? "equals"}
                onChange={(e) => {
                  const arr = [...(rt.nestedTableChecks ?? [])]
                  arr[i] = {
                    ...arr[i],
                    operator: e.target.value as
                      | "exists"
                      | "equals"
                      | "in"
                      | "all_in",
                  }
                  update("nestedTableChecks", arr)
                }}
                style={{ ...inputStyle, width: 88 }}
              >
                <option value="exists">exists</option>
                <option value="equals">equals</option>
                <option value="in">in</option>
                <option value="all_in">all_in</option>
              </select>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Column index (0-based):
              </span>
              <input
                type="number"
                min={0}
                value={Math.max(0, nc.columnIndex ?? 0)}
                onChange={(e) => {
                  const v = Math.max(0, parseInt(e.target.value, 10) || 0)
                  const arr = [...(rt.nestedTableChecks ?? [])]
                  arr[i] = { ...arr[i], columnIndex: v }
                  update("nestedTableChecks", arr)
                }}
                style={{ ...inputStyle, width: 56 }}
                title="Column in the nested table to check (0 = first)"
              />
              <input
                value={
                  typeof nc.value === "string"
                    ? nc.value
                    : Array.isArray(nc.value)
                      ? (nc.value as string[]).map((s) => {
                          let x = String(s).trim()
                          if (x.startsWith('\\"') && x.endsWith('\\"')) x = x.slice(2, -2)
                          else if (x.startsWith('"') && x.endsWith('"')) x = x.slice(1, -1)
                          return x
                        }).join(", ")
                      : ""
                }
                onChange={(e) => {
                  const v = e.target.value
                  const arr = [...(rt.nestedTableChecks ?? [])]
                  arr[i] = { ...arr[i], value: v }
                  update("nestedTableChecks", arr)
                }}
                placeholder={
                  (nc.operator ?? "equals") === "in" ||
                  (nc.operator ?? "equals") === "all_in"
                    ? "A, B, C (comma-separated)"
                    : "Value"
                }
                style={{ ...inputStyle, width: 200 }}
                title="One value for equals; for 'in' or 'all_in', type several values separated by commas"
              />
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: "0.8125rem",
                }}
              >
                <input
                  type="checkbox"
                  checked={nc.outputInRow ?? false}
                  onChange={(e) => {
                    const arr = [...(rt.nestedTableChecks ?? [])]
                    arr[i] = { ...arr[i], outputInRow: e.target.checked }
                    update("nestedTableChecks", arr)
                  }}
                />
                Output in row
              </label>
            </div>
            <button
              type="button"
              onClick={() =>
                update(
                  "nestedTableChecks",
                  (rt.nestedTableChecks ?? []).filter((_, j) => j !== i)
                )
              }
              style={btnSecondary}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            update("nestedTableChecks", [
              ...(rt.nestedTableChecks ?? []),
              {
                name: "Nested table 1",
                tableSelector: "table.nested",
                scope: "page",
                operator: "exists" as const,
                outputInRow: true,
              },
            ])
          }
          style={{ ...btnSecondary, marginTop: "var(--space-xs)" }}
        >
          + Add nested table check
        </button>
      </div>
      <div style={{ marginTop: "var(--space-lg)" }}>
        <label style={labelStyle}>
          Nested table extract (extract column values when condition matches)
        </label>
        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            marginBottom: "var(--space-sm)",
          }}
        >
          When a nested table has a row where the condition column equals or is in the given value(s), extract the listed columns from that row (or all matching rows). Output keys are added to each result row (e.g. plaintiff_attorneys, defendant_attorneys).
        </p>
        {(rt.nestedTableExtract ?? []).map((ne, i) => (
          <div
            key={i}
            style={{
              marginBottom: "var(--space-sm)",
              padding: "var(--space-sm)",
              background: "var(--bg-elevated)",
              borderRadius: 8,
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", marginBottom: "var(--space-xs)" }}>
              <input
                value={ne.name}
                onChange={(e) => {
                  const arr = [...(rt.nestedTableExtract ?? [])]
                  arr[i] = { ...arr[i], name: e.target.value }
                  update("nestedTableExtract", arr)
                }}
                placeholder="Label (e.g. attorneys)"
                style={{ ...inputStyle, width: 140 }}
              />
              <select
                value={ne.scope ?? "row"}
                onChange={(e) => {
                  const arr = [...(rt.nestedTableExtract ?? [])]
                  arr[i] = { ...arr[i], scope: e.target.value as "row" | "page" }
                  update("nestedTableExtract", arr)
                }}
                style={{ ...inputStyle, width: 100 }}
              >
                <option value="row">row</option>
                <option value="page">page</option>
              </select>
              <input
                value={ne.tableSelector}
                onChange={(e) => {
                  const arr = [...(rt.nestedTableExtract ?? [])]
                  arr[i] = { ...arr[i], tableSelector: e.target.value }
                  update("nestedTableExtract", arr)
                }}
                placeholder="Table CSS (e.g. table#Attorneys)"
                style={{ ...inputStyle, flex: 1, minWidth: 160 }}
              />
              <input
                value={ne.rowSelector ?? ""}
                onChange={(e) => {
                  const arr = [...(rt.nestedTableExtract ?? [])]
                  arr[i] = { ...arr[i], rowSelector: e.target.value.trim() || undefined }
                  update("nestedTableExtract", arr)
                }}
                placeholder="Row selector (e.g. tbody tr)"
                style={{ ...inputStyle, width: 120 }}
              />
            </div>
            <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", alignItems: "center", marginBottom: "var(--space-xs)" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>When column</span>
              <input
                type="number"
                min={0}
                value={ne.conditionColumnIndex}
                onChange={(e) => {
                  const arr = [...(rt.nestedTableExtract ?? [])]
                  arr[i] = { ...arr[i], conditionColumnIndex: Math.max(0, parseInt(e.target.value, 10) || 0) }
                  update("nestedTableExtract", arr)
                }}
                style={{ ...inputStyle, width: 56 }}
              />
              <select
                value={ne.conditionOperator}
                onChange={(e) => {
                  const arr = [...(rt.nestedTableExtract ?? [])]
                  arr[i] = { ...arr[i], conditionOperator: e.target.value as "equals" | "in" }
                  update("nestedTableExtract", arr)
                }}
                style={{ ...inputStyle, width: 88 }}
              >
                <option value="equals">equals</option>
                <option value="in">in</option>
              </select>
              <input
                value={
                  typeof ne.conditionValue === "string"
                    ? ne.conditionValue
                    : Array.isArray(ne.conditionValue)
                      ? (ne.conditionValue as string[]).join(", ")
                      : ""
                }
                onChange={(e) => {
                  const v = e.target.value
                  const arr = [...(rt.nestedTableExtract ?? [])]
                  arr[i] = { ...arr[i], conditionValue: v }
                  update("nestedTableExtract", arr)
                }}
                placeholder={ne.conditionOperator === "in" ? "A, B, C (comma-separated)" : "value"}
                style={{ ...inputStyle, width: 140 }}
              />
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Multiple rows:</span>
              <select
                value={ne.multipleRows ?? "first"}
                onChange={(e) => {
                  const arr = [...(rt.nestedTableExtract ?? [])]
                  arr[i] = { ...arr[i], multipleRows: e.target.value as "first" | "concat" | "array" }
                  update("nestedTableExtract", arr)
                }}
                style={{ ...inputStyle, width: 100 }}
              >
                <option value="first">first match</option>
                <option value="concat">concat (; )</option>
                <option value="array">array</option>
              </select>
            </div>
            <div style={{ marginBottom: "var(--space-xs)" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Extract columns (column index → output key):</span>
              {(ne.extractColumns ?? []).map((ec, j) => (
                <div key={j} style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
                  <input
                    type="number"
                    min={0}
                    value={ec.columnIndex}
                    onChange={(e) => {
                      const arr = [...(rt.nestedTableExtract ?? [])]
                      const ex = [...(arr[i].extractColumns ?? [])]
                      ex[j] = { ...ex[j], columnIndex: Math.max(0, parseInt(e.target.value, 10) || 0) }
                      arr[i] = { ...arr[i], extractColumns: ex }
                      update("nestedTableExtract", arr)
                    }}
                    style={{ ...inputStyle, width: 56 }}
                    placeholder="Col"
                  />
                  <input
                    value={ec.outputKey}
                    onChange={(e) => {
                      const arr = [...(rt.nestedTableExtract ?? [])]
                      const ex = [...(arr[i].extractColumns ?? [])]
                      ex[j] = { ...ex[j], outputKey: e.target.value.trim() }
                      arr[i] = { ...arr[i], extractColumns: ex }
                      update("nestedTableExtract", arr)
                    }}
                    placeholder="Output key"
                    style={{ ...inputStyle, width: 120 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const arr = [...(rt.nestedTableExtract ?? [])]
                      arr[i] = { ...arr[i], extractColumns: (arr[i].extractColumns ?? []).filter((_, k) => k !== j) }
                      update("nestedTableExtract", arr)
                    }}
                    style={btnSecondary}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  const arr = [...(rt.nestedTableExtract ?? [])]
                  const ex = [...(arr[i].extractColumns ?? []), { columnIndex: 0, outputKey: "" }]
                  arr[i] = { ...arr[i], extractColumns: ex }
                  update("nestedTableExtract", arr)
                }}
                style={{ ...btnSecondary, marginTop: 4 }}
              >
                + Add column
              </button>
            </div>
            <button
              type="button"
              onClick={() => update("nestedTableExtract", (rt.nestedTableExtract ?? []).filter((_, j) => j !== i))}
              style={btnSecondary}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            update("nestedTableExtract", [
              ...(rt.nestedTableExtract ?? []),
              {
                name: "Nested extract 1",
                tableSelector: "table.nested",
                scope: "row",
                rowSelector: "tbody tr",
                conditionColumnIndex: 0,
                conditionOperator: "in",
                conditionValue: [],
                extractColumns: [{ columnIndex: 0, outputKey: "" }, { columnIndex: 1, outputKey: "" }],
                multipleRows: "concat",
              },
            ])
          }
          style={{ ...btnSecondary, marginTop: "var(--space-xs)" }}
        >
          + Add nested table extract
        </button>
      </div>
    </div>
  )
}

