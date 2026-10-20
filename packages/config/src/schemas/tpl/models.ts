import { Type } from "typebox"

const definitions = {
  Cost: Type.Object(
    {
      cache_read: Type.Optional(Type.Number()),
      cache_write: Type.Optional(Type.Number()),
      input: Type.Number(),
      input_audio: Type.Optional(Type.Number()),
      output: Type.Number(),
      output_audio: Type.Optional(Type.Number()),
      reasoning: Type.Optional(Type.Number()),
    },
    {
      additionalProperties: false,
      description:
        "Per-tier cost. Values are USD per **million tokens** (models.dev\nconvention). Optional fields are only present when the provider\npublishes distinct pricing for that axis.",
    }
  ),
  Headers: Type.Object({}, { additionalProperties: Type.String() }),
  Modality: Type.String({
    description: "Input/output modality.",
    enum: ["audio", "image", "pdf", "text", "video"],
  }),
  ModelCost: Type.Object(
    {
      cache_read: Type.Optional(Type.Number()),
      cache_write: Type.Optional(Type.Number()),
      context_over_200k: Type.Optional(Type.Ref("#/$defs/Cost")),
      input: Type.Number(),
      input_audio: Type.Optional(Type.Number()),
      output: Type.Number(),
      output_audio: Type.Optional(Type.Number()),
      reasoning: Type.Optional(Type.Number()),
    },
    { additionalProperties: false }
  ),
  ModelInfo: Type.Object(
    {
      api: Type.Optional(
        Type.String({ description: "adapter to use: anthropic, openai, openai-responses, etc." })
      ),
      baseUrl: Type.Optional(Type.String({ description: "Model specific baseUrl override *" })),
      contextSize: Type.Optional(Type.Number({ description: "Max context size for this model" })),
      cost: Type.Optional(
        Type.Ref("#/$defs/ModelCost", {
          description:
            "Pricing per million tokens. `context_over_200k` is the higher\ntier some providers bill for prompts over 200K tokens.",
        })
      ),
      id: Type.String(),
      input: Type.Optional(
        Type.Array(Type.Ref("#/$defs/Modality"), {
          description: "Input modalities this model accepts",
        })
      ),
      knowledge: Type.Optional(
        Type.String({ description: "Knowledge cutoff in `YYYY-MM` or `YYYY-MM-DD`." })
      ),
      last_updated: Type.Optional(
        Type.String({
          description: "Last catalog update in `YYYY-MM` or `YYYY-MM-DD`. Informational.",
        })
      ),
      maxTokens: Type.Optional(
        Type.Number({ description: "Max output tokens this model accepts" })
      ),
      name: Type.Optional(Type.String()),
      open_weights: Type.Optional(
        Type.Boolean({ description: "Model weights are publicly released. Informational." })
      ),
      output: Type.Optional(Type.Array(Type.Ref("#/$defs/Modality"))),
      reasoning: Type.Optional(Type.Boolean({ description: "Emits reasoning / thinking tokens." })),
      release_date: Type.Optional(
        Type.String({ description: "Release date in `YYYY-MM` or `YYYY-MM-DD`. Informational." })
      ),
      tool_call: Type.Optional(
        Type.Boolean({
          description:
            "Supports tool calling. Informational — we filter non-tool models\nout of the generated catalog, so at runtime this is effectively\nalways true. Optional to make `addModels` ergonomic.",
        })
      ),
    },
    {
      additionalProperties: false,
      description:
        "Metadata for one model. One-to-one with the models.dev `Model`\nschema. Loaded lazily per-provider via `getModel(id)` or eagerly\nvia `listModels()`.\n\nRuntime invariant enforced by the catalog (not by the TS type):\nwhen `reasoning === false`, `cost.reasoning` is absent.",
    }
  ),
  Quirks: Type.Object(
    {
      friendlyErrors: Type.Optional(
        Type.String({
          description:
            'Friendly-error formatting for known endpoint shapes. `"codex"`\nparses ChatGPT usage-limit responses into a human message.',
          enum: ["codex"],
        })
      ),
      maxTokensField: Type.Optional(
        Type.String({
          description:
            'Which wire field carries the max-output-tokens cap, per adapter\nfamily.\n\nChat Completions:\n  - `"max_tokens"`            — legacy, most third-parties\n  - `"max_completion_tokens"` — newer OpenAI + reasoning models\n\nResponses:\n  - `"max_output_tokens"`     — public Responses API default\n\nAll families:\n  - `"none"` — suppress entirely. Codex backend rejects any\n    max-tokens field with `Unsupported parameter`.',
          enum: ["max_completion_tokens", "max_output_tokens", "max_tokens", "none"],
        })
      ),
      reasoningField: Type.Optional(
        Type.String({
          description:
            'Streaming delta field that carries reasoning tokens.\n- `"reasoning"` (OpenRouter, most third-parties)\n- `"reasoning_content"` (DeepSeek-ish)\n- `"reasoning_details"` (structured form on a few providers)\nIf unset, adapter accepts any of the three.',
          enum: ["reasoning", "reasoning_content", "reasoning_details"],
        })
      ),
      reasoningLevels: Type.Optional(
        Type.Array(
          Type.String({ enum: ["high", "low", "max", "medium", "minimal", "off", "xhigh"] }),
          {
            description:
              'Which effort levels this model actually accepts. Adapter clamps\nunsupported values to the nearest supported one — `"xhigh"` on\npre-GPT-5.4 → `"high"`, `"minimal"` on o1/o3 → `"low"`. Unset\nmeans any level is accepted.',
          }
        )
      ),
      responsesInclude: Type.Optional(
        Type.Array(Type.String(), {
          description:
            'Extra fields to request on the response payload. Codex backend\nneeds `["reasoning.encrypted_content"]` so the model can round-trip\nreasoning across turns.',
        })
      ),
      responsesReasoningSummary: Type.Optional(
        Type.String({
          description:
            'Reasoning summary verbosity for the Responses API. Default\n`"auto"`. `"off"` disables the summary stream.',
          enum: ["auto", "concise", "detailed", "off"],
        })
      ),
      responsesStore: Type.Optional(
        Type.Boolean({
          description:
            "Whether the Responses API persists the response server-side\n(`store`). Default `true`. Codex backend requires `false`.",
        })
      ),
      responsesSystemAs: Type.Optional(
        Type.String({
          description:
            'Where the durable system prompt lands.\n- `"input"` (default) — first item, `role: "system"` message.\n- `"instructions"` — top-level `instructions` field. Codex backend\n  rejects system messages in `input` and requires this.',
          enum: ["input", "instructions"],
        })
      ),
      sessionHeader: Type.Optional(
        Type.String({
          description: "Header carrying the conversation identity. Independent of prompt caching.",
        })
      ),
      strictTools: Type.Optional(
        Type.Boolean({
          description: "Model supports `strict: true` on tool definitions. Default false.",
        })
      ),
      temperatureSupported: Type.Optional(
        Type.Boolean({
          description:
            "Model accepts `temperature`. Default derived from\n`ModelInfo.temperature` (catalog field); set here to override.",
        })
      ),
      thinkingFormat: Type.Optional(
        Type.String({
          description:
            'How the provider expects reasoning / thinking requests shaped.\n- `"openai"`              → `reasoning_effort: "minimal|low|medium|high"`\n- `"openrouter"`          → `reasoning: { effort }`\n- `"deepseek"`            → `thinking: { type: "enabled" }` + `reasoning_effort`\n- `"zai"` / `"qwen"`      → top-level `enable_thinking: boolean`\n- `"qwen-chat-template"`  → `chat_template_kwargs.enable_thinking`',
          enum: ["deepseek", "openai", "openrouter", "qwen", "qwen-chat-template", "zai"],
        })
      ),
      toolCallExtraContent: Type.Optional(Type.String()),
    },
    {
      additionalProperties: false,
      description:
        "Provider-specific wire quirks that \"OpenAI compatibility\" doesn't\nactually cover. Each field names an axis of variation with a\ntyped union of known shapes; adapters read these and dispatch.\n\nPopulated by `getModel` from `assets/quirks.json` — provider-level\ndefaults overlaid with per-model overrides. Users can further\noverride per-model via `addModels` or per-call via the request's\n`quirks` field.\n\nAdd new axes here as they surface; start minimal.",
    }
  ),
}

