import type { TypiaConfig } from "../../types.ts";
export const ConfigSchema = {
    version: "3.0",
    components: {
        schemas: {
            "TypiaConfig.o1": {
                type: "object",
                properties: {
                    model: {
                        type: "string"
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
                        ]
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
                            tree: {
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
                    actions: {
                        type: "object",
                        properties: {
                            commandPrefix: {
                                type: "boolean",
                                description: "Prefix command actions as `/command:COMMAND_NAME`. Defaults to false, e.g. `/COMMAND_NAME`."
                            },
                            skillPrefix: {
                                type: "boolean",
                                description: "Prefix skill actions as `/skill:SKILL_NAME`. Defaults to true, e.g. `/skill:SKILL_NAME`."
                            }
                        },
                        required: []
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
                                ]
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
                            oneOf: [
                                {
                                    type: "string"
                                },
                                {
                                    $ref: "#/components/schemas/PluginConfig"
                                }
                            ]
                        }
                    },
                    secrets: {
                        $ref: "#/components/schemas/AuthSecrets"
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
            PluginConfig: {
                type: "object",
                properties: {
                    uri: {
                        type: "string",
                        description: "Path to the plugin, either a local path or a remote URI."
                    },
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
                        description: "When set, exclude the resources, matching these paths/globs from the plugin.\nExclude is applied after include."
                    }
                },
                required: [
                    "uri"
                ]
            },
            AuthSecrets: {
                type: "object",
                properties: {},
                required: [],
                additionalProperties: {
                    $ref: "#/components/schemas/Secret"
                }
            },
            Secret: {
                oneOf: [
                    {
                        type: "object",
                        properties: {
                            source: {
                                type: "string",
                                "enum": [
                                    "env"
                                ]
                            },
                            key: {
                                type: "string"
                            }
                        },
                        required: [
                            "source",
                            "key"
                        ]
                    },
                    {
                        type: "object",
                        properties: {
                            source: {
                                type: "string",
                                "enum": [
                                    "exec"
                                ]
                            },
                            cmd: {
                                type: "string"
                            },
                            args: {
                                type: "array",
                                items: {
                                    type: "string"
                                }
                            }
                        },
                        required: [
                            "source",
                            "cmd"
                        ]
                    },
                    {
                        type: "object",
                        properties: {
                            source: {
                                type: "string",
                                "enum": [
                                    "file"
                                ]
                            },
                            path: {
                                type: "string"
                            }
                        },
                        required: [
                            "source",
                            "path"
                        ]
                    },
                    {
                        type: "object",
                        properties: {
                            source: {
                                type: "string",
                                "enum": [
                                    "literal"
                                ]
                            },
                            value: {
                                type: "string"
                            }
                        },
                        required: [
                            "source",
                            "value"
                        ]
                    }
                ]
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
