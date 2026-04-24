/**
 * Build-time overrides applied on top of the models.dev snapshot.
 *
 * Each entry describes how we deviate from what the catalog ships:
 *   - `adapter`      — force a specific adapter family (e.g. route
 *                      google / xai / groq through our openai adapter
 *                      via their openai-compat endpoints)
 *   - `baseUrl`      — override the endpoint URL (pairs with adapter
 *                      reroutes to point at the compat URL)
 *   - `headers`      — request headers sent on every call
 *   - `quirks`       — default `Quirks` for every model on this provider
 *   - `modelQuirks`  — per-model quirks overlay; merged on top of `quirks`
 *   - `transform`    — escape hatch for arbitrary per-model editing;
 *                      return `undefined` to drop the model entirely.
 *
 * Hand-maintained. Adding a new entry is typically the answer when a
 * provider has a quirk models.dev's catalog can't express.
 */
// oxlint-disable sort-keys -- logical grouping (quirks → compat reroutes) reads better than alphabetical
import type { ModelInfo, ProviderInfo, Quirks } from "../src/types.ts"
import type { BuiltinProvider } from "../src/providers/index.ts"

export interface ProviderOverride {
  adapter?: BuiltinProvider
  baseUrl?: string
  headers?: Record<string, string>
  quirks?: Quirks
  modelQuirks?: Record<string, Quirks>
  transform?: (info: ModelInfo, provider: ProviderInfo) => ModelInfo | undefined
}

export const overrides: Record<string, ProviderOverride> = {
  // ── Native OpenAI ─────────────────────────────────────────────────
  openai: {
    quirks: {
      maxTokensField: "max_completion_tokens",
      thinkingFormat: "openai",
    },
  },

  // ── OpenRouter ────────────────────────────────────────────────────
  openrouter: {
    headers: {
      "HTTP-Referer": "https://zaly.sh",
      "X-Title": "Zaly",
    },
    quirks: {
      maxTokensField: "max_tokens",
      reasoningField: "reasoning",
      thinkingFormat: "openrouter",
    },
  },

  // ── DeepSeek ──────────────────────────────────────────────────────
  deepseek: {
    quirks: {
      maxTokensField: "max_tokens",
      reasoningField: "reasoning_content",
      thinkingFormat: "deepseek",
    },
  },

  // ── Z.ai ──────────────────────────────────────────────────────────
  zai: {
    quirks: {
      maxTokensField: "max_tokens",
      thinkingFormat: "zai",
    },
  },

  // ── Moonshot (Kimi) ───────────────────────────────────────────────
  moonshotai: {
    quirks: {
      maxTokensField: "max_tokens",
      thinkingFormat: "openai",
    },
  },

  // ── openai-compat reroutes ────────────────────────────────────────
  // These providers ship native SDKs in the Vercel AI ecosystem but
  // also expose an OpenAI-compatible REST endpoint. We route them
  // through our createOpenAI adapter with the compat URL until we
  // implement their native protocols.
  google: {
    adapter: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  xai: {
    adapter: "openai",
    baseUrl: "https://api.x.ai/v1",
  },
  groq: {
    adapter: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
  },
  mistral: {
    adapter: "openai",
    baseUrl: "https://api.mistral.ai/v1",
  },
  cohere: {
    adapter: "openai",
    baseUrl: "https://api.cohere.com/compatibility/v1",
  },
  togetherai: {
    adapter: "openai",
    baseUrl: "https://api.together.xyz/v1",
  },
}
