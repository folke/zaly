// oxlint-disable import/no-named-as-default-member
import type { ModelsJson } from "@zaly/ai";
export const ModelsSchema = {
    version: "3.0",
    components: {
        schemas: {
            "ModelsJson.o1": {
                type: "object",
                properties: {},
                required: [],
                additionalProperties: {
                    type: "object",
                    properties: {
                        name: {
                            type: "string",
                            description: "Provider name *"
                        },
                        api: {
                            type: "string",
                            description: "Adapter family to use for this provider."
                        },
                        apiKey: {
                            type: "string"
                        },
                        baseUrl: {
                            type: "string",
                            description: "Base URL for API requests *"
                        },
                        doc: {
                            type: "string",
                            description: "Docs link for this provider's model list."
                        },
                        env: {
                            type: "array",
                            items: {
                                type: "string"
                            },
                            description: "Env-var names consulted for credentials, in priority order.\nThe first element is the conventional one (`OPENAI_API_KEY`\netc.); downstream entries are fallbacks."
                        },
                        headers: {
                            $ref: "#/components/schemas/Recordstringstring"
                        },
                        quirks: {
                            $ref: "#/components/schemas/Quirks"
                        },
                        models: {
                            type: "array",
                            items: {
                                $ref: "#/components/schemas/ModelInfo"
                            }
                        },
                        source: {
                            type: "string",
                            "enum": [
                                "models.dev",
                                "builtin",
                                "custom"
                            ]
                        },
                        replaceModels: {
                            type: "boolean"
                        }
                    },
                    required: []
                }
            },
            Recordstringstring: {
                type: "object",
                properties: {},
                required: [],
                description: "Construct a type with a set of properties K of type T",
                additionalProperties: {
                    type: "string"
                }
            },
            Quirks: {
                type: "object",
                properties: {
                    maxTokensField: {
                        type: "string",
                        "enum": [
                            "max_tokens",
                            "max_completion_tokens",
                            "max_output_tokens",
                            "none"
                        ],
                        description: "Which wire field carries the max-output-tokens cap, per adapter\nfamily.\n\nChat Completions:\n  - `\"max_tokens\"`            \u2014 legacy, most third-parties\n  - `\"max_completion_tokens\"` \u2014 newer OpenAI + reasoning models\n\nResponses:\n  - `\"max_output_tokens\"`     \u2014 public Responses API default\n\nAll families:\n  - `\"none\"` \u2014 suppress entirely. Codex backend rejects any\n    max-tokens field with `Unsupported parameter`."
                    },
                    thinkingFormat: {
                        type: "string",
                        "enum": [
                            "openai",
                            "openrouter",
                            "deepseek",
                            "zai",
                            "qwen",
                            "qwen-chat-template"
                        ],
                        description: "How the provider expects reasoning / thinking requests shaped.\n- `\"openai\"`              \u2192 `reasoning_effort: \"minimal|low|medium|high\"`\n- `\"openrouter\"`          \u2192 `reasoning: { effort }`\n- `\"deepseek\"`            \u2192 `thinking: { type: \"enabled\" }` + `reasoning_effort`\n- `\"zai\"` / `\"qwen\"`      \u2192 top-level `enable_thinking: boolean`\n- `\"qwen-chat-template\"`  \u2192 `chat_template_kwargs.enable_thinking`"
                    },
                    reasoningLevels: {
                        type: "array",
                        items: {
                            type: "string",
                            "enum": [
                                "off",
                                "minimal",
                                "low",
                                "medium",
                                "high",
                                "xhigh",
                                "max"
                            ]
                        },
                        description: "Which effort levels this model actually accepts. Adapter clamps\nunsupported values to the nearest supported one \u2014 `\"xhigh\"` on\npre-GPT-5.4 \u2192 `\"high\"`, `\"minimal\"` on o1/o3 \u2192 `\"low\"`. Unset\nmeans any level is accepted."
                    },
                    reasoningField: {
                        type: "string",
                        "enum": [
                            "reasoning",
                            "reasoning_content",
                            "reasoning_details"
                        ],
                        description: "Streaming delta field that carries reasoning tokens.\n- `\"reasoning\"` (OpenRouter, most third-parties)\n- `\"reasoning_content\"` (DeepSeek-ish)\n- `\"reasoning_details\"` (structured form on a few providers)\nIf unset, adapter accepts any of the three."
                    },
                    temperatureSupported: {
                        type: "boolean",
                        description: "Model accepts `temperature`. Default derived from\n`ModelInfo.temperature` (catalog field); set here to override."
                    },
                    strictTools: {
                        type: "boolean",
                        description: "Model supports `strict: true` on tool definitions. Default false."
                    },
                    responsesStore: {
                        type: "boolean",
                        description: "Whether the Responses API persists the response server-side\n(`store`). Default `true`. Codex backend requires `false`."
                    },
                    responsesInclude: {
                        type: "array",
                        items: {
                            type: "string"
                        },
                        description: "Extra fields to request on the response payload. Codex backend\nneeds `[\"reasoning.encrypted_content\"]` so the model can round-trip\nreasoning across turns."
                    },
                    responsesSystemAs: {
                        type: "string",
                        "enum": [
                            "input",
                            "instructions"
                        ],
                        description: "Where the durable system prompt lands.\n- `\"input\"` (default) \u2014 first item, `role: \"system\"` message.\n- `\"instructions\"` \u2014 top-level `instructions` field. Codex backend\n  rejects system messages in `input` and requires this."
                    },
                    responsesReasoningSummary: {
                        type: "string",
                        "enum": [
                            "off",
                            "auto",
                            "concise",
                            "detailed"
                        ],
                        description: "Reasoning summary verbosity for the Responses API. Default\n`\"auto\"`. `\"off\"` disables the summary stream."
                    },
                    friendlyErrors: {
                        type: "string",
                        "enum": [
                            "codex"
                        ],
                        description: "Friendly-error formatting for known endpoint shapes. `\"codex\"`\nparses ChatGPT usage-limit responses into a human message."
                    },
                    toolCallExtraContent: {
                        type: "string"
                    }
                },
                required: [],
                description: "Provider-specific wire quirks that \"OpenAI compatibility\" doesn't\nactually cover. Each field names an axis of variation with a\ntyped union of known shapes; adapters read these and dispatch.\n\nPopulated by `getModel` from `assets/quirks.json` \u2014 provider-level\ndefaults overlaid with per-model overrides. Users can further\noverride per-model via `addModels` or per-call via the request's\n`quirks` field.\n\nAdd new axes here as they surface; start minimal."
            },
            ModelInfo: {
                type: "object",
                properties: {
                    id: {
                        type: "string"
                    },
                    name: {
                        type: "string"
                    },
                    baseUrl: {
                        type: "string",
                        description: "Model specific baseUrl override *"
                    },
                    api: {
                        type: "string",
                        description: "adapter to use: anthropic, openai, openai-responses, etc."
                    },
                    input: {
                        type: "array",
                        items: {
                            $ref: "#/components/schemas/Modality"
                        },
                        description: "Input modalities this model accepts"
                    },
                    output: {
                        type: "array",
                        items: {
                            $ref: "#/components/schemas/Modality"
                        }
                    },
                    maxTokens: {
                        type: "number",
                        description: "Max output tokens this model accepts"
                    },
                    contextSize: {
                        type: "number",
                        description: "Max context size for this model"
                    },
                    reasoning: {
                        type: "boolean",
                        description: "Emits reasoning / thinking tokens."
                    },
                    knowledge: {
                        type: "string",
                        description: "Knowledge cutoff in `YYYY-MM` or `YYYY-MM-DD`."
                    },
                    release_date: {
                        type: "string",
                        description: "Release date in `YYYY-MM` or `YYYY-MM-DD`. Informational."
                    },
                    last_updated: {
                        type: "string",
                        description: "Last catalog update in `YYYY-MM` or `YYYY-MM-DD`. Informational."
                    },
                    open_weights: {
                        type: "boolean",
                        description: "Model weights are publicly released. Informational."
                    },
                    cost: {
                        $ref: "#/components/schemas/Costcontext_over_200kCostundefined",
                        description: "Pricing per million tokens. `context_over_200k` is the higher\ntier some providers bill for prompts over 200K tokens."
                    },
                    tool_call: {
                        type: "boolean",
                        description: "Supports tool calling. Informational \u2014 we filter non-tool models\nout of the generated catalog, so at runtime this is effectively\nalways true. Optional to make `addModels` ergonomic."
                    }
                },
                required: [
                    "id"
                ],
                description: "Metadata for one model. One-to-one with the models.dev `Model`\nschema. Loaded lazily per-provider via `getModel(id)` or eagerly\nvia `listModels()`.\n\nRuntime invariant enforced by the catalog (not by the TS type):\nwhen `reasoning === false`, `cost.reasoning` is absent."
            },
            Modality: {
                type: "string",
                "enum": [
                    "text",
                    "audio",
                    "image",
                    "video",
                    "pdf"
                ],
                description: "Input/output modality."
            },
            Costcontext_over_200kCostundefined: {
                type: "object",
                properties: {
                    input: {
                        type: "number"
                    },
                    output: {
                        type: "number"
                    },
                    reasoning: {
                        type: "number"
                    },
                    cache_read: {
                        type: "number"
                    },
                    cache_write: {
                        type: "number"
                    },
                    input_audio: {
                        type: "number"
                    },
                    output_audio: {
                        type: "number"
                    },
                    context_over_200k: {
                        $ref: "#/components/schemas/Cost"
                    }
                },
                required: [
                    "input",
                    "output"
                ]
            },
            Cost: {
                type: "object",
                properties: {
                    input: {
                        type: "number"
                    },
                    output: {
                        type: "number"
                    },
                    reasoning: {
                        type: "number"
                    },
                    cache_read: {
                        type: "number"
                    },
                    cache_write: {
                        type: "number"
                    },
                    input_audio: {
                        type: "number"
                    },
                    output_audio: {
                        type: "number"
                    }
                },
                required: [
                    "input",
                    "output"
                ],
                description: "Per-tier cost. Values are USD per **million tokens** (models.dev\nconvention). Optional fields are only present when the provider\npublishes distinct pricing for that axis."
            }
        }
    },
    schema: {
        type: "array",
        items: {
            oneOf: [
                {
                    $ref: "#/components/schemas/ModelsJson.o1"
                }
            ]
        },
        minItems: 1,
        maxItems: 1
    }
} as import("typia").IJsonSchemaUnit<"3.0">;