export const schema = Type.Object(
  {},
  {
    $defs: definitions,
    $schema: "http://json-schema.org/draft-07/schema#",
    additionalProperties: Type.Object(
      {
        api: Type.Optional(
          Type.String({ description: "Adapter family to use for this provider." })
        ),
        apiKey: Type.Optional(Type.String()),
        baseUrl: Type.Optional(Type.String({ description: "Base URL for API requests *" })),
        doc: Type.Optional(
          Type.String({ description: "Docs link for this provider's model list." })
        ),
        env: Type.Optional(
          Type.Array(Type.String(), {
            description:
              "Env-var names consulted for credentials, in priority order.\nThe first element is the conventional one (`OPENAI_API_KEY`\netc.); downstream entries are fallbacks.",
          })
        ),
        headers: Type.Optional(Type.Ref("#/$defs/Headers")),
        models: Type.Optional(Type.Array(Type.Ref("#/$defs/ModelInfo"))),
        name: Type.Optional(Type.String({ description: "Provider name *" })),
        quirks: Type.Optional(Type.Ref("#/$defs/Quirks")),
        replaceModels: Type.Optional(Type.Boolean()),
        source: Type.Optional(
          Type.String({ enum: ["builtin", "custom", "models.dev", "models.json"] })
        ),
      },
      { additionalProperties: false }
    ),
  }
)
