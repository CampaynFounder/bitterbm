/**
 * Autoscrape LLM client — OpenAI default, Claude when key is set.
 * Used by the compile API route only. Never import anthropic/openai directly in routes.
 *
 * Behavior:
 * - Default provider: OpenAI (OPENAI_API_KEY required for compile).
 * - If caller requests "claude" and ANTHROPIC_API_KEY is set → use Claude.
 * - If caller requests "claude" but ANTHROPIC_API_KEY is missing → fall back to OpenAI and return providerUsed so UI can show a message.
 */

export type LLMProvider = "openai" | "claude"

export interface LLMEnv {
  OPENAI_API_KEY?: string
  ANTHROPIC_API_KEY?: string
  OPENAI_MODEL?: string
  ANTHROPIC_MODEL?: string
}

export interface LLMCompleteResult {
  text: string
  providerUsed: LLMProvider
  fallbackOccurred?: boolean
}

const DEFAULT_OPENAI_MODEL = "gpt-4o"
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514"

/**
 * Resolve which provider will be used. Use this before calling complete() so the UI can show "Claude requested but key missing; using OpenAI".
 */
export function getEffectiveProvider(
  requested: LLMProvider | undefined,
  env: LLMEnv
): LLMProvider {
  if (requested === "claude" && env.ANTHROPIC_API_KEY?.trim()) {
    return "claude"
  }
  return "openai"
}

/**
 * Call the LLM with system + user message. Uses OpenAI by default; uses Claude only when requested and ANTHROPIC_API_KEY is set, otherwise falls back to OpenAI.
 */
export async function complete(options: {
  provider: LLMProvider | undefined
  system: string
  user: string
  maxTokens: number
  env: LLMEnv
}): Promise<LLMCompleteResult> {
  const { system, user, maxTokens, env } = options
  const effective = getEffectiveProvider(options.provider, env)
  const fallbackOccurred = options.provider === "claude" && effective === "openai"

  if (effective === "openai") {
    const apiKey = env.OPENAI_API_KEY?.trim()
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required for compile (Claude key not set or fallback)")
    }
    const { OpenAI } = await import("openai")
    const openai = new OpenAI({ apiKey })
    const model = env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL
    const completion = await openai.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    })
    const text =
      completion.choices?.[0]?.message?.content?.trim() ?? ""
    return { text, providerUsed: "openai", fallbackOccurred: fallbackOccurred || undefined }
  }

  // Claude
  const apiKey = env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required when provider is claude")
  }
  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic({ apiKey })
  const model = env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL
  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  })
  const block = message.content?.find((b) => b.type === "text")
  const text = block && "text" in block ? block.text : ""
  return { text, providerUsed: "claude" }
}
