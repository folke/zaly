import type { TypiaConfig } from "../../types.ts";
export const ConfigSchema = {
    version: "3.0",
    components: {
        schemas: {
            "TypiaConfig.o1": {
                type: "object",
                properties: {
                    model: {
                        type: "string",
                        description: "Defaul model to use for the agent *"
                    },
                    reasoning: {
                        type: "string",
                        "enum": [
                            "off",
                            "minimal",
                            "low",
                            "medium",
                            "high",
                            "xhigh",
                            "max"
                        ],
                        description: "Default reasoning effort *"
                    },
                    tools: {
                        type: "array",
                        items: {
                            type: "string"
                        }
                    },
                    ui: {
                        type: "object",
                        properties: {
                            mode: {
                                type: "string",
                                "enum": [
                                    "scrollback",
                                    "fullscreen"
                                ],
                                description: "scrollback: preserves terminal scrollback/search; footer scrolls away with mouse wheel because the terminal is scrolling\n/* fullscreen: alternate screen + mouse; footer stays fixed; dedicated app viewport"
                            },
                            collapsedTools: {
                                type: "array",
                                items: {
                                    $ref: "#/components/schemas/AnyTool"
                                },
                                description: "Tools whose result body should be hidden in the UI."
                            },
                            images: {
                                type: "boolean",
                                description: "Render images, if supported by the terminal"
                            },
                            listHeight: {
                                type: "number",
                                description: "Maximum number of visible rows in selection lists, like pickers and autocomplete."
                            },
                            reasoning: {
                                type: "boolean",
                                description: "Whether to show the reasoning trace in the UI."
                            },
                            theme: {
                                type: "string",
                                description: "Theme name or path to custom theme file"
                            },
                            sessionTree: {
                                type: "array",
                                items: {
                                    type: "string",
                                    "enum": [
                                        "reasoning",
                                        "tools",
                                        "system",
                                        "assistant"
                                    ]
                                },
                                description: "What messages to show in the session tree. Defaults to assistant, reasoning, and tools."
                            },
                            treeHeight: {
                                type: "number",
                                description: "Maximum number of visible rows in the session tree."
                            }
                        },
                        required: []
                    },
                    skills: {
                        type: "object",
                        properties: {
                            enabled: {
                                type: "boolean",
                                description: "Allow skills to be used by the agent. Defaults to true."
                            },
                            actions: {
                                type: "boolean",
                                description: "Show skill actions. Defaults to true."
                            },
                            actionPrefix: {
                                type: "string",
                                description: "Prefix for command actions. Defaults to `skill:`, e.g `/skill:SKILL_NAME`"
                            }
                        },
                        required: []
                    },
                    commands: {
                        type: "object",
                        properties: {
                            actionPrefix: {
                                type: "string",
                                description: "Prefix for command actions. Defaults to ``"
                            },
                            bash: {
                                type: "boolean",
                                description: "Allow bash execution in commands. Defaults to true."
                            },
                            expr: {
                                type: "boolean",
                                description: "Allow js expressions in command templates. Defaults to true."
                            }
                        },
                        required: [],
                        description: "Template commands *"
                    },
                    compaction: {
                        type: "object",
                        properties: {
                            enabled: {
                                type: "boolean",
                                description: "Enable automatic compaction when context is full"
                            },
                            keepTokens: {
                                type: "number",
                                description: "Existing messages up to this many tokens will be preserved in the context"
                            },
                            reasoning: {
                                type: "string",
                                "enum": [
                                    "off",
                                    "minimal",
                                    "low",
                                    "medium",
                                    "high",
                                    "xhigh",
                                    "max"
                                ],
                                description: "Reasoning effort for the compaction summary"
                            },
                            summaryTokens: {
                                type: "number",
                                description: "Maximum number of tokens to use for the generated summary"
                            },
                            threshold: {
                                type: "number",
                                description: "Threshold for automatic compaction."
                            }
                        },
                        required: []
                    },
                    masking: {
                        type: "object",
                        properties: {
                            enabled: {
                                type: "boolean",
                                description: "Whether to enable masking. Defaults to true."
                            },
                            minTokens: {
                                type: "number",
                                description: "Don't mask tool-result parts whose original content is shorter\nthan this (estimated tokens). Skips tiny \"ok\"-style success\nmessages where the stub would be larger than the original.\nDoesn't apply to attachments (always worth masking)."
                            },
                            keepTurns: {
                                type: "number",
                                description: "How many turns to keep in the tail of the conversation, regardless\nof score. Defaults to 20."
                            },
                            delta: {
                                type: "number",
                                description: "How far above the target ratio to trigger a new masking pass.\nDefaults to 0.25 (25%)."
                            },
                            target: {
                                type: "number",
                                description: "Target ratio of used/limit tokens to reach by masking. Defaults to 0.5 (50%)."
                            }
                        },
                        required: []
                    },
                    permissions: {
                        type: "object",
                        properties: {
                            preset: {
                                type: "string",
                                "enum": [
                                    "strict",
                                    "readonly",
                                    "permissive",
                                    "yolo"
                                ],
                                description: "Permissions preset to use. Defaults to \"permissive\"."
                            },
                            allow: {
                                type: "array",
                                items: {
                                    type: "string"
                                }
                            },
                            deny: {
                                type: "array",
                                items: {
                                    type: "string"
                                }
                            },
                            ask: {
                                type: "array",
                                items: {
                                    type: "string"
                                }
                            }
                        },
                        required: []
                    },
                    plugins: {
                        type: "array",
                        items: {
                            type: "string"
                        }
                    },
                    resources: {
                        $ref: "#/components/schemas/RecordstringResourceFilter",
                        description: "Resource configuration for zaly."
                    },
                    system: {
                        type: "object",
                        properties: {
                            bash: {
                                type: "array",
                                items: {
                                    type: "string"
                                },
                                description: "Command used by the bash tool."
                            },
                            git: {
                                type: "array",
                                items: {
                                    type: "string"
                                },
                                description: "Command used for git packs."
                            },
                            npm: {
                                type: "array",
                                items: {
                                    type: "string"
                                },
                                description: "Package manager command used for npm packs."
                            }
                        },
                        required: [],
                        description: "System integrations and external commands used by zaly."
                    },
                    $schema: {
                        type: "string"
                    },
                    keymap: {
                        $ref: "#/components/schemas/Recordstringstringstring"
                    }
                },
                required: []
            },
            AnyTool: {
                type: "string"
            },
            RecordstringResourceFilter: {
                type: "object",
                properties: {},
                required: [],
                description: "Construct a type with a set of properties K of type T",
                additionalProperties: {
                    $ref: "#/components/schemas/ResourceFilter"
                }
            },
            ResourceFilter: {
                type: "object",
                properties: {
                    enabled: {
                        type: "boolean",
                        description: "Whether the plugin is enabled. Defaults to true."
                    },
                    include: {
                        type: "array",
                        items: {
                            type: "string"
                        },
                        description: "When set, only include the resources, matching these paths/globs from the plugin."
                    },
                    exclude: {
                        type: "array",
                        items: {
                            type: "string"
                        },
                        description: "When set, exclude the resources, matching these paths/globs from the plugin.\nAdd a resource type to the exclude list to disable that resource type. For example,\n`[\"skills\"]` will disable all skills from the plugin.\nExclude is applied after include."
                    }
                },
                required: []
            },
            Recordstringstringstring: {
                type: "object",
                properties: {},
                required: [],
                description: "Construct a type with a set of properties K of type T",
                additionalProperties: {
                    oneOf: [
                        {
                            type: "string"
                        },
                        {
                            type: "array",
                            items: {
                                type: "string"
                            }
                        }
                    ]
                }
            }
        }
    },
    schema: {
        type: "array",
        items: {
            oneOf: [
                {
                    $ref: "#/components/schemas/TypiaConfig.o1"
                }
            ]
        },
        minItems: 1,
        maxItems: 1
    }
} as import("typia").IJsonSchemaUnit<"3.0">;
