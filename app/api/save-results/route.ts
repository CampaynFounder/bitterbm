// POST /api/save-results - Persist analysis + evidence after signup
// Requires auth. Body: JSON { result } + FormData files

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const token = authHeader.slice(7)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(supabaseUrl, supabaseKey)

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const resultJson = formData.get("result") as string
    const files = formData.getAll("files") as File[]
    if (!resultJson) {
      return NextResponse.json({ error: "Missing result" }, { status: 400 })
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
      return NextResponse.json({ error: "Failed to create case" }, { status: 500 })
    }

    const evidenceIds: string[] = []
    for (const file of files) {
      const ext = file.name.split(".").pop() || "bin"
      const path = `${user.id}/${caseRow.id}/${crypto.randomUUID()}.${ext}`
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from("evidence-uploads")
        .upload(path, file, { upsert: false })

      if (uploadErr) continue
      const { data: evRow } = await supabase
        .from("evidence")
        .insert({
          case_id: caseRow.id,
          user_id: user.id,
          file_url: uploadData.path,
          file_name: file.name,
          file_type: file.type,
          file_size_bytes: file.size,
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

    return NextResponse.json({ caseId: caseRow.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Save failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
