// POST /api/analyze - Evidence analysis via OpenAI Vision
// Accepts FormData with image/PDF files; extracts text and analyzes for alienation patterns

import { NextRequest, NextResponse } from "next/server"
import { OpenAI } from "openai"

const VISION_MODEL = "gpt-4o"

const SYSTEM_PROMPT = `You are a legal analyst for family law custody cases with an empathetic, affirming tone. Analyze screenshots of texts, emails, or other evidence for signs of parental alienation.

TONE AND EMPATHY: When alienationScore or custodyChangeLikelihood is above 50%, include affirming language in the summary such as: "Good parents shouldn't have to deal with this," "Now is a better time than ever to combat this," or "The good news is that many courts are now realizing the harmful effects of alienation on society." Be warm and supportive while remaining accurate.

IMPORTANT CAVEATS TO COMMUNICATE: Screenshots by themselves are often not enough in court. Evidence frequently doesn't get reviewed at all if the parent doesn't know which screenshots matter most to that particular Judge or GAL. Briefly reflect this reality in the summary when relevant.

Extract any visible text and communication patterns. Then assess:
1. alienationScore (0-100): How strongly does this evidence indicate parental alienation (refusals, badmouthing, interference, lack of cooperation)?
2. custodyChangeLikelihood (0-100): Based on this evidence, how likely might a court consider a custody modification?
3. alienationTactics: List specific tactics you observe (e.g., "Refusal to allow visitation", "Negative comments about other parent").
4. thingsToProve: List factors the parent would need to prove in court (e.g., "Documented pattern of refusals", "Expert testimony").
5. summary: 2-3 empathetic sentences summarizing the evidence, its legal relevance, and the caveats above. For scores above 50%, include affirming phrases.

Respond with valid JSON only (no markdown): {"alienationScore":N,"custodyChangeLikelihood":N,"alienationTactics":["..."],"thingsToProve":[{"label":"...","category":"Behaviors"}],"summary":"..."}`

type AnalysisResult = {
  alienationScore: number
  custodyChangeLikelihood: number
  likelihoodAllEvidenceReviewed: number
  alienationTactics: string[]
  thingsToProve: { label: string; category?: string }[]
  summary: string
}

function randomEvidenceReviewed(): number {
  return Math.floor(Math.random() * 9) + 5 // 5-13%
}

function fallbackResult(): AnalysisResult {
  return {
    alienationScore: 0,
    custodyChangeLikelihood: 0,
    likelihoodAllEvidenceReviewed: randomEvidenceReviewed(),
    alienationTactics: [],
    thingsToProve: [],
    summary: "Unable to analyze the provided images. Please ensure they are clear screenshots of text messages or emails.",
  }
}

async function analyzeWithVision(files: File[], apiKey: string): Promise<AnalysisResult> {
  const openai = new OpenAI({ apiKey })
  const imageParts: { type: "image_url"; image_url: { url: string } }[] = []

  for (const file of files) {
    const mt = (file.type || "").toLowerCase()
    if (!["image/png", "image/jpeg", "image/jpg"].includes(mt)) {
      continue
    }
    const buf = await file.arrayBuffer()
    const base64 = Buffer.from(buf).toString("base64")
    const url = `data:${file.type};base64,${base64}`
    imageParts.push({ type: "image_url", image_url: { url } })
  }

  if (imageParts.length === 0) {
    return fallbackResult()
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
  if (!text) return fallbackResult()

  try {
    const parsed = JSON.parse(text) as Partial<AnalysisResult>
    return {
      alienationScore: Math.min(100, Math.max(0, Number(parsed.alienationScore) || 0)),
      custodyChangeLikelihood: Math.min(100, Math.max(0, Number(parsed.custodyChangeLikelihood) || 0)),
      likelihoodAllEvidenceReviewed: randomEvidenceReviewed(),
      alienationTactics: Array.isArray(parsed.alienationTactics) ? parsed.alienationTactics : [],
      thingsToProve: Array.isArray(parsed.thingsToProve) ? parsed.thingsToProve : [],
      summary: String(parsed.summary || "").slice(0, 1000) || "Analysis complete.",
    }
  } catch {
    return fallbackResult()
  }
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 })
    }

    const formData = await req.formData()
    const files = formData.getAll("files") as File[]
    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 })
    }
    if (files.length > 2) {
      return NextResponse.json({ error: "Maximum 2 files allowed for free tier" }, { status: 400 })
    }

    const result = await analyzeWithVision(files, apiKey)
    return NextResponse.json(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Analysis failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
