/**
 * Replace {{variable}} placeholders in strings with context values
 */
export function interpolate(
  template: string,
  vars: Record<string, string | number | string[] | undefined>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key]
    if (v == null) return `{{${key}}}`
    if (Array.isArray(v)) return v.join(",")
    return String(v)
  })
}

export function interpolateObject<T extends Record<string, unknown>>(
  obj: T,
  vars: Record<string, string | number | string[] | undefined>
): T {
  const out = { ...obj }
  for (const k of Object.keys(out)) {
    const v = out[k]
    if (typeof v === "string") {
      ;(out as Record<string, unknown>)[k] = interpolate(v, vars)
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      ;(out as Record<string, unknown>)[k] = interpolateObject(
        v as Record<string, unknown>,
        vars
      )
    }
  }
  return out
}
