// oxlint-disable import/no-named-as-default-member
import type { Theme } from "../../themes/types.ts";
export const ThemeSchema = {
    components: {
        schemas: {
            "Theme-o1": {
                type: "object",
                properties: {
                    id: {
                        type: "string"
                    },
                    appearance: {
                        type: "string",
                        "enum": [
                            "dark",
                            "light"
                        ],
                        description: "Dark/light appearance, inferred from bg when omitted in a theme file."
                    },
                    name: {
                        type: "string"
                    },
                    shiki: {
                        type: "string",
                        "enum": [
                            "andromeeda",
                            "aurora-x",
                            "auto",
                            "ayu-dark",
                            "ayu-light",
                            "ayu-mirage",
                            "catppuccin-frappe",
                            "catppuccin-latte",
                            "catppuccin-macchiato",
                            "catppuccin-mocha",
                            "dark-plus",
                            "dracula",
                            "dracula-soft",
                            "everforest-dark",
                            "everforest-light",
                            "github-dark",
                            "github-dark-default",
                            "github-dark-dimmed",
                            "github-dark-high-contrast",
                            "github-light",
                            "github-light-default",
                            "github-light-high-contrast",
                            "gruvbox-dark-hard",
                            "gruvbox-dark-medium",
                            "gruvbox-dark-soft",
                            "gruvbox-light-hard",
                            "gruvbox-light-medium",
                            "gruvbox-light-soft",
                            "horizon",
                            "horizon-bright",
                            "houston",
                            "kanagawa-dragon",
                            "kanagawa-lotus",
                            "kanagawa-wave",
                            "laserwave",
                            "light-plus",
                            "material-theme",
                            "material-theme-darker",
                            "material-theme-lighter",
                            "material-theme-ocean",
                            "material-theme-palenight",
                            "min-dark",
                            "min-light",
                            "monokai",
                            "night-owl",
                            "night-owl-light",
                            "nord",
                            "one-dark-pro",
                            "one-light",
                            "plastic",
                            "poimandres",
                            "red",
                            "rose-pine",
                            "rose-pine-dawn",
                            "rose-pine-moon",
                            "slack-dark",
                            "slack-ochin",
                            "snazzy-light",
                            "solarized-dark",
                            "solarized-light",
                            "synthwave-84",
                            "tokyo-night",
                            "vesper",
                            "vitesse-black",
                            "vitesse-dark",
                            "vitesse-light"
                        ],
                        description: "Matching bundled Shiki theme. Unset or \"auto\" generates highlighting\nfrom the syntax slots."
                    },
                    fg: {
                        $ref: "#/components/schemas/Colortruetrue"
                    },
                    bg: {
                        $ref: "#/components/schemas/Colortruetrue"
                    },
                    primary: {
                        $ref: "#/components/schemas/Colortrue",
                        description: "Brand / primary accent."
                    },
                    accent: {
                        $ref: "#/components/schemas/Colortrue",
                        description: "Secondary accent \u2014 distinct hue from `primary`."
                    },
                    muted: {
                        $ref: "#/components/schemas/AnyStyletrue",
                        description: "Secondary text \u2014 first tier of the quietness ladder\n(`muted` \u2192 `quiet` \u2192 `comment`). Slightly faded but readable;\ngood for timestamps, captions, less-prominent labels."
                    },
                    quiet: {
                        $ref: "#/components/schemas/AnyStyletrue",
                        description: "De-emphasized but still readable. Reasoning / thinking text,\nsecondary annotations, hints."
                    },
                    comment: {
                        $ref: "#/components/schemas/AnyStyletrue",
                        description: "Editor-comment tier \u2014 soft, often tinted. Used for code\nannotations, line-number labels, italic quotes."
                    },
                    title: {
                        $ref: "#/components/schemas/AnyStyletrue",
                        description: "Section / panel titles. Typically `bold` + a fg color."
                    },
                    delim: {
                        $ref: "#/components/schemas/AnyStyletrue",
                        description: "Structural separators \u2014 borders, dividers, gutter lines."
                    },
                    ui: {
                        $ref: "#/components/schemas/AnyStyletrue",
                        description: "Default UI surface. Bottom of the stack."
                    },
                    overlay: {
                        $ref: "#/components/schemas/AnyStyletrue",
                        description: "Popup / modal surface. One tier above `ui`."
                    },
                    highlight: {
                        $ref: "#/components/schemas/AnyStyletrue",
                        description: "Tinted region for emphasized content within the stream \u2014 user\nbubble bg, focused row, callout. Distinct from `code`, which is\nreserved for code-block bg."
                    },
                    divider: {
                        $ref: "#/components/schemas/AnyStyletrue",
                        description: "Separators between messages or sections."
                    },
                    selection: {
                        $ref: "#/components/schemas/AnyStyletrue",
                        description: "Highlighted text in inputs, lists, autocomplete."
                    },
                    gutter: {
                        $ref: "#/components/schemas/AnyStyletrue",
                        description: "Line-number column, diff markers."
                    },
                    prompt: {
                        $ref: "#/components/schemas/AnyStyletrue",
                        description: "Main input-prompt styling."
                    },
                    border: {
                        $ref: "#/components/schemas/AnyStyletrue",
                        description: "Structural border around panels, boxes, tables."
                    },
                    borderTitle: {
                        $ref: "#/components/schemas/AnyStyletrue",
                        description: "Title text inside a bordered region (slightly stronger than\n`border`)."
                    },
                    code: {
                        $ref: "#/components/schemas/AnyStyletrue",
                        description: "Code-block surface (bg + optional fg). Default for `mdCodeBlock`."
                    },
                    codeTitle: {
                        $ref: "#/components/schemas/AnyStyletrue",
                        description: "Title above a code block (e.g. file path)."
                    },
                    success: {
                        $ref: "#/components/schemas/Colortrue"
                    },
                    info: {
                        $ref: "#/components/schemas/Colortrue"
                    },
                    warn: {
                        $ref: "#/components/schemas/Colortrue"
                    },
                    error: {
                        $ref: "#/components/schemas/Colortrue"
                    },
                    syntaxBoolean: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    syntaxBracket: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    syntaxConstant: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    syntaxDelimiter: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    syntaxField: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    syntaxFunction: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    syntaxNumber: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    syntaxSpecial: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    syntaxString: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    mdBold: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    mdCode: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    mdCodeBlock: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    mdCodeBlockTitle: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    mdHeading1: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    mdHeading2: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    mdHeading3: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    mdHeading4: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    mdHeading5: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    mdHeading6: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    mdHeading: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    mdHr: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    mdItalic: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    mdLink: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    mdListBullet: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    mdListChecked: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    mdListUnchecked: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    mdQuote: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    mdStrikethrough: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    mdTable: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    mdTableHeader: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    optionName: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    optionDesc: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    optionActive: {
                        $ref: "#/components/schemas/AnyStyletrue",
                        description: "Currently-highlighted entry."
                    },
                    diffAdd: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    diffDel: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    diffContext: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    diffAddNum: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    diffDelNum: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    },
                    diffContextNum: {
                        $ref: "#/components/schemas/AnyStyletrue"
                    }
                },
                required: [
                    "id",
                    "appearance",
                    "fg",
                    "bg",
                    "primary",
                    "accent",
                    "muted",
                    "quiet",
                    "comment",
                    "title",
                    "delim",
                    "ui",
                    "overlay",
                    "highlight",
                    "divider",
                    "selection",
                    "gutter",
                    "prompt",
                    "border",
                    "borderTitle",
                    "code",
                    "codeTitle",
                    "success",
                    "info",
                    "warn",
                    "error",
                    "syntaxBoolean",
                    "syntaxBracket",
                    "syntaxConstant",
                    "syntaxDelimiter",
                    "syntaxField",
                    "syntaxFunction",
                    "syntaxNumber",
                    "syntaxSpecial",
                    "syntaxString",
                    "mdBold",
                    "mdCode",
                    "mdCodeBlock",
                    "mdCodeBlockTitle",
                    "mdHeading1",
                    "mdHeading2",
                    "mdHeading3",
                    "mdHeading4",
                    "mdHeading5",
                    "mdHeading6",
                    "mdHeading",
                    "mdHr",
                    "mdItalic",
                    "mdLink",
                    "mdListBullet",
                    "mdListChecked",
                    "mdListUnchecked",
                    "mdQuote",
                    "mdStrikethrough",
                    "mdTable",
                    "mdTableHeader",
                    "optionName",
                    "optionDesc",
                    "optionActive",
                    "diffAdd",
                    "diffDel",
                    "diffContext",
                    "diffAddNum",
                    "diffDelNum",
                    "diffContextNum"
                ],
                additionalProperties: false,
                description: "A theme is a flat record mapping semantic slots to `ThemeValue`s. Callers\nreference slots by key (`fg: \"primary\"` for colors, `borderStyle: \"border\"`\nfor style refs) and the framework resolves through the theme at render time.\n\nBuilt-in themes live as JSON under `assets/themes/`. `tokyonight-moon` is\nbundled as the default; load any other theme by name via\n`loadTheme(\"tokyonight-storm\")`.\n\n**Text quietness ladder** (most \u2192 least prominent): `fg` (terminal\ndefault) \u2192 `muted` \u2192 `quiet` \u2192 `comment`. Pick the lowest tier\nthat still reads cleanly against the background.\n\n**Surface tiers**: `ui` \u2192 `subtle` \u2192 `overlay` (bottom \u2192 top).\n`highlight` is orthogonal \u2014 a tinted accent surface, not a tier."
            },
            Colortruetrue: {
                type: "string",
                "enum": [
                    "accent",
                    "bg",
                    "black",
                    "blue",
                    "border",
                    "borderTitle",
                    "brightBlack",
                    "brightBlue",
                    "brightCyan",
                    "brightGray",
                    "brightGreen",
                    "brightGrey",
                    "brightMagenta",
                    "brightRed",
                    "brightWhite",
                    "brightYellow",
                    "code",
                    "codeTitle",
                    "comment",
                    "cyan",
                    "delim",
                    "diffAdd",
                    "diffAddNum",
                    "diffContext",
                    "diffContextNum",
                    "diffDel",
                    "diffDelNum",
                    "divider",
                    "error",
                    "fg",
                    "gray",
                    "green",
                    "grey",
                    "gutter",
                    "highlight",
                    "info",
                    "inherit",
                    "magenta",
                    "mdBold",
                    "mdCode",
                    "mdCodeBlock",
                    "mdCodeBlockTitle",
                    "mdHeading",
                    "mdHeading1",
                    "mdHeading2",
                    "mdHeading3",
                    "mdHeading4",
                    "mdHeading5",
                    "mdHeading6",
                    "mdHr",
                    "mdItalic",
                    "mdLink",
                    "mdListBullet",
                    "mdListChecked",
                    "mdListUnchecked",
                    "mdQuote",
                    "mdStrikethrough",
                    "mdTable",
                    "mdTableHeader",
                    "muted",
                    "optionActive",
                    "optionDesc",
                    "optionName",
                    "overlay",
                    "primary",
                    "prompt",
                    "quiet",
                    "red",
                    "selection",
                    "success",
                    "syntaxBoolean",
                    "syntaxBracket",
                    "syntaxConstant",
                    "syntaxDelimiter",
                    "syntaxField",
                    "syntaxFunction",
                    "syntaxNumber",
                    "syntaxSpecial",
                    "syntaxString",
                    "title",
                    "ui",
                    "warn",
                    "white",
                    "yellow"
                ],
                pattern: "^((#(.*))|(#(.*)\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(#(.*)\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(accent\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(accent\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(bg\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(bg\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(border\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(border\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(borderTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(borderTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(code\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(code\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(codeTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(codeTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(comment\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(comment\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(delim\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(delim\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAdd\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAdd\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAddNum\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAddNum\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContext\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContext\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContextNum\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContextNum\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDel\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDel\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDelNum\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDelNum\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(divider\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(divider\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(error\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(error\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(fg\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(fg\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(gutter\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(gutter\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(highlight\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(highlight\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(info\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(info\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdBold\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdBold\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCode\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCode\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlock\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlock\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlockTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlockTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading1\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading1\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading2\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading2\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading3\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading3\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading4\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading4\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading5\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading5\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading6\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading6\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHr\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHr\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdItalic\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdItalic\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdLink\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdLink\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListBullet\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListBullet\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListChecked\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListChecked\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListUnchecked\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListUnchecked\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdQuote\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdQuote\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdStrikethrough\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdStrikethrough\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTable\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTable\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTableHeader\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTableHeader\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(muted\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(muted\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionActive\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionActive\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionDesc\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionDesc\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionName\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionName\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(overlay\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(overlay\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(primary\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(primary\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(prompt\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(prompt\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(quiet\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(quiet\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(selection\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(selection\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(success\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(success\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBoolean\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBoolean\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBracket\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBracket\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxConstant\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxConstant\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxDelimiter\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxDelimiter\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxField\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxField\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxFunction\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxFunction\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxNumber\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxNumber\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxSpecial\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxSpecial\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxString\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxString\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(title\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(title\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(ui\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(ui\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(warn\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(warn\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?))$",
                description: "A color value. Accepted forms:\n - `#rgb` / `#rrggbb` hex\n - ANSI color names (`red`, `cyan`, `gray`, \u2026)\n - Bright ANSI variants (`brightRed`, `brightBlue`, \u2026)\n - Theme slot keys from `keyof Theme` (`primary`, `muted`, \u2026)\n - `'inherit'` \u2014 use the parent's color (renders as no escape).\n - Variant suffix `-<step>` on hex or theme slots \u2014 e.g. `primary-300`,\n   `#82aaff-900`. The base color gets resolved through the theme\n   (extracting the channel when needed), then `variant(base, step)`\n   shifts it along the OKLCH tonal scale."
            },
            Colortrue: {
                type: "string",
                "enum": [
                    "accent",
                    "bg",
                    "black",
                    "blue",
                    "border",
                    "borderTitle",
                    "brightBlack",
                    "brightBlue",
                    "brightCyan",
                    "brightGray",
                    "brightGreen",
                    "brightGrey",
                    "brightMagenta",
                    "brightRed",
                    "brightWhite",
                    "brightYellow",
                    "code",
                    "codeTitle",
                    "comment",
                    "cyan",
                    "delim",
                    "diffAdd",
                    "diffAddNum",
                    "diffContext",
                    "diffContextNum",
                    "diffDel",
                    "diffDelNum",
                    "divider",
                    "error",
                    "fg",
                    "gray",
                    "green",
                    "grey",
                    "gutter",
                    "highlight",
                    "info",
                    "inherit",
                    "magenta",
                    "mdBold",
                    "mdCode",
                    "mdCodeBlock",
                    "mdCodeBlockTitle",
                    "mdHeading",
                    "mdHeading1",
                    "mdHeading2",
                    "mdHeading3",
                    "mdHeading4",
                    "mdHeading5",
                    "mdHeading6",
                    "mdHr",
                    "mdItalic",
                    "mdLink",
                    "mdListBullet",
                    "mdListChecked",
                    "mdListUnchecked",
                    "mdQuote",
                    "mdStrikethrough",
                    "mdTable",
                    "mdTableHeader",
                    "muted",
                    "optionActive",
                    "optionDesc",
                    "optionName",
                    "overlay",
                    "primary",
                    "prompt",
                    "quiet",
                    "red",
                    "selection",
                    "success",
                    "syntaxBoolean",
                    "syntaxBracket",
                    "syntaxConstant",
                    "syntaxDelimiter",
                    "syntaxField",
                    "syntaxFunction",
                    "syntaxNumber",
                    "syntaxSpecial",
                    "syntaxString",
                    "title",
                    "ui",
                    "warn",
                    "white",
                    "yellow"
                ],
                pattern: "^((#(.*))|(#(.*)\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(#(.*)\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(accent\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(accent\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(bg\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(bg\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(border\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(border\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(borderTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(borderTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(code\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(code\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(codeTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(codeTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(comment\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(comment\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(delim\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(delim\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAdd\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAdd\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAddNum\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAddNum\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContext\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContext\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContextNum\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContextNum\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDel\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDel\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDelNum\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDelNum\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(divider\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(divider\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(error\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(error\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(fg\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(fg\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(gutter\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(gutter\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(highlight\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(highlight\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(info\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(info\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdBold\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdBold\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCode\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCode\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlock\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlock\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlockTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlockTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading1\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading1\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading2\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading2\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading3\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading3\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading4\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading4\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading5\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading5\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading6\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading6\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHr\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHr\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdItalic\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdItalic\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdLink\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdLink\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListBullet\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListBullet\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListChecked\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListChecked\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListUnchecked\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListUnchecked\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdQuote\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdQuote\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdStrikethrough\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdStrikethrough\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTable\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTable\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTableHeader\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTableHeader\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(muted\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(muted\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionActive\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionActive\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionDesc\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionDesc\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionName\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionName\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(overlay\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(overlay\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(primary\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(primary\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(prompt\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(prompt\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(quiet\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(quiet\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(selection\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(selection\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(success\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(success\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBoolean\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBoolean\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBracket\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBracket\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxConstant\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxConstant\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxDelimiter\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxDelimiter\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxField\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxField\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxFunction\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxFunction\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxNumber\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxNumber\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxSpecial\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxSpecial\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxString\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxString\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(title\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(title\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(ui\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(ui\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(warn\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(warn\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?))$",
                description: "A color value. Accepted forms:\n - `#rgb` / `#rrggbb` hex\n - ANSI color names (`red`, `cyan`, `gray`, \u2026)\n - Bright ANSI variants (`brightRed`, `brightBlue`, \u2026)\n - Theme slot keys from `keyof Theme` (`primary`, `muted`, \u2026)\n - `'inherit'` \u2014 use the parent's color (renders as no escape).\n - Variant suffix `-<step>` on hex or theme slots \u2014 e.g. `primary-300`,\n   `#82aaff-900`. The base color gets resolved through the theme\n   (extracting the channel when needed), then `variant(base, step)`\n   shifts it along the OKLCH tonal scale."
            },
            AnyStyletrue: {
                oneOf: [
                    {
                        type: "string",
                        "enum": [
                            "accent",
                            "bg",
                            "black",
                            "blue",
                            "border",
                            "borderTitle",
                            "brightBlack",
                            "brightBlue",
                            "brightCyan",
                            "brightGray",
                            "brightGreen",
                            "brightGrey",
                            "brightMagenta",
                            "brightRed",
                            "brightWhite",
                            "brightYellow",
                            "code",
                            "codeTitle",
                            "comment",
                            "cyan",
                            "delim",
                            "diffAdd",
                            "diffAddNum",
                            "diffContext",
                            "diffContextNum",
                            "diffDel",
                            "diffDelNum",
                            "divider",
                            "error",
                            "fg",
                            "gray",
                            "green",
                            "grey",
                            "gutter",
                            "highlight",
                            "info",
                            "inherit",
                            "magenta",
                            "mdBold",
                            "mdCode",
                            "mdCodeBlock",
                            "mdCodeBlockTitle",
                            "mdHeading",
                            "mdHeading1",
                            "mdHeading2",
                            "mdHeading3",
                            "mdHeading4",
                            "mdHeading5",
                            "mdHeading6",
                            "mdHr",
                            "mdItalic",
                            "mdLink",
                            "mdListBullet",
                            "mdListChecked",
                            "mdListUnchecked",
                            "mdQuote",
                            "mdStrikethrough",
                            "mdTable",
                            "mdTableHeader",
                            "muted",
                            "optionActive",
                            "optionDesc",
                            "optionName",
                            "overlay",
                            "primary",
                            "prompt",
                            "quiet",
                            "red",
                            "selection",
                            "success",
                            "syntaxBoolean",
                            "syntaxBracket",
                            "syntaxConstant",
                            "syntaxDelimiter",
                            "syntaxField",
                            "syntaxFunction",
                            "syntaxNumber",
                            "syntaxSpecial",
                            "syntaxString",
                            "title",
                            "ui",
                            "warn",
                            "white",
                            "yellow"
                        ],
                        pattern: "^((#(.*))|(#(.*)\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(#(.*)\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(accent\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(accent\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(bg\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(bg\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(border\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(border\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(borderTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(borderTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(code\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(code\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(codeTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(codeTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(comment\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(comment\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(delim\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(delim\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAdd\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAdd\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAddNum\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAddNum\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContext\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContext\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContextNum\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContextNum\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDel\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDel\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDelNum\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDelNum\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(divider\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(divider\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(error\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(error\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(fg\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(fg\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(gutter\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(gutter\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(highlight\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(highlight\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(info\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(info\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdBold\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdBold\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCode\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCode\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlock\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlock\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlockTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlockTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading1\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading1\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading2\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading2\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading3\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading3\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading4\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading4\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading5\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading5\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading6\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading6\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHr\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHr\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdItalic\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdItalic\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdLink\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdLink\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListBullet\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListBullet\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListChecked\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListChecked\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListUnchecked\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListUnchecked\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdQuote\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdQuote\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdStrikethrough\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdStrikethrough\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTable\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTable\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTableHeader\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTableHeader\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(muted\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(muted\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionActive\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionActive\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionDesc\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionDesc\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionName\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionName\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(overlay\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(overlay\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(primary\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(primary\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(prompt\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(prompt\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(quiet\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(quiet\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(selection\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(selection\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(success\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(success\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBoolean\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBoolean\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBracket\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBracket\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxConstant\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxConstant\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxDelimiter\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxDelimiter\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxField\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxField\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxFunction\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxFunction\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxNumber\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxNumber\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxSpecial\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxSpecial\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxString\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxString\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(title\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(title\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(ui\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(ui\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(warn\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(warn\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?))$"
                    },
                    {
                        $ref: "#/components/schemas/Styletrue"
                    }
                ]
            },
            Styletrue: {
                type: "object",
                properties: {
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
                    },
                    fg: {
                        type: "string",
                        "enum": [
                            "accent",
                            "bg",
                            "black",
                            "blue",
                            "border",
                            "borderTitle",
                            "brightBlack",
                            "brightBlue",
                            "brightCyan",
                            "brightGray",
                            "brightGreen",
                            "brightGrey",
                            "brightMagenta",
                            "brightRed",
                            "brightWhite",
                            "brightYellow",
                            "code",
                            "codeTitle",
                            "comment",
                            "cyan",
                            "delim",
                            "diffAdd",
                            "diffAddNum",
                            "diffContext",
                            "diffContextNum",
                            "diffDel",
                            "diffDelNum",
                            "divider",
                            "error",
                            "fg",
                            "gray",
                            "green",
                            "grey",
                            "gutter",
                            "highlight",
                            "info",
                            "inherit",
                            "magenta",
                            "mdBold",
                            "mdCode",
                            "mdCodeBlock",
                            "mdCodeBlockTitle",
                            "mdHeading",
                            "mdHeading1",
                            "mdHeading2",
                            "mdHeading3",
                            "mdHeading4",
                            "mdHeading5",
                            "mdHeading6",
                            "mdHr",
                            "mdItalic",
                            "mdLink",
                            "mdListBullet",
                            "mdListChecked",
                            "mdListUnchecked",
                            "mdQuote",
                            "mdStrikethrough",
                            "mdTable",
                            "mdTableHeader",
                            "muted",
                            "optionActive",
                            "optionDesc",
                            "optionName",
                            "overlay",
                            "primary",
                            "prompt",
                            "quiet",
                            "red",
                            "selection",
                            "success",
                            "syntaxBoolean",
                            "syntaxBracket",
                            "syntaxConstant",
                            "syntaxDelimiter",
                            "syntaxField",
                            "syntaxFunction",
                            "syntaxNumber",
                            "syntaxSpecial",
                            "syntaxString",
                            "title",
                            "ui",
                            "warn",
                            "white",
                            "yellow"
                        ],
                        pattern: "^((#(.*))|(#(.*)\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(#(.*)\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(accent\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(accent\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(bg\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(bg\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(border\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(border\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(borderTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(borderTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(code\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(code\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(codeTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(codeTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(comment\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(comment\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(delim\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(delim\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAdd\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAdd\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAddNum\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAddNum\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContext\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContext\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContextNum\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContextNum\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDel\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDel\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDelNum\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDelNum\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(divider\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(divider\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(error\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(error\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(fg\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(fg\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(gutter\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(gutter\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(highlight\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(highlight\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(info\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(info\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdBold\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdBold\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCode\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCode\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlock\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlock\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlockTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlockTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading1\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading1\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading2\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading2\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading3\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading3\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading4\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading4\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading5\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading5\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading6\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading6\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHr\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHr\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdItalic\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdItalic\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdLink\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdLink\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListBullet\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListBullet\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListChecked\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListChecked\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListUnchecked\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListUnchecked\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdQuote\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdQuote\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdStrikethrough\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdStrikethrough\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTable\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTable\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTableHeader\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTableHeader\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(muted\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(muted\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionActive\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionActive\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionDesc\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionDesc\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionName\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionName\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(overlay\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(overlay\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(primary\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(primary\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(prompt\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(prompt\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(quiet\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(quiet\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(selection\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(selection\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(success\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(success\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBoolean\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBoolean\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBracket\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBracket\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxConstant\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxConstant\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxDelimiter\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxDelimiter\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxField\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxField\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxFunction\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxFunction\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxNumber\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxNumber\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxSpecial\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxSpecial\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxString\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxString\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(title\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(title\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(ui\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(ui\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(warn\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(warn\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?))$"
                    },
                    bg: {
                        type: "string",
                        "enum": [
                            "accent",
                            "bg",
                            "black",
                            "blue",
                            "border",
                            "borderTitle",
                            "brightBlack",
                            "brightBlue",
                            "brightCyan",
                            "brightGray",
                            "brightGreen",
                            "brightGrey",
                            "brightMagenta",
                            "brightRed",
                            "brightWhite",
                            "brightYellow",
                            "code",
                            "codeTitle",
                            "comment",
                            "cyan",
                            "delim",
                            "diffAdd",
                            "diffAddNum",
                            "diffContext",
                            "diffContextNum",
                            "diffDel",
                            "diffDelNum",
                            "divider",
                            "error",
                            "fg",
                            "gray",
                            "green",
                            "grey",
                            "gutter",
                            "highlight",
                            "info",
                            "inherit",
                            "magenta",
                            "mdBold",
                            "mdCode",
                            "mdCodeBlock",
                            "mdCodeBlockTitle",
                            "mdHeading",
                            "mdHeading1",
                            "mdHeading2",
                            "mdHeading3",
                            "mdHeading4",
                            "mdHeading5",
                            "mdHeading6",
                            "mdHr",
                            "mdItalic",
                            "mdLink",
                            "mdListBullet",
                            "mdListChecked",
                            "mdListUnchecked",
                            "mdQuote",
                            "mdStrikethrough",
                            "mdTable",
                            "mdTableHeader",
                            "muted",
                            "optionActive",
                            "optionDesc",
                            "optionName",
                            "overlay",
                            "primary",
                            "prompt",
                            "quiet",
                            "red",
                            "selection",
                            "success",
                            "syntaxBoolean",
                            "syntaxBracket",
                            "syntaxConstant",
                            "syntaxDelimiter",
                            "syntaxField",
                            "syntaxFunction",
                            "syntaxNumber",
                            "syntaxSpecial",
                            "syntaxString",
                            "title",
                            "ui",
                            "warn",
                            "white",
                            "yellow"
                        ],
                        pattern: "^((#(.*))|(#(.*)\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(#(.*)\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(accent\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(accent\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(bg\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(bg\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(border\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(border\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(borderTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(borderTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(code\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(code\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(codeTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(codeTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(comment\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(comment\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(delim\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(delim\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAdd\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAdd\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAddNum\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAddNum\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContext\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContext\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContextNum\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContextNum\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDel\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDel\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDelNum\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDelNum\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(divider\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(divider\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(error\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(error\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(fg\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(fg\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(gutter\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(gutter\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(highlight\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(highlight\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(info\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(info\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdBold\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdBold\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCode\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCode\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlock\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlock\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlockTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlockTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading1\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading1\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading2\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading2\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading3\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading3\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading4\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading4\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading5\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading5\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading6\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading6\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHr\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHr\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdItalic\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdItalic\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdLink\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdLink\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListBullet\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListBullet\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListChecked\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListChecked\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListUnchecked\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListUnchecked\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdQuote\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdQuote\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdStrikethrough\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdStrikethrough\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTable\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTable\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTableHeader\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTableHeader\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(muted\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(muted\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionActive\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionActive\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionDesc\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionDesc\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionName\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionName\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(overlay\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(overlay\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(primary\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(primary\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(prompt\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(prompt\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(quiet\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(quiet\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(selection\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(selection\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(success\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(success\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBoolean\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBoolean\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBracket\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBracket\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxConstant\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxConstant\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxDelimiter\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxDelimiter\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxField\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxField\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxFunction\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxFunction\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxNumber\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxNumber\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxSpecial\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxSpecial\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxString\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxString\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(title\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(title\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(ui\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(ui\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(warn\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(warn\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?))$"
                    },
                    style: {
                        oneOf: [
                            {
                                type: "string",
                                "enum": [
                                    "accent",
                                    "bg",
                                    "black",
                                    "blue",
                                    "border",
                                    "borderTitle",
                                    "brightBlack",
                                    "brightBlue",
                                    "brightCyan",
                                    "brightGray",
                                    "brightGreen",
                                    "brightGrey",
                                    "brightMagenta",
                                    "brightRed",
                                    "brightWhite",
                                    "brightYellow",
                                    "code",
                                    "codeTitle",
                                    "comment",
                                    "cyan",
                                    "delim",
                                    "diffAdd",
                                    "diffAddNum",
                                    "diffContext",
                                    "diffContextNum",
                                    "diffDel",
                                    "diffDelNum",
                                    "divider",
                                    "error",
                                    "fg",
                                    "gray",
                                    "green",
                                    "grey",
                                    "gutter",
                                    "highlight",
                                    "info",
                                    "inherit",
                                    "magenta",
                                    "mdBold",
                                    "mdCode",
                                    "mdCodeBlock",
                                    "mdCodeBlockTitle",
                                    "mdHeading",
                                    "mdHeading1",
                                    "mdHeading2",
                                    "mdHeading3",
                                    "mdHeading4",
                                    "mdHeading5",
                                    "mdHeading6",
                                    "mdHr",
                                    "mdItalic",
                                    "mdLink",
                                    "mdListBullet",
                                    "mdListChecked",
                                    "mdListUnchecked",
                                    "mdQuote",
                                    "mdStrikethrough",
                                    "mdTable",
                                    "mdTableHeader",
                                    "muted",
                                    "optionActive",
                                    "optionDesc",
                                    "optionName",
                                    "overlay",
                                    "primary",
                                    "prompt",
                                    "quiet",
                                    "red",
                                    "selection",
                                    "success",
                                    "syntaxBoolean",
                                    "syntaxBracket",
                                    "syntaxConstant",
                                    "syntaxDelimiter",
                                    "syntaxField",
                                    "syntaxFunction",
                                    "syntaxNumber",
                                    "syntaxSpecial",
                                    "syntaxString",
                                    "title",
                                    "ui",
                                    "warn",
                                    "white",
                                    "yellow"
                                ],
                                pattern: "^((#(.*))|(#(.*)\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(#(.*)\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(accent\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(accent\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(bg\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(bg\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(border\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(border\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(borderTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(borderTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(code\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(code\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(codeTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(codeTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(comment\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(comment\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(delim\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(delim\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAdd\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAdd\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAddNum\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAddNum\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContext\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContext\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContextNum\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContextNum\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDel\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDel\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDelNum\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDelNum\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(divider\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(divider\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(error\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(error\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(fg\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(fg\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(gutter\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(gutter\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(highlight\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(highlight\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(info\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(info\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdBold\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdBold\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCode\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCode\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlock\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlock\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlockTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlockTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading1\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading1\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading2\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading2\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading3\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading3\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading4\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading4\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading5\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading5\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading6\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading6\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHr\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHr\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdItalic\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdItalic\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdLink\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdLink\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListBullet\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListBullet\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListChecked\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListChecked\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListUnchecked\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListUnchecked\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdQuote\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdQuote\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdStrikethrough\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdStrikethrough\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTable\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTable\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTableHeader\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTableHeader\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(muted\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(muted\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionActive\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionActive\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionDesc\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionDesc\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionName\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(optionName\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(overlay\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(overlay\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(primary\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(primary\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(prompt\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(prompt\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(quiet\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(quiet\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(selection\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(selection\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(success\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(success\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBoolean\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBoolean\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBracket\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxBracket\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxConstant\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxConstant\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxDelimiter\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxDelimiter\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxField\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxField\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxFunction\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxFunction\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxNumber\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxNumber\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxSpecial\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxSpecial\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxString\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(syntaxString\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(title\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(title\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(ui\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(ui\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(warn\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(warn\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?))$"
                            },
                            {
                                $ref: "#/components/schemas/Styletrue"
                            }
                        ]
                    }
                },
                required: [],
                additionalProperties: false,
                description: "Base style shared by every node type. Box/Text/etc. extend this.\nPure styling \u2014 no layout or lifecycle fields. Widget state interfaces\nextend `StyleState` to pick up the `visible` base-state bits alongside\nthese style fields."
            }
        }
    },
    schema: {
        type: "array",
        minItems: 1,
        maxItems: 1,
        items: {
            oneOf: [
                {
                    $ref: "#/components/schemas/Theme-o1"
                }
            ]
        }
    },
    version: "3.0"
};
