/**
 * Cloudflare Pages Function: Persist analysis + evidence after signup
 * POST /api/save-results - Requires Authorization: Bearer <token>
 */
import { createClient } from "@supabase/supabase-js"

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

export async function onRequestPost(context: {
  request: Request
  env: Env
}): Promise<Response> {
  const authHeader = context.request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401)
  }
  const token = authHeader.slice(7)
  const supabase = createClient(
    context.env.SUPABASE_URL,
    context.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401)
  }

  try {
    const formData = await context.request.formData()
    const resultJson = formData.get("result") as string
    const files = formData.getAll("files") as Blob[]
    if (!resultJson) {
      return json({ error: "Missing result" }, 400)
    }
    const result = JSON.parse(resultJson) as {
      alienationScore: number
      custodyChangeLikelihood: number
      alienationTactics: string[]
      thingsToProve: { label: string; category?: string }[]
      summary: string
    }

    const { data: caseRow, error: caseErr } = await supabase
      .from("cases")
      .insert({ user_id: user.id })
      .select("id")
      .single()

    if (caseErr || !caseRow) {
      return json({ error: "Failed to create case" }, 500)
    }

    const evidenceIds: string[] = []
    for (const file of files) {
      const f = file as unknown as { name?: string; type?: string; size?: number }
      const name = f.name ?? "file"
      const ext = name.split(".").pop() || "bin"
      const path = `${user.id}/${caseRow.id}/${crypto.randomUUID()}.${ext}`
      const buf = await file.arrayBuffer()
      const { error: uploadErr } = await supabase.storage
        .from("evidence-uploads")
        .upload(path, buf, {
          contentType: f.type || "application/octet-stream",
          upsert: false,
        })

      if (uploadErr) continue
      const { data: evRow } = await supabase
        .from("evidence")
        .insert({
          case_id: caseRow.id,
          user_id: user.id,
          file_url: path,
          file_name: name,
          file_type: f.type ?? null,
          file_size_bytes: f.size ?? null,
          processing_status: "done",
          processed_at: new Date().toISOString(),
        })
        .select("id")
        .single()
      if (evRow) evidenceIds.push(evRow.id)
    }

    await supabase.from("analysis_results").insert({
      case_id: caseRow.id,
      evidence_ids: evidenceIds,
      alienation_score: result.alienationScore,
      custody_change_likelihood: result.custodyChangeLikelihood,
      alienation_tactics: result.alienationTactics,
      things_to_prove: result.thingsToProve,
      summary: result.summary,
    })

    return json({ caseId: caseRow.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Save failed"
    return json({ error: msg }, 500)
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
