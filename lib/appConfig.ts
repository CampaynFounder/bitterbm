/**
 * App config / feature flags (from app_config table).
 * Cached client-side; refetched on mount.
 */
const CACHE_KEY = "bitterbm_app_config"
const CACHE_MS = 60_000

export type AuthTiming = "value_first" | "gate_before_features"

export type AppConfig = {
  auth_timing?: AuthTiming
}

async function fetchConfig(): Promise<AppConfig> {
  const { createClient } = await import("@supabase/supabase-js")
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return { auth_timing: "value_first" }
  const supabase = createClient(url, key)
  const { data } = await supabase.from("app_config").select("key, value")
  const out: AppConfig = {}
  for (const row of data ?? []) {
    if (row.key === "auth_timing") {
      out.auth_timing = (row.value as string)?.replace(/^"|"$/g, "") as AuthTiming
    }
  }
  return out
}

export async function getAppConfig(): Promise<AppConfig> {
  if (typeof window === "undefined") return { auth_timing: "value_first" }
  try {
    const cached = sessionStorage.getItem(CACHE_KEY)
    if (cached) {
      const { ts, config } = JSON.parse(cached) as { ts: number; config: AppConfig }
      if (Date.now() - ts < CACHE_MS) return config
    }
    const config = await fetchConfig()
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), config }))
    return config
  } catch {
    return { auth_timing: "value_first" }
  }
}
