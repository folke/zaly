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
                            "xhigh"
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
                            prompts: {
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
                    bindings: {
                        $ref: "#/components/schemas/PartialRecordinput.cursorDowninput.cursorLeftinput.cursorLineEndinput.cursorLineStartinput.cursorRightinput.cursorUpinput.deleteCharBackinput.deleteCharForward...11more...global.quitstringstring"
                    }
                },
                required: []
            },
            "PartialRecordinput.cursorDowninput.cursorLeftinput.cursorLineEndinput.cursorLineStartinput.cursorRightinput.cursorUpinput.deleteCharBackinput.deleteCharForward...11more...global.quitstringstring": {
                type: "object",
                properties: {
                    "input.cursorDown": {
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
                    },
                    "input.cursorLeft": {
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
                    },
                    "input.cursorLineEnd": {
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
                    },
                    "input.cursorLineStart": {
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
                    },
                    "input.cursorRight": {
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
                    },
                    "input.cursorUp": {
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
                    },
                    "input.deleteCharBack": {
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
                    },
                    "input.deleteCharForward": {
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
                    },
                    "input.deleteWordBack": {
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
                    },
                    "input.insertNewline": {
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
                    },
                    "input.insertTab": {
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
                    },
                    "input.paste": {
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
                    },
                    "input.submit": {
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
                    },
                    "menu.cancel": {
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
                    },
                    "menu.first": {
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
                    },
                    "menu.last": {
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
                    },
                    "menu.next": {
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
                    },
                    "menu.prev": {
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
                    },
                    "menu.select": {
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
                    },
                    "global.quit": {
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
                },
                required: [],
                description: "Make all properties in T optional"
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
