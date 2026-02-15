/**
 * POST /api/analyze - Evidence analysis via OpenAI Vision
 * Accepts FormData with image files; extracts text and analyzes for alienation patterns
 */
import { OpenAI } from "openai"

interface Env {
  OPENAI_API_KEY: string
}

const VISION_MODEL = "gpt-4o"

const SYSTEM_PROMPT = `You are a legal analyst for family law custody cases. Analyze screenshots of texts, emails, or other evidence for signs of parental alienation.

Extract any visible text and communication patterns. Then assess:
1. alienationScore (0-100): How strongly does this evidence indicate parental alienation (refusals, badmouthing, interference, lack of cooperation)?
2. custodyChangeLikelihood (0-100): Based on this evidence, how likely might a court consider a custody modification?
3. alienationTactics: List specific tactics you observe (e.g., "Refusal to allow visitation", "Negative comments about other parent").
4. thingsToProve: List factors the parent would need to prove in court (e.g., "Documented pattern of refusals", "Expert testimony").
5. summary: 2-3 sentences summarizing the evidence and its legal relevance.

Respond with valid JSON only (no markdown): {"alienationScore":N,"custodyChangeLikelihood":N,"alienationTactics":["..."],"thingsToProve":[{"label":"...","category":"Behaviors"}],"summary":"..."}`

type AnalysisResult = {
  alienationScore: number
  custodyChangeLikelihood: number
  alienationTactics: string[]
  thingsToProve: { label: string; category?: string }[]
  summary: string
}

function fallbackResult(): AnalysisResult {
  return {
    alienationScore: 0,
    custodyChangeLikelihood: 0,
    alienationTactics: [],
    thingsToProve: [],
    summary: "Unable to analyze the provided images. Please ensure they are clear screenshots of text messages or emails.",
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export async function onRequestPost(context: {
  request: Request
  env: Env
}): Promise<Response> {
  const apiKey = context.env.OPENAI_API_KEY
  if (!apiKey) {
    return json({ error: "OPENAI_API_KEY not configured" }, 500)
  }

  try {
    const formData = await context.request.formData()
    const files = formData.getAll("files") as Blob[]
    if (!files || files.length === 0) return json({ error: "No files provided" }, 400)
    if (files.length > 2) return json({ error: "Maximum 2 files allowed for free tier" }, 400)

    const openai = new OpenAI({ apiKey })
    const imageParts: { type: "image_url"; image_url: { url: string } }[] = []

    for (const file of files) {
      const mt = (file.type || "").toLowerCase()
      if (!["image/png", "image/jpeg", "image/jpg"].includes(mt)) continue
      const buf = await file.arrayBuffer()
      const base64 = arrayBufferToBase64(buf)
      const url = `data:${file.type};base64,${base64}`
      imageParts.push({ type: "image_url", image_url: { url } })
    }

    if (imageParts.length === 0) {
      return json(fallbackResult())
    }

    const content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
      { type: "text", text: "Analyze these screenshots of custody-related evidence. Respond with JSON only." },
      ...imageParts,
    ]

    const completion = await openai.chat.completions.create({
      model: VISION_MODEL,
      max_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
    })

    const text = completion.choices[0]?.message?.content?.trim()
    if (!text) return json(fallbackResult())

    try {
      const parsed = JSON.parse(text) as Partial<AnalysisResult>
      const result: AnalysisResult = {
        alienationScore: Math.min(100, Math.max(0, Number(parsed.alienationScore) || 0)),
        custodyChangeLikelihood: Math.min(100, Math.max(0, Number(parsed.custodyChangeLikelihood) || 0)),
        alienationTactics: Array.isArray(parsed.alienationTactics) ? parsed.alienationTactics : [],
        thingsToProve: Array.isArray(parsed.thingsToProve) ? parsed.thingsToProve : [],
        summary: String(parsed.summary || "").slice(0, 1000) || "Analysis complete.",
      }
      return json(result)
    } catch {
      return json(fallbackResult())
    }
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Analysis failed" }, 500)
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })
}
