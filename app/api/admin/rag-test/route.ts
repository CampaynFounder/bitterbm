// app/api/admin/rag-test/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { OpenAI } from "openai"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { question, state, top_k = 10, provider = "openai" } = await req.json()

    if (!question) {
      return NextResponse.json({ error: "Question required" }, { status: 400 })
    }

    // 1. Embed query
    const embResp = await openai.embeddings.create({
      input: [question],
      model: "text-embedding-3-small",
    })
    const queryEmbedding = embResp.data[0].embedding

    // 2. Keyword boost for alienation
    const keywordFilter = question.toLowerCase().includes("alienat") ? "alienat" : null
    let keywordChunks: any[] = []
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
      keywordChunks = data || []
    }

    // 3. Vector search
    const { data: vectorChunks } = await supabase.rpc("match_case_chunks", {
      query_embedding: queryEmbedding,
      match_count: top_k,
      filter_state: state ? state.toUpperCase() : null,
    })

    // 4. Merge and deduplicate
    const seen = new Set<string>()
    const merged: any[] = []
    for (const c of keywordChunks) {
      const key = `${c.cluster_id}_${c.chunk_index}`
      if (!seen.has(key)) {
        seen.add(key)
        merged.push({ ...c, similarity: 1.0 })
      }
    }
    for (const c of vectorChunks || []) {
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
          `[${i + 1}] ${c.case_name} (${c.metadata?.court || ""}, ${c.date_filed})\n${c.chunk_text}`
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
        model: process.env.RAG_LLM_MODEL || "gpt-4o",
        max_tokens: 1024,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Case excerpts:\n\n${context}\n\nQuestion: ${question}` },
        ],
      })
      answer = completion.choices[0]?.message?.content || ""
    } else {
      // Anthropic not implemented in Next.js route (add if needed)
      return NextResponse.json({ error: "Only openai provider supported in admin test" }, { status: 400 })
    }

    // 7. Deduplicate sources
    const seenSources = new Set<string>()
    const sources: any[] = []
    for (const c of chunks) {
      const key = `${c.case_name}_${c.date_filed}`
      if (!seenSources.has(key)) {
        seenSources.add(key)
        sources.push({ case_name: c.case_name, county: c.county, date_filed: c.date_filed })
      }
    }

    return NextResponse.json({
      answer,
      sources,
      retrieved_chunks: chunks.map((c: any) => ({
        case_name: c.case_name,
        date_filed: c.date_filed,
        similarity: c.similarity,
        chunk_preview: c.chunk_text?.slice(0, 300) + "...",
      })),
    })
  } catch (err: any) {
    console.error("RAG test error:", err)
    return NextResponse.json({ error: err.message || "RAG test failed" }, { status: 500 })
  }
}
