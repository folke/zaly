# Theming

A theme is a flat record of semantic slots — `primary`, `bg`, `fg`, `error`, `mdCode`, etc. — each resolving to a `Color` or `Style`. Widgets reference slots by name (`fg: "primary"`, `borderStyle: "border"`), and the framework resolves through the theme at render time. Swap the theme, the whole UI re-renders against the new palette — no re-wiring required.

## Picking a theme

Three ways to get a `Theme` object, depending on what suits the app:

### Static import (tree-shakable)

```ts
import { createRenderer } from "@zaly/tui"
import dracula from "@zaly/tui/themes/dracula"

const renderer = createRenderer({ theme: dracula })
```

Each theme is a separate subpath export, so bundlers only pull in the ones you import. Best when the theme is known at build time.

### Async loader map (code-split, string-keyed)

```ts
import { createRenderer } from "@zaly/tui"
import { themes, type ThemeName } from "@zaly/tui/themes"

const theme = await themes[argv.theme ?? "tokyonight-moon"]()
const renderer = createRenderer({ theme })
```

`themes` is a record of `() => Promise<Theme>` loaders, one per bundled theme. Each loader is its own chunk, so a CLI that lets the user pick a theme at runtime doesn't drag every palette into the main bundle. `ThemeName` is a union of every bundled name, great for typing a `--theme` argument.

### `loadTheme` (also supports custom user dirs)

```ts
import { loadTheme } from "@zaly/tui"

// Built-in by name (autocompleted).
const a = await loadTheme("tokyonight-storm")

// Custom theme from a user directory. Dirs are searched first; the
// built-in loader map is the fallback. First match wins.
const b = await loadTheme("my-theme", { dirs: ["~/.config/myapp/themes"] })
```

`loadTheme` is async (built-in themes resolve through dynamic imports). Its `name` parameter is typed `BuiltinTheme | (string & {})` — editors suggest every bundled name while still accepting arbitrary strings for custom themes.

For CLIs that accept an explicit `--theme /path/to/foo.json` flag, use `await loadTheme({ path })`. File loading dynamically imports a standalone Ajv validator. Built-in themes are validated during development and skip runtime validation, so the validator stays off the main startup path.

## Bundled themes

- `tokyonight-moon` (default), `tokyonight-storm`, `tokyonight-night`, `tokyonight-day`
- `catppuccin-latte`, `catppuccin-mocha`
- `dracula`, `nord`, `one-dark-pro`, `rose-pine`
- `github-dark`, `github-light`
- `gruvbox-dark-medium`
- `ansi` — palette-driven fallback; lets the terminal's own colors through.

## Slot categories

Slots are just names. The framework uses a well-known set; custom widgets can add their own, and apps can override any of them.

| category | slots                                                                                                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| palette  | `fg`, `bg`, `primary`, `accent`, `dim`, `muted`, `success`, `info`, `warn`, `error`                                                                                                                                                        |
| chrome   | `title`, `border`, `borderTitle`, `line`                                                                                                                                                                                                   |
| markdown | `mdBold`, `mdItalic`, `mdStrikethrough`, `mdHeading`, `mdHeading1`..`mdHeading6`, `mdCode`, `mdCodeBlock`, `mdCodeBlockTitle`, `mdHr`, `mdLink`, `mdListBullet`, `mdListChecked`, `mdListUnchecked`, `mdQuote`, `mdTable`, `mdTableHeader` |
| menu     | `menuLabel`, `menuHint`, `menuActive`                                                                                                                                                                                                      |
| code     | `code`, `codeTitle`                                                                                                                                                                                                                        |
| diff     | `diffAdd`, `diffDel`, `diffContext`, `diffLine`, `diffTitle`                                                                                                                                                                               |

See `src/style/theme.ts` for the canonical list plus defaults.

## Slot values

A slot can be either a `Color` (shorthand for `{ fg: <color> }`) or a full `Style`:

```json
{
  "primary": "#82aaff",
  "title": { "bold": true, "fg": "primary" },
  "mdCodeBlock": { "bg": "muted", "fg": "primary" }
}
```

Slots can reference other slots — `"borderTitle": "title"` means "use the `title` slot's style." Resolution is shallow, so chains are avoided.

Theme JSON colors accept:

- Hex literals: `"#82aaff"`, including native alpha forms such as `"#82aaff80"`.
- Slot refs: `"primary"`, `"error"`, …
- Lightness adjustments on hex colors or slot refs: `"primary+5"`, `"bg-3"`.
- `"inherit"` to leave the parent color unchanged, except for the theme's base `fg` and `bg`.

ANSI names such as `red` and `brightBlue` are supported by runtime styles and the
system theme's terminal fallback, but are not accepted in theme JSON.

## Shiki integration

Each theme JSON carries a `shiki` field naming the matching shiki theme for code-block highlighting. Widgets rendering code ([`markdown`](../widgets/markdown), [`code`](../widgets/code), [`diff`](../widgets/diff)) read `ctx.theme.shiki` at render time, so highlighting follows the current theme automatically.

## Overriding live

Want to tweak a slot without forking a theme? Spread it:

```ts
import dracula from "@zaly/tui/themes/dracula"

const theme = { ...dracula, primary: "#ffaa00" }
```

## Authoring a custom theme

Themes live as JSON so they're portable — users can drop a file into a config directory and load it without a TS build step.

1. Copy a bundled JSON (`assets/themes/*.json`) as a starting point.
2. Edit slot values. The standalone validator checks custom JSON at load time and reports invalid fields without modifying the input.
3. Load via `loadTheme("my-theme", { dirs: ["./themes"] })` (dir search) or `loadTheme({ path: "/path/to/my-theme.json" })` (direct path).
4. The schema is generated from `CustomTheme` in `src/themes/default.ts` and its referenced types. Color constraints and plugin-slot rules are enriched by `packages/dev/src/schemas-theme.ts`. Run `bun z build` to regenerate `assets/schemas/theme.schema.json` and `src/schemas/gen/theme.ts`; the typed runtime wrapper lives in `src/schemas/theme.ts`.

> [!TIP]
> Contributing a new theme upstream? Drop the JSON into `assets/themes/`, run `bun scripts/gen-themes.ts` to regenerate the bundled loader map (`src/themes/*.ts` + `src/themes/index.ts`), and it becomes a first-class built-in with its own subpath export and `ThemeName` entry.

## See also

- [Styling](./styling) — `ctx.style` chainable builder, how slot refs are resolved.
- `bun demo/theme.ts` — every theme slot exercised side-by-side against a sample layout. Run locally while authoring.
