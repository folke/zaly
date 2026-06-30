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

import type { ModelInfo, ModelProvider } from "../types.ts"
import type { ModelCatalog } from "./catalog.ts"

export const modelProviders: Record<string, ModelProvider> = {
  // ── OpenAI Codex (ChatGPT subscription backend) ─────────────────────
  // Synthetic provider that clones the codex-family models from the
  // openai catalog and routes them at the chatgpt.com backend used by
  // codex CLI. Auth comes from `codexAuth` (PKCE, see `loginCodex`),
  // not env. Clone rules are intentionally pattern-based so newly
  // released codex variants get picked up automatically.
  // oxlint-disable-next-line sort-keys
  "openai-codex": {
    id: "openai-codex",
    api: "openai-responses",
    baseUrl: "https://chatgpt.com/backend-api/codex",
    doc: "https://platform.openai.com/docs/models",
    name: "OpenAI Codex (ChatGPT Plus/Pro)",
    quirks: {
      friendlyErrors: "codex",
      maxTokensField: "none",
      responsesInclude: ["reasoning.encrypted_content"],
      responsesStore: false,
      responsesSystemAs: "instructions",
    },
    oauth: async () => import("../auth/openai-codex.ts").then((m) => m.codexOauth),
    // The codex backend serves the codex-family models plus a curated
    // set of mainline gpt-5.x reasoning models. Pattern catches future
    // codex variants automatically; the explicit entries cover the
    // dual-routed mainline models. New mainline GPT-5.x reasoning
    // models would need to be added here as they release.
    models: async (catalog: ModelCatalog) => {
      const models: ModelInfo[] = []
      const openai = catalog.provider("openai")
      if (!openai) return []
      const rules = [
        /^openai\/.*codex.*/,
        "openai/gpt-5.1",
        "openai/gpt-5.2",
        "openai/gpt-5.4",
        "openai/gpt-5.4-mini",
        "openai/gpt-5.5",
      ]
      const matches = (fullId: string): boolean => {
        for (const rule of rules) {
          if (typeof rule === "string" ? rule === fullId : rule.test(fullId)) return true
        }
        return false
      }
      const openaiModels =
        typeof openai.models === "function" ? await openai.models(catalog) : openai.models
      for (const m of openaiModels) {
        if (!matches(`openai/${m.id}`)) continue
        models.push({
          ...m,
          contextSize: Math.min(270_000, m.contextSize), // codex backend has a 270k context limit
        })
      }
      return models
    },
  },
}

// oxlint-disable-next-line sort-keys
export const overrides: Record<string, Partial<ModelProvider> | undefined> = {
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
    api: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  xai: {
    api: "openai",
    baseUrl: "https://api.x.ai/v1",
  },
  groq: {
    api: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
  },
  mistral: {
    api: "openai",
    baseUrl: "https://api.mistral.ai/v1",
  },
  cohere: {
    api: "openai",
    baseUrl: "https://api.cohere.com/compatibility/v1",
  },
  togetherai: {
    api: "openai",
    baseUrl: "https://api.together.xyz/v1",
  },
}
