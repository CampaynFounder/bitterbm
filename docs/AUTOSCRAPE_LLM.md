# Autoscrape LLM (Compile step)

The autoscrape **compile** step turns a recorded session into a workflow schema using an LLM. The app supports **OpenAI** and **Claude**; behavior is tuned so you can ship without a Claude key and add it later.

## Default: OpenAI

- **OPENAI_API_KEY** is required for compile. If neither provider has a key, the compile API returns an error.
- The UI can expose a provider dropdown (OpenAI / Claude). Default selection should be **OpenAI** so it works with no extra env.

## Optional: Claude

- **ANTHROPIC_API_KEY** is optional. When set, the user can choose Claude in the UI and compile will use it.
- When the user selects **Claude** but **ANTHROPIC_API_KEY** is not set (or is empty), the compile route **falls back to OpenAI** and does not fail.
- The compile response should include which provider was actually used (e.g. `providerUsed: "openai"`) and whether a fallback occurred (e.g. `fallbackOccurred: true`). The UI can then show: *"Claude requested but API key not set; used OpenAI."*

## Env vars

| Variable | Required | Used when |
|----------|----------|-----------|
| OPENAI_API_KEY | Yes (for compile) | Always used if Claude is not selected or key missing |
| ANTHROPIC_API_KEY | No | Only when user selects Claude |
| OPENAI_MODEL | No | Default: `gpt-4o` |
| ANTHROPIC_MODEL | No | Default: `claude-sonnet-4-20250514` |

Set these in Cloudflare Pages (Functions) env/secrets so the compile route can read them. Do not expose API keys to the client.

## Implementation

- All LLM calls go through **`lib/autoscrape/llm-client.ts`**. The compile API route (and any other route that needs the LLM) must **not** import `openai` or `@anthropic-ai/sdk` directly; they use `complete()` and `getEffectiveProvider()` from the LLM client.
- `getEffectiveProvider(requested, env)` returns the provider that will be used (so the UI can show a warning before or after compile when fallback happens).
- `complete({ provider, system, user, maxTokens, env })` returns `{ text, providerUsed, fallbackOccurred? }`.
