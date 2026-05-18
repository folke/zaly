import type { Settings } from "../../types.ts";
export const SettingsSchema = {
    version: "3.0",
    components: {
        schemas: {
            "Settings.o1": {
                type: "object",
                properties: {
                    $schema: {
                        type: "string"
                    },
                    agent: {
                        type: "object",
                        properties: {},
                        required: []
                    },
                    ui: {
                        type: "object",
                        properties: {
                            theme: {
                                type: "string",
                                description: "Theme name or path to custom theme file"
                            }
                        },
                        required: []
                    },
                    resources: {
                        type: "object",
                        properties: {
                            packs: {
                                type: "array",
                                items: {
                                    type: "string"
                                }
                            },
                            plugins: {
                                type: "array",
                                items: {
                                    type: "string"
                                }
                            },
                            skills: {
                                type: "array",
                                items: {
                                    type: "string"
                                }
                            },
                            themes: {
                                type: "array",
                                items: {
                                    type: "string"
                                }
                            },
                            prompts: {
                                type: "array",
                                items: {
                                    type: "string"
                                }
                            }
                        },
                        required: []
                    }
                },
                required: []
            }
        }
    },
    schema: {
        type: "array",
        items: {
            oneOf: [
                {
                    $ref: "#/components/schemas/Settings.o1"
                }
            ]
        },
        minItems: 1,
        maxItems: 1
    }
} as import("typia").IJsonSchemaUnit<"3.0">;
