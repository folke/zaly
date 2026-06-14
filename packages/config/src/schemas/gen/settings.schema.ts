import type { TypiaSettings } from "../../types.ts";
export const SettingsSchema = {
    version: "3.0",
    components: {
        schemas: {
            "TypiaSettings.o1": {
                type: "object",
                properties: {
                    $schema: {
                        type: "string"
                    },
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
                    theme: {
                        type: "string",
                        description: "Theme name or path to custom theme file"
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
                    resources: {
                        type: "object",
                        properties: {
                            packs: {
                                oneOf: [
                                    {
                                        type: "array",
                                        items: {
                                            type: "string"
                                        }
                                    },
                                    {
                                        type: "boolean",
                                        "enum": [
                                            false
                                        ]
                                    }
                                ]
                            },
                            plugins: {
                                oneOf: [
                                    {
                                        type: "array",
                                        items: {
                                            type: "string"
                                        }
                                    },
                                    {
                                        type: "boolean",
                                        "enum": [
                                            false
                                        ]
                                    }
                                ]
                            },
                            skills: {
                                oneOf: [
                                    {
                                        type: "array",
                                        items: {
                                            type: "string"
                                        }
                                    },
                                    {
                                        type: "boolean",
                                        "enum": [
                                            false
                                        ]
                                    }
                                ]
                            },
                            themes: {
                                oneOf: [
                                    {
                                        type: "array",
                                        items: {
                                            type: "string"
                                        }
                                    },
                                    {
                                        type: "boolean",
                                        "enum": [
                                            false
                                        ]
                                    }
                                ]
                            },
                            commands: {
                                oneOf: [
                                    {
                                        type: "array",
                                        items: {
                                            type: "string"
                                        }
                                    },
                                    {
                                        type: "boolean",
                                        "enum": [
                                            false
                                        ]
                                    }
                                ]
                            }
                        },
                        required: []
                    },
                    secrets: {
                        $ref: "#/components/schemas/AuthSecrets"
                    },
                    keymap: {
                        $ref: "#/components/schemas/Recordstringstringstring"
                    }
                },
                required: []
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
                    $ref: "#/components/schemas/TypiaSettings.o1"
                }
            ]
        },
        minItems: 1,
        maxItems: 1
    }
} as import("typia").IJsonSchemaUnit<"3.0">;
