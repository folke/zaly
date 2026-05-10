import type { Theme } from "../../themes/types.ts";
export const ThemeSchema = {
    version: "3.0",
    components: {
        schemas: {
            "Theme.o1": {
                type: "object",
                properties: {
                    shiki: {
                        type: "string",
                        "enum": [
                            "red",
                            "andromeeda",
                            "aurora-x",
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
                        description: "Optional name of a matching Shiki syntax-highlighting theme. Code\nblocks and fenced markdown snippets look this up so highlighting\naligns with the TUI palette. Leave unset for themes without a\nShiki counterpart."
                    },
                    primary: {
                        $ref: "#/components/schemas/Color",
                        description: "Brand / primary accent."
                    },
                    accent: {
                        $ref: "#/components/schemas/Color",
                        description: "Secondary accent \u2014 distinct hue from `primary`."
                    },
                    text: {
                        $ref: "#/components/schemas/Color",
                        description: "Default text color used by themed blocks (markdown content, code,\nquotes) that compose `fg: \"text\"` into their style. Defaults to\n`\"inherit\"` (terminal fg). Set explicitly when a theme wants\nthemed text inside its tinted regions."
                    },
                    muted: {
                        $ref: "#/components/schemas/ThemeValue",
                        description: "Secondary text \u2014 first tier of the quietness ladder\n(`muted` \u2192 `quiet` \u2192 `comment`). Slightly faded but readable;\ngood for timestamps, captions, less-prominent labels."
                    },
                    quiet: {
                        $ref: "#/components/schemas/ThemeValue",
                        description: "De-emphasized but still readable. Reasoning / thinking text,\nsecondary annotations, hints."
                    },
                    comment: {
                        $ref: "#/components/schemas/ThemeValue",
                        description: "Editor-comment tier \u2014 soft, often tinted. Used for code\nannotations, line-number labels, italic quotes."
                    },
                    title: {
                        $ref: "#/components/schemas/ThemeValue",
                        description: "Section / panel titles. Typically `bold` + a fg color."
                    },
                    subtle: {
                        $ref: "#/components/schemas/ThemeValue",
                        description: "Structural neutral \u2014 applied as fg for borders, dividers, and the\ngutter; as bg for subtly-tinted surfaces. Never used for\nde-emphasized text; that's the `muted` / `quiet` / `comment`\ntier."
                    },
                    ui: {
                        $ref: "#/components/schemas/ThemeValue",
                        description: "Default UI surface. Bottom of the stack."
                    },
                    overlay: {
                        $ref: "#/components/schemas/ThemeValue",
                        description: "Popup / modal surface. One tier above `ui`."
                    },
                    highlight: {
                        $ref: "#/components/schemas/ThemeValue",
                        description: "Tinted region for emphasized content within the stream \u2014 user\nbubble bg, focused row, callout. Distinct from `code`, which is\nreserved for code-block bg."
                    },
                    divider: {
                        $ref: "#/components/schemas/ThemeValue",
                        description: "Separators between messages or sections."
                    },
                    selection: {
                        $ref: "#/components/schemas/ThemeValue",
                        description: "Highlighted text in inputs, lists, autocomplete."
                    },
                    gutter: {
                        $ref: "#/components/schemas/ThemeValue",
                        description: "Line-number column, diff markers."
                    },
                    prompt: {
                        $ref: "#/components/schemas/ThemeValue",
                        description: "Main input-prompt styling."
                    },
                    border: {
                        $ref: "#/components/schemas/ThemeValue",
                        description: "Structural border around panels, boxes, tables."
                    },
                    borderTitle: {
                        $ref: "#/components/schemas/ThemeValue",
                        description: "Title text inside a bordered region (slightly stronger than\n`border`)."
                    },
                    code: {
                        $ref: "#/components/schemas/ThemeValue",
                        description: "Code-block surface (bg + optional fg). Default for `mdCodeBlock`."
                    },
                    codeTitle: {
                        $ref: "#/components/schemas/ThemeValue",
                        description: "Title above a code block (e.g. file path)."
                    },
                    success: {
                        $ref: "#/components/schemas/Color"
                    },
                    info: {
                        $ref: "#/components/schemas/Color"
                    },
                    warn: {
                        $ref: "#/components/schemas/Color"
                    },
                    error: {
                        $ref: "#/components/schemas/Color"
                    },
                    mdBold: {
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
                    mdHeading1: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdHeading2: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdHeading3: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdHeading4: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdHeading5: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdHeading6: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdHeading: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdHr: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdItalic: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdLink: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdListBullet: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdListChecked: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdListUnchecked: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdQuote: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdStrikethrough: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdTable: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    mdTableHeader: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    menuLabel: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    menuHint: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    menuActive: {
                        $ref: "#/components/schemas/ThemeValue",
                        description: "Currently-highlighted entry."
                    },
                    diffAdd: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    diffContext: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    diffDel: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    diffLine: {
                        $ref: "#/components/schemas/ThemeValue"
                    },
                    diffTitle: {
                        $ref: "#/components/schemas/ThemeValue"
                    }
                },
                required: [
                    "primary",
                    "accent",
                    "text",
                    "muted",
                    "quiet",
                    "comment",
                    "title",
                    "subtle",
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
                    "menuLabel",
                    "menuHint",
                    "menuActive",
                    "diffAdd",
                    "diffContext",
                    "diffDel",
                    "diffLine",
                    "diffTitle"
                ],
                description: "A theme is a flat record mapping semantic slots to `ThemeValue`s. Callers\nreference slots by key (`fg: \"primary\"` for colors, `borderStyle: \"border\"`\nfor style refs) and the framework resolves through the theme at render time.\n\nBuilt-in themes live as JSON under `assets/themes/`. `tokyonight-moon` is\nbundled as the default; load any other theme by name via\n`loadTheme(\"tokyonight-storm\")`.\n\n**Text quietness ladder** (most \u2192 least prominent): `fg` (terminal\ndefault) \u2192 `muted` \u2192 `quiet` \u2192 `comment`. Pick the lowest tier\nthat still reads cleanly against the background.\n\n**Surface tiers**: `ui` \u2192 `subtle` \u2192 `overlay` (bottom \u2192 top).\n`highlight` is orthogonal \u2014 a tinted accent surface, not a tier."
            },
            Color: {
                type: "string",
                pattern: "^((#(.*))|(#(.*)\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(shiki\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(primary\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(accent\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(text\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(muted\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(quiet\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(comment\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(title\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(subtle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(ui\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(overlay\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(highlight\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(divider\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(selection\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(gutter\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(prompt\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(border\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(borderTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(code\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(codeTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(success\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(info\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(warn\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(error\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdBold\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCode\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlock\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlockTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading1\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading2\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading3\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading4\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading5\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading6\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHr\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdItalic\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdLink\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListBullet\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListChecked\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListUnchecked\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdQuote\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdStrikethrough\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTable\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTableHeader\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuLabel\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuHint\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuActive\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAdd\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContext\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDel\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffLine\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(#(.*)\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(shiki\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(primary\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(accent\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(text\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(muted\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(quiet\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(comment\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(title\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(subtle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(ui\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(overlay\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(highlight\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(divider\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(selection\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(gutter\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(prompt\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(border\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(borderTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(code\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(codeTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(success\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(info\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(warn\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(error\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdBold\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCode\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlock\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlockTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading1\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading2\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading3\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading4\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading5\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading6\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHr\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdItalic\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdLink\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListBullet\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListChecked\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListUnchecked\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdQuote\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdStrikethrough\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTable\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTableHeader\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuLabel\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuHint\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuActive\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAdd\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContext\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDel\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffLine\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?))$",
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
                    "shiki",
                    "primary",
                    "accent",
                    "text",
                    "muted",
                    "quiet",
                    "comment",
                    "title",
                    "subtle",
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
                    "menuLabel",
                    "menuHint",
                    "menuActive",
                    "diffAdd",
                    "diffContext",
                    "diffDel",
                    "diffLine",
                    "diffTitle",
                    "inherit"
                ],
                description: "A color value. Accepted forms:\n - `#rgb` / `#rrggbb` hex\n - ANSI color names (`red`, `cyan`, `gray`, \u2026)\n - Bright ANSI variants (`brightRed`, `brightBlue`, \u2026)\n - Theme slot keys from `keyof Theme` (`primary`, `muted`, \u2026)\n - `'inherit'` \u2014 use the parent's color (renders as no escape).\n - Variant suffix `-<step>` on hex or theme slots \u2014 e.g. `primary-300`,\n   `#82aaff-900`. The base color gets resolved through the theme\n   (extracting the channel when needed), then `variant(base, step)`\n   shifts it along the OKLCH tonal scale."
            },
            ThemeValue: {
                oneOf: [
                    {
                        type: "string",
                        pattern: "^((#(.*))|(#(.*)\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(shiki\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(primary\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(accent\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(text\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(muted\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(quiet\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(comment\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(title\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(subtle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(ui\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(overlay\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(highlight\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(divider\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(selection\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(gutter\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(prompt\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(border\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(borderTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(code\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(codeTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(success\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(info\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(warn\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(error\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdBold\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCode\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlock\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlockTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading1\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading2\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading3\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading4\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading5\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading6\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHr\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdItalic\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdLink\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListBullet\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListChecked\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListUnchecked\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdQuote\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdStrikethrough\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTable\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTableHeader\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuLabel\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuHint\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuActive\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAdd\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContext\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDel\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffLine\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(#(.*)\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(shiki\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(primary\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(accent\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(text\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(muted\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(quiet\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(comment\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(title\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(subtle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(ui\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(overlay\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(highlight\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(divider\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(selection\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(gutter\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(prompt\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(border\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(borderTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(code\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(codeTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(success\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(info\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(warn\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(error\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdBold\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCode\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlock\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlockTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading1\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading2\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading3\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading4\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading5\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading6\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHr\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdItalic\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdLink\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListBullet\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListChecked\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListUnchecked\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdQuote\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdStrikethrough\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTable\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTableHeader\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuLabel\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuHint\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuActive\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAdd\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContext\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDel\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffLine\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?))$",
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
                            "shiki",
                            "primary",
                            "accent",
                            "text",
                            "muted",
                            "quiet",
                            "comment",
                            "title",
                            "subtle",
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
                            "menuLabel",
                            "menuHint",
                            "menuActive",
                            "diffAdd",
                            "diffContext",
                            "diffDel",
                            "diffLine",
                            "diffTitle",
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
                        pattern: "^((#(.*))|(#(.*)\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(shiki\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(primary\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(accent\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(text\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(muted\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(quiet\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(comment\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(title\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(subtle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(ui\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(overlay\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(highlight\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(divider\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(selection\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(gutter\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(prompt\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(border\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(borderTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(code\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(codeTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(success\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(info\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(warn\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(error\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdBold\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCode\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlock\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlockTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading1\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading2\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading3\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading4\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading5\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading6\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHr\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdItalic\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdLink\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListBullet\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListChecked\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListUnchecked\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdQuote\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdStrikethrough\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTable\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTableHeader\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuLabel\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuHint\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuActive\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAdd\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContext\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDel\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffLine\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(#(.*)\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(shiki\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(primary\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(accent\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(text\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(muted\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(quiet\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(comment\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(title\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(subtle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(ui\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(overlay\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(highlight\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(divider\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(selection\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(gutter\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(prompt\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(border\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(borderTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(code\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(codeTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(success\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(info\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(warn\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(error\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdBold\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCode\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlock\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlockTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading1\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading2\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading3\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading4\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading5\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading6\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHr\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdItalic\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdLink\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListBullet\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListChecked\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListUnchecked\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdQuote\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdStrikethrough\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTable\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTableHeader\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuLabel\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuHint\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuActive\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAdd\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContext\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDel\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffLine\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?))$",
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
                            "shiki",
                            "primary",
                            "accent",
                            "text",
                            "muted",
                            "quiet",
                            "comment",
                            "title",
                            "subtle",
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
                            "menuLabel",
                            "menuHint",
                            "menuActive",
                            "diffAdd",
                            "diffContext",
                            "diffDel",
                            "diffLine",
                            "diffTitle",
                            "inherit"
                        ]
                    },
                    bg: {
                        type: "string",
                        pattern: "^((#(.*))|(#(.*)\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(shiki\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(primary\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(accent\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(text\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(muted\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(quiet\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(comment\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(title\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(subtle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(ui\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(overlay\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(highlight\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(divider\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(selection\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(gutter\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(prompt\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(border\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(borderTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(code\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(codeTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(success\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(info\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(warn\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(error\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdBold\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCode\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlock\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlockTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading1\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading2\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading3\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading4\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading5\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading6\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHr\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdItalic\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdLink\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListBullet\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListChecked\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListUnchecked\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdQuote\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdStrikethrough\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTable\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTableHeader\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuLabel\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuHint\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuActive\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAdd\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContext\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDel\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffLine\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(#(.*)\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(shiki\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(primary\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(accent\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(text\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(muted\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(quiet\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(comment\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(title\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(subtle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(ui\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(overlay\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(highlight\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(divider\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(selection\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(gutter\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(prompt\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(border\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(borderTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(code\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(codeTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(success\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(info\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(warn\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(error\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdBold\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCode\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlock\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlockTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading1\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading2\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading3\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading4\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading5\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading6\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHr\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdItalic\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdLink\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListBullet\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListChecked\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListUnchecked\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdQuote\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdStrikethrough\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTable\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTableHeader\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuLabel\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuHint\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuActive\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAdd\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContext\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDel\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffLine\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?))$",
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
                            "shiki",
                            "primary",
                            "accent",
                            "text",
                            "muted",
                            "quiet",
                            "comment",
                            "title",
                            "subtle",
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
                            "menuLabel",
                            "menuHint",
                            "menuActive",
                            "diffAdd",
                            "diffContext",
                            "diffDel",
                            "diffLine",
                            "diffTitle",
                            "inherit"
                        ]
                    },
                    style: {
                        oneOf: [
                            {
                                type: "string",
                                pattern: "^((#(.*))|(#(.*)\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(shiki\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(primary\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(accent\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(text\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(muted\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(quiet\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(comment\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(title\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(subtle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(ui\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(overlay\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(highlight\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(divider\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(selection\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(gutter\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(prompt\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(border\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(borderTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(code\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(codeTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(success\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(info\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(warn\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(error\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdBold\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCode\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlock\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlockTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading1\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading2\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading3\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading4\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading5\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading6\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHr\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdItalic\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdLink\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListBullet\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListChecked\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListUnchecked\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdQuote\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdStrikethrough\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTable\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTableHeader\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuLabel\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuHint\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuActive\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAdd\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContext\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDel\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffLine\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffTitle\\x2d[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(#(.*)\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(shiki\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(primary\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(accent\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(text\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(muted\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(quiet\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(comment\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(title\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(subtle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(ui\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(overlay\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(highlight\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(divider\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(selection\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(gutter\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(prompt\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(border\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(borderTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(code\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(codeTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(success\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(info\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(warn\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(error\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdBold\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCode\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlock\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdCodeBlockTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading1\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading2\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading3\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading4\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading5\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading6\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHeading\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdHr\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdItalic\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdLink\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListBullet\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListChecked\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdListUnchecked\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdQuote\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdStrikethrough\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTable\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(mdTableHeader\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuLabel\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuHint\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(menuActive\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffAdd\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffContext\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffDel\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffLine\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|(diffTitle\\+[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?))$",
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
                                    "shiki",
                                    "primary",
                                    "accent",
                                    "text",
                                    "muted",
                                    "quiet",
                                    "comment",
                                    "title",
                                    "subtle",
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
                                    "menuLabel",
                                    "menuHint",
                                    "menuActive",
                                    "diffAdd",
                                    "diffContext",
                                    "diffDel",
                                    "diffLine",
                                    "diffTitle",
                                    "inherit"
                                ]
                            },
                            {
                                $ref: "#/components/schemas/Style"
                            }
                        ]
                    }
                },
                required: [],
                description: "Base style shared by every node type. Box/Text/etc. extend this.\nPure styling \u2014 no layout or lifecycle fields. Widget state interfaces\nextend `StyleState` to pick up the `visible` base-state bits alongside\nthese style fields."
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
