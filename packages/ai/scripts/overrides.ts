import type { BuiltinProvider } from "../src/providers/index.ts"
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
import type { ModelInfo, ProviderInfo, Quirks } from "../src/types.ts"

export interface ProviderOverride {
  adapter?: BuiltinProvider
  baseUrl?: string
  headers?: Record<string, string>
  quirks?: Quirks
  modelQuirks?: Record<string, Quirks>
  transform?: (info: ModelInfo, provider: ProviderInfo) => ModelInfo | undefined
  /** Synthesize a provider entry by cloning models from existing
   *  providers. Each rule is `<source-provider>/<model-id-regex>` —
   *  every model in the source provider whose id matches the regex
   *  is copied under this provider's id with `adapter` / `baseUrl` /
   *  `headers` / `quirks` from this override applied on top.
   *
   *  Cloning never overwrites: if a model with the resulting id
   *  already exists (e.g. from a prior clone rule, or a future
   *  models.dev catalog entry), it's left alone. */
  clone?: (string | RegExp)[]
  /** Human-readable name for a synthetic (cloned) provider — only
   *  used when this override has `clone` set. Falls through to the
   *  override key if absent. */
  name?: string
  /** Docs URL for a synthetic provider's `ProviderInfo.doc`. */
  doc?: string
  /** Env-var fallbacks for a synthetic provider. Default `[]` —
   *  cloned providers usually authenticate via OAuth (`codexAuth`,
   *  …), not env. */
  env?: string[]
}

export const overrides: Record<string, ProviderOverride> = {
  // ── Native OpenAI ─────────────────────────────────────────────────
  openai: {
    quirks: {
      maxTokensField: "max_completion_tokens",
      thinkingFormat: "openai",
    },
  },

  // ── OpenAI Codex (ChatGPT subscription backend) ─────────────────────
  // Synthetic provider that clones the codex-family models from the
  // openai catalog and routes them at the chatgpt.com backend used by
  // codex CLI. Auth comes from `codexAuth` (PKCE, see `loginCodex`),
  // not env. Clone rules are intentionally pattern-based so newly
  // released codex variants get picked up automatically.
  "openai-codex": {
    adapter: "openai-responses",
    baseUrl: "https://chatgpt.com/backend-api/codex",
    // The codex backend serves the codex-family models plus a curated
    // set of mainline gpt-5.x reasoning models. Pattern catches future
    // codex variants automatically; the explicit entries cover the
    // dual-routed mainline models. New mainline GPT-5.x reasoning
    // models would need to be added here as they release.
    clone: [
      /^openai\/.*codex.*/,
      "openai/gpt-5.1",
      "openai/gpt-5.2",
      "openai/gpt-5.4",
      "openai/gpt-5.4-mini",
      "openai/gpt-5.5",
    ],
    doc: "https://platform.openai.com/docs/models",
    name: "OpenAI Codex (ChatGPT)",
    quirks: {
      friendlyErrors: "codex",
      maxTokensField: "none",
      responsesInclude: ["reasoning.encrypted_content"],
      responsesStore: false,
      responsesSystemAs: "instructions",
    },
    transform: (info: ModelInfo) => ({
      ...info,
      // codex models have a hard 270k context cap
      limit: { ...info.limit, context: Math.min(270_000, info.limit.context) },
    }),
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
