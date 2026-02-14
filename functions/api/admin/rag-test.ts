/**
 * Cloudflare Pages Function: RAG test endpoint.
 * Replicates logic from app/api/admin/rag-test/route.ts for static Next.js export.
 */
import { createClient } from "@supabase/supabase-js"
import { OpenAI } from "openai"

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  OPENAI_API_KEY: string
  RAG_LLM_MODEL?: string
}

export async function onRequestPost(context: {
  request: Request
  env: Env
}): Promise<Response> {
  const { request, env } = context

  const supabaseUrl = env.SUPABASE_URL
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY
  const openaiKey = env.OPENAI_API_KEY

  if (!supabaseUrl || !supabaseKey || !openaiKey) {
    return json(
      { error: "Server configuration missing (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY)" },
      500
    )
  }

  try {
    const body = (await request.json()) as {
      question?: string
      state?: string
      top_k?: number
      provider?: string
    }
    const { question, state, top_k = 10, provider = "openai" } = body

    if (!question) {
      return json({ error: "Question required" }, 400)
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const openai = new OpenAI({ apiKey: openaiKey })

    // 1. Embed query
    const embResp = await openai.embeddings.create({
      input: [question],
      model: "text-embedding-3-small",
    })
    const queryEmbedding = embResp.data[0].embedding

    // 2. Keyword boost for alienation
    const keywordFilter = question.toLowerCase().includes("alienat") ? "alienat" : null
    let keywordChunks: Array<Record<string, unknown>> = []
    if (keywordFilter) {
      let query = supabase
        .from("case_chunks")
        .select("cluster_id, case_name, county, judge, date_filed, chunk_text, chunk_index, state, metadata")
        .ilike("chunk_text", `%${keywordFilter}%`)
        .limit(Math.min(5, top_k))
      if (state) {
        query = query.eq("state", state.toUpperCase())
      }
      const { data } = await query
      keywordChunks = (data as Array<Record<string, unknown>>) || []
    }

    // 3. Vector search
    const { data: vectorChunks } = await supabase.rpc("match_case_chunks", {
      query_embedding: queryEmbedding,
      match_count: top_k,
      filter_state: state ? state.toUpperCase() : null,
    })

    // 4. Merge and deduplicate
    const seen = new Set<string>()
    const merged: Array<Record<string, unknown>> = []
    for (const c of keywordChunks) {
      const key = `${c.cluster_id}_${c.chunk_index}`
      if (!seen.has(key)) {
        seen.add(key)
        merged.push({ ...c, similarity: 1.0 })
      }
    }
    for (const c of (vectorChunks as Array<Record<string, unknown>>) || []) {
      const key = `${c.cluster_id}_${c.chunk_index}`
      if (!seen.has(key)) {
        seen.add(key)
        merged.push(c)
      }
    }
    const chunks = merged.slice(0, top_k)

    // 5. Format context
    const context = chunks
      .map(
        (c, i) =>
          `[${i + 1}] ${c.case_name} (${(c.metadata as Record<string, string>)?.court || ""}, ${c.date_filed})\n${c.chunk_text}`
      )
      .join("\n\n---\n\n")

    // 6. Call LLM
    const systemPrompt = `You are a legal research assistant for family law and custody matters. Use the provided case excerpts to answer the user's question.

Your response should:
1. Summarize the key findings from the excerpts that relate to the question (e.g., alienation, custody factors, court reasoning).
2. Cite cases by name and date (e.g., "In Baskin v. Hale (2016), the court found...").
3. When the user shares their situation, compare it to relevant cases (e.g., "This is similar to [Case Name] because...").
4. Avoid saying the excerpts "do not discuss" the topic when they clearly mention alienation, custody disputes, or related issues—instead, summarize what the excerpts do say.

Base your answer only on the provided excerpts. If excerpts are truly unrelated, say so briefly.`

    let answer = ""
    if (provider === "openai") {
      const completion = await openai.chat.completions.create({
        model: env.RAG_LLM_MODEL || "gpt-4o",
        max_tokens: 1024,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Case excerpts:\n\n${context}\n\nQuestion: ${question}` },
        ],
      })
      answer = completion.choices[0]?.message?.content || ""
    } else {
      return json({ error: "Only openai provider supported in admin test" }, 400)
    }

    // 7. Deduplicate sources
    const seenSources = new Set<string>()
    const sources: Array<{ case_name: string; county: string | null; date_filed: string }> = []
    for (const c of chunks) {
      const key = `${c.case_name}_${c.date_filed}`
      if (!seenSources.has(key)) {
        seenSources.add(key)
        sources.push({
          case_name: String(c.case_name ?? ""),
          county: c.county as string | null,
          date_filed: String(c.date_filed ?? ""),
        })
      }
    }

    return json({
      answer,
      sources,
      retrieved_chunks: chunks.map((c) => ({
        case_name: c.case_name,
        date_filed: c.date_filed,
        similarity: c.similarity,
        chunk_preview: (String(c.chunk_text ?? "")).slice(0, 300) + "...",
      })),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "RAG test failed"
    return json({ error: message }, 500)
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
