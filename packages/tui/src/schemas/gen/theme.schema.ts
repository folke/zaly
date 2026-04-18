import type { Theme } from "../../style/theme.ts";
export const ThemeSchema = {
    version: "3.0",
    components: {
        schemas: {
            "Theme.o1": {
                type: "object",
                properties: {
                    fg: {
                        $ref: "#/components/schemas/Color"
                    },
                    bg: {
                        $ref: "#/components/schemas/Color"
                    },
                    muted: {
                        $ref: "#/components/schemas/Color"
                    },
                    dim: {
                        $ref: "#/components/schemas/Color"
                    },
                    primary: {
                        $ref: "#/components/schemas/Color"
                    },
                    accent: {
                        $ref: "#/components/schemas/Color"
                    },
                    ok: {
                        $ref: "#/components/schemas/Color"
                    },
                    warn: {
                        $ref: "#/components/schemas/Color"
                    },
                    err: {
                        $ref: "#/components/schemas/Color"
                    },
                    border: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    borderTitle: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdHeading: {
                        $ref: "#/components/schemas/ThemeValue",
                        description: "Fallback heading style applied when a specific `mdHeading{N}` slot is\nnot set on the theme. Always required so any heading level renders."
                    },
                    mdHeading1: {
                        oneOf: [
                            {
                                type: "string",
                                pattern: "^(#(.*))",
                                "enum": [
                                    "black",
                                    "red",
                                    "green",
                                    "yellow",
                                    "blue",
                                    "magenta",
                                    "cyan",
                                    "white",
                                    "gray",
                                    "grey",
                                    "brightBlack",
                                    "brightRed",
                                    "brightGreen",
                                    "brightYellow",
                                    "brightBlue",
                                    "brightMagenta",
                                    "brightCyan",
                                    "brightWhite",
                                    "brightGray",
                                    "brightGrey",
                                    "fg",
                                    "bg",
                                    "muted",
                                    "dim",
                                    "primary",
                                    "accent",
                                    "ok",
                                    "warn",
                                    "err",
                                    "border",
                                    "borderTitle",
                                    "mdHeading",
                                    "mdHeading1",
                                    "mdHeading2",
                                    "mdHeading3",
                                    "mdHeading4",
                                    "mdHeading5",
                                    "mdHeading6",
                                    "mdStrong",
                                    "mdEmphasis",
                                    "mdStrikethrough",
                                    "mdCode",
                                    "mdCodeBlock",
                                    "mdCodeBlockTitle",
                                    "mdLink",
                                    "mdBlockquote",
                                    "mdList",
                                    "mdListChecked",
                                    "mdListUnchecked",
                                    "mdHr",
                                    "mdTable",
                                    "mdTableHeader",
                                    "inherit"
                                ]
                            },
                            {
                                $ref: "#/components/schemas/Style"
                            }
                        ]
                    },
                    mdHeading2: {
                        oneOf: [
                            {
                                type: "string",
                                pattern: "^(#(.*))",
                                "enum": [
                                    "black",
                                    "red",
                                    "green",
                                    "yellow",
                                    "blue",
                                    "magenta",
                                    "cyan",
                                    "white",
                                    "gray",
                                    "grey",
                                    "brightBlack",
                                    "brightRed",
                                    "brightGreen",
                                    "brightYellow",
                                    "brightBlue",
                                    "brightMagenta",
                                    "brightCyan",
                                    "brightWhite",
                                    "brightGray",
                                    "brightGrey",
                                    "fg",
                                    "bg",
                                    "muted",
                                    "dim",
                                    "primary",
                                    "accent",
                                    "ok",
                                    "warn",
                                    "err",
                                    "border",
                                    "borderTitle",
                                    "mdHeading",
                                    "mdHeading1",
                                    "mdHeading2",
                                    "mdHeading3",
                                    "mdHeading4",
                                    "mdHeading5",
                                    "mdHeading6",
                                    "mdStrong",
                                    "mdEmphasis",
                                    "mdStrikethrough",
                                    "mdCode",
                                    "mdCodeBlock",
                                    "mdCodeBlockTitle",
                                    "mdLink",
                                    "mdBlockquote",
                                    "mdList",
                                    "mdListChecked",
                                    "mdListUnchecked",
                                    "mdHr",
                                    "mdTable",
                                    "mdTableHeader",
                                    "inherit"
                                ]
                            },
                            {
                                $ref: "#/components/schemas/Style"
                            }
                        ]
                    },
                    mdHeading3: {
                        oneOf: [
                            {
                                type: "string",
                                pattern: "^(#(.*))",
                                "enum": [
                                    "black",
                                    "red",
                                    "green",
                                    "yellow",
                                    "blue",
                                    "magenta",
                                    "cyan",
                                    "white",
                                    "gray",
                                    "grey",
                                    "brightBlack",
                                    "brightRed",
                                    "brightGreen",
                                    "brightYellow",
                                    "brightBlue",
                                    "brightMagenta",
                                    "brightCyan",
                                    "brightWhite",
                                    "brightGray",
                                    "brightGrey",
                                    "fg",
                                    "bg",
                                    "muted",
                                    "dim",
                                    "primary",
                                    "accent",
                                    "ok",
                                    "warn",
                                    "err",
                                    "border",
                                    "borderTitle",
                                    "mdHeading",
                                    "mdHeading1",
                                    "mdHeading2",
                                    "mdHeading3",
                                    "mdHeading4",
                                    "mdHeading5",
                                    "mdHeading6",
                                    "mdStrong",
                                    "mdEmphasis",
                                    "mdStrikethrough",
                                    "mdCode",
                                    "mdCodeBlock",
                                    "mdCodeBlockTitle",
                                    "mdLink",
                                    "mdBlockquote",
                                    "mdList",
                                    "mdListChecked",
                                    "mdListUnchecked",
                                    "mdHr",
                                    "mdTable",
                                    "mdTableHeader",
                                    "inherit"
                                ]
                            },
                            {
                                $ref: "#/components/schemas/Style"
                            }
                        ]
                    },
                    mdHeading4: {
                        oneOf: [
                            {
                                type: "string",
                                pattern: "^(#(.*))",
                                "enum": [
                                    "black",
                                    "red",
                                    "green",
                                    "yellow",
                                    "blue",
                                    "magenta",
                                    "cyan",
                                    "white",
                                    "gray",
                                    "grey",
                                    "brightBlack",
                                    "brightRed",
                                    "brightGreen",
                                    "brightYellow",
                                    "brightBlue",
                                    "brightMagenta",
                                    "brightCyan",
                                    "brightWhite",
                                    "brightGray",
                                    "brightGrey",
                                    "fg",
                                    "bg",
                                    "muted",
                                    "dim",
                                    "primary",
                                    "accent",
                                    "ok",
                                    "warn",
                                    "err",
                                    "border",
                                    "borderTitle",
                                    "mdHeading",
                                    "mdHeading1",
                                    "mdHeading2",
                                    "mdHeading3",
                                    "mdHeading4",
                                    "mdHeading5",
                                    "mdHeading6",
                                    "mdStrong",
                                    "mdEmphasis",
                                    "mdStrikethrough",
                                    "mdCode",
                                    "mdCodeBlock",
                                    "mdCodeBlockTitle",
                                    "mdLink",
                                    "mdBlockquote",
                                    "mdList",
                                    "mdListChecked",
                                    "mdListUnchecked",
                                    "mdHr",
                                    "mdTable",
                                    "mdTableHeader",
                                    "inherit"
                                ]
                            },
                            {
                                $ref: "#/components/schemas/Style"
                            }
                        ]
                    },
                    mdHeading5: {
                        oneOf: [
                            {
                                type: "string",
                                pattern: "^(#(.*))",
                                "enum": [
                                    "black",
                                    "red",
                                    "green",
                                    "yellow",
                                    "blue",
                                    "magenta",
                                    "cyan",
                                    "white",
                                    "gray",
                                    "grey",
                                    "brightBlack",
                                    "brightRed",
                                    "brightGreen",
                                    "brightYellow",
                                    "brightBlue",
                                    "brightMagenta",
                                    "brightCyan",
                                    "brightWhite",
                                    "brightGray",
                                    "brightGrey",
                                    "fg",
                                    "bg",
                                    "muted",
                                    "dim",
                                    "primary",
                                    "accent",
                                    "ok",
                                    "warn",
                                    "err",
                                    "border",
                                    "borderTitle",
                                    "mdHeading",
                                    "mdHeading1",
                                    "mdHeading2",
                                    "mdHeading3",
                                    "mdHeading4",
                                    "mdHeading5",
                                    "mdHeading6",
                                    "mdStrong",
                                    "mdEmphasis",
                                    "mdStrikethrough",
                                    "mdCode",
                                    "mdCodeBlock",
                                    "mdCodeBlockTitle",
                                    "mdLink",
                                    "mdBlockquote",
                                    "mdList",
                                    "mdListChecked",
                                    "mdListUnchecked",
                                    "mdHr",
                                    "mdTable",
                                    "mdTableHeader",
                                    "inherit"
                                ]
                            },
                            {
                                $ref: "#/components/schemas/Style"
                            }
                        ]
                    },
                    mdHeading6: {
                        oneOf: [
                            {
                                type: "string",
                                pattern: "^(#(.*))",
                                "enum": [
                                    "black",
                                    "red",
                                    "green",
                                    "yellow",
                                    "blue",
                                    "magenta",
                                    "cyan",
                                    "white",
                                    "gray",
                                    "grey",
                                    "brightBlack",
                                    "brightRed",
                                    "brightGreen",
                                    "brightYellow",
                                    "brightBlue",
                                    "brightMagenta",
                                    "brightCyan",
                                    "brightWhite",
                                    "brightGray",
                                    "brightGrey",
                                    "fg",
                                    "bg",
                                    "muted",
                                    "dim",
                                    "primary",
                                    "accent",
                                    "ok",
                                    "warn",
                                    "err",
                                    "border",
                                    "borderTitle",
                                    "mdHeading",
                                    "mdHeading1",
                                    "mdHeading2",
                                    "mdHeading3",
                                    "mdHeading4",
                                    "mdHeading5",
                                    "mdHeading6",
                                    "mdStrong",
                                    "mdEmphasis",
                                    "mdStrikethrough",
                                    "mdCode",
                                    "mdCodeBlock",
                                    "mdCodeBlockTitle",
                                    "mdLink",
                                    "mdBlockquote",
                                    "mdList",
                                    "mdListChecked",
                                    "mdListUnchecked",
                                    "mdHr",
                                    "mdTable",
                                    "mdTableHeader",
                                    "inherit"
                                ]
                            },
                            {
                                $ref: "#/components/schemas/Style"
                            }
                        ]
                    },
                    mdStrong: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdEmphasis: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdStrikethrough: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdCode: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdCodeBlock: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdCodeBlockTitle: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdLink: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdBlockquote: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdList: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdListChecked: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdListUnchecked: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdHr: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdTable: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdTableHeader: {
                        $ref: "#/components/schemas/ThemeValue"
                    }
                },
                required: [
                    "fg",
                    "bg",
                    "muted",
                    "dim",
                    "primary",
                    "accent",
                    "ok",
                    "warn",
                    "err",
                    "border",
                    "borderTitle",
                    "mdHeading",
                    "mdStrong",
                    "mdEmphasis",
                    "mdStrikethrough",
                    "mdCode",
                    "mdCodeBlock",
                    "mdCodeBlockTitle",
                    "mdLink",
                    "mdBlockquote",
                    "mdList",
                    "mdListChecked",
                    "mdListUnchecked",
                    "mdHr",
                    "mdTable",
                    "mdTableHeader"
                ],
                description: "A theme is a flat record mapping semantic slots to `ThemeValue`s. Callers\nreference slots by key (`fg: \"primary\"` for colors, `borderStyle: \"border\"`\nfor style refs) and the framework resolves through the theme at render time.\n\nCanonical themes live as JSON under `assets/themes/`. `moon` is bundled as\na static import for zero-cost default access; load any other theme by\nname via `loadTheme(\"tokyonight-storm\")`."
            },
            Color: {
                type: "string",
                pattern: "^(#(.*))",
                "enum": [
                    "black",
                    "red",
                    "green",
                    "yellow",
                    "blue",
                    "magenta",
                    "cyan",
                    "white",
                    "gray",
                    "grey",
                    "brightBlack",
                    "brightRed",
                    "brightGreen",
                    "brightYellow",
                    "brightBlue",
                    "brightMagenta",
                    "brightCyan",
                    "brightWhite",
                    "brightGray",
                    "brightGrey",
                    "fg",
                    "bg",
                    "muted",
                    "dim",
                    "primary",
                    "accent",
                    "ok",
                    "warn",
                    "err",
                    "border",
                    "borderTitle",
                    "mdHeading",
                    "mdHeading1",
                    "mdHeading2",
                    "mdHeading3",
                    "mdHeading4",
                    "mdHeading5",
                    "mdHeading6",
                    "mdStrong",
                    "mdEmphasis",
                    "mdStrikethrough",
                    "mdCode",
                    "mdCodeBlock",
                    "mdCodeBlockTitle",
                    "mdLink",
                    "mdBlockquote",
                    "mdList",
                    "mdListChecked",
                    "mdListUnchecked",
                    "mdHr",
                    "mdTable",
                    "mdTableHeader",
                    "inherit"
                ],
                description: "A color value. Accepted forms:\n - `#rgb` / `#rrggbb` hex\n - ANSI color names (`red`, `cyan`, `gray`, \u2026)\n - Bright ANSI variants (`brightRed`, `brightBlue`, \u2026)\n - Theme slot keys from `keyof Theme` (`primary`, `muted`, \u2026)\n - `'inherit'` \u2014 use the parent's color (renders as no escape)."
            },
            ThemeValue: {
                oneOf: [
                    {
                        type: "string",
                        pattern: "^(#(.*))",
                        "enum": [
                            "black",
                            "red",
                            "green",
                            "yellow",
                            "blue",
                            "magenta",
                            "cyan",
                            "white",
                            "gray",
                            "grey",
                            "brightBlack",
                            "brightRed",
                            "brightGreen",
                            "brightYellow",
                            "brightBlue",
                            "brightMagenta",
                            "brightCyan",
                            "brightWhite",
                            "brightGray",
                            "brightGrey",
                            "fg",
                            "bg",
                            "muted",
                            "dim",
                            "primary",
                            "accent",
                            "ok",
                            "warn",
                            "err",
                            "border",
                            "borderTitle",
                            "mdHeading",
                            "mdHeading1",
                            "mdHeading2",
                            "mdHeading3",
                            "mdHeading4",
                            "mdHeading5",
                            "mdHeading6",
                            "mdStrong",
                            "mdEmphasis",
                            "mdStrikethrough",
                            "mdCode",
                            "mdCodeBlock",
                            "mdCodeBlockTitle",
                            "mdLink",
                            "mdBlockquote",
                            "mdList",
                            "mdListChecked",
                            "mdListUnchecked",
                            "mdHr",
                            "mdTable",
                            "mdTableHeader",
                            "inherit"
                        ]
                    },
                    {
                        $ref: "#/components/schemas/Style"
                    }
                ],
                description: "A theme slot value. Color shortcuts expand to `{ fg: <color> }` at resolve\ntime; Style objects are used as-is and may carry attrs (`bold`, `underline`,\netc.) and a `bg`. Use Color for simple fg-only slots; escalate to Style when\nthe part needs more than just a foreground color."
            },
            Style: {
                type: "object",
                properties: {
                    fg: {
                        type: "string",
                        pattern: "^(#(.*))",
                        "enum": [
                            "black",
                            "red",
                            "green",
                            "yellow",
                            "blue",
                            "magenta",
                            "cyan",
                            "white",
                            "gray",
                            "grey",
                            "brightBlack",
                            "brightRed",
                            "brightGreen",
                            "brightYellow",
                            "brightBlue",
                            "brightMagenta",
                            "brightCyan",
                            "brightWhite",
                            "brightGray",
                            "brightGrey",
                            "fg",
                            "bg",
                            "muted",
                            "dim",
                            "primary",
                            "accent",
                            "ok",
                            "warn",
                            "err",
                            "border",
                            "borderTitle",
                            "mdHeading",
                            "mdHeading1",
                            "mdHeading2",
                            "mdHeading3",
                            "mdHeading4",
                            "mdHeading5",
                            "mdHeading6",
                            "mdStrong",
                            "mdEmphasis",
                            "mdStrikethrough",
                            "mdCode",
                            "mdCodeBlock",
                            "mdCodeBlockTitle",
                            "mdLink",
                            "mdBlockquote",
                            "mdList",
                            "mdListChecked",
                            "mdListUnchecked",
                            "mdHr",
                            "mdTable",
                            "mdTableHeader",
                            "inherit"
                        ]
                    },
                    bg: {
                        type: "string",
                        pattern: "^(#(.*))",
                        "enum": [
                            "black",
                            "red",
                            "green",
                            "yellow",
                            "blue",
                            "magenta",
                            "cyan",
                            "white",
                            "gray",
                            "grey",
                            "brightBlack",
                            "brightRed",
                            "brightGreen",
                            "brightYellow",
                            "brightBlue",
                            "brightMagenta",
                            "brightCyan",
                            "brightWhite",
                            "brightGray",
                            "brightGrey",
                            "fg",
                            "bg",
                            "muted",
                            "dim",
                            "primary",
                            "accent",
                            "ok",
                            "warn",
                            "err",
                            "border",
                            "borderTitle",
                            "mdHeading",
                            "mdHeading1",
                            "mdHeading2",
                            "mdHeading3",
                            "mdHeading4",
                            "mdHeading5",
                            "mdHeading6",
                            "mdStrong",
                            "mdEmphasis",
                            "mdStrikethrough",
                            "mdCode",
                            "mdCodeBlock",
                            "mdCodeBlockTitle",
                            "mdLink",
                            "mdBlockquote",
                            "mdList",
                            "mdListChecked",
                            "mdListUnchecked",
                            "mdHr",
                            "mdTable",
                            "mdTableHeader",
                            "inherit"
                        ]
                    },
                    bold: {
                        type: "boolean"
                    },
                    dim: {
                        type: "boolean"
                    },
                    italic: {
                        type: "boolean"
                    },
                    underline: {
                        type: "boolean"
                    },
                    inverse: {
                        type: "boolean"
                    },
                    strikethrough: {
                        type: "boolean"
                    }
                },
                required: [],
                description: "Base style shared by every node type. Box/Text/etc. extend this."
            }
        }
    },
    schema: {
        type: "array",
        items: {
            oneOf: [
                {
                    $ref: "#/components/schemas/Theme.o1"
                }
            ]
        },
        minItems: 1,
        maxItems: 1
    }
} as import("typia").IJsonSchemaUnit<"3.0">;
