# Theming

A theme is a flat record of semantic slots — `primary`, `bg`, `fg`, `error`, `mdCode`, etc. — each resolving to a `Color` or `Style`. Widgets reference slots by name (`fg: "primary"`, `borderStyle: "border"`), and the framework resolves through the theme at render time. Swap the theme, the whole UI re-renders against the new palette — no re-wiring required.

```ts
import { createRenderer, loadTheme } from "@zaly/tui"

const theme = loadTheme("tokyonight-storm")
const renderer = createRenderer({ theme })
```

## Bundled themes

Built into the package under `assets/themes/`:

- `tokyonight-moon` (default), `tokyonight-storm`, `tokyonight-night`, `tokyonight-day`
- `catppuccin-latte`, `catppuccin-mocha`
- `dracula`, `nord`, `one-dark-pro`, `rose-pine`
- `github-dark`, `github-light`
- `gruvbox-dark-medium`
- `ansi` — palette-driven fallback; lets the terminal's own colors through.

`loadTheme(name)` searches `assets/themes/` by default; pass `{ dirs: [...] }` to add user-provided directories ahead of the bundled ones.

## Slot categories

Slots are just names. The framework uses a well-known set; custom widgets can add their own, and apps can override any of them.

| category | slots |
|----------|-------|
| palette | `fg`, `bg`, `primary`, `accent`, `dim`, `muted`, `success`, `info`, `warn`, `error` |
| chrome  | `title`, `border`, `borderTitle`, `line` |
| markdown | `mdBold`, `mdItalic`, `mdStrikethrough`, `mdHeading`, `mdHeading1`..`mdHeading6`, `mdCode`, `mdCodeBlock`, `mdCodeBlockTitle`, `mdHr`, `mdLink`, `mdListBullet`, `mdListChecked`, `mdListUnchecked`, `mdQuote`, `mdTable`, `mdTableHeader` |
| menu    | `menuLabel`, `menuHint`, `menuActive` |
| code    | `code`, `codeTitle` |
| diff    | `diffAdd`, `diffDel`, `diffContext`, `diffLine`, `diffTitle` |

See `src/style/theme.ts` for the canonical list plus defaults.

## Slot values

A slot can be either a `Color` (shorthand for `{ fg: <color> }`) or a full `Style`:

```json
{
  "primary": "blue",
  "title": { "bold": true, "fg": "primary" },
  "mdCodeBlock": { "bg": "muted", "fg": "primary" }
}
```

Slots can reference other slots — `"borderTitle": "title"` means "use the `title` slot's style." Resolution is shallow, so chains are avoided.

Colors accept:

- Basic ANSI names: `red`, `brightBlue`, `black`, …
- Hex literals: `"#82aaff"`.
- Slot refs: `"primary"`, `"error"`, …
- Alpha suffix: `"primary/15"` — pre-composites against `bg` at render time. Handy for subtle fills.
- Tonal steps: done via the style builder chain (`style.primary[300](…)`); see [Styling](./styling).

## Shiki integration

Each theme JSON carries a `shiki` field naming the matching shiki theme for code-block highlighting. Widgets rendering code ([`markdown`](../widgets/markdown), [`code`](../widgets/code), [`diff`](../widgets/diff)) read `ctx.theme.shiki` at render time, so highlighting follows the current theme automatically.

## Authoring a theme

1. Copy a bundled JSON as a starting point.
2. Edit slot values. Validation runs at `loadTheme()` — invalid values throw with a clear message.
3. Re-run `bun run build:typia` after schema changes (adding new slots / refining types).

```ts
const myTheme = loadTheme("my-theme", { dirs: ["./themes"] })
```

## Overriding live

Want to tweak a slot without forking a theme? Spread it:

```ts
import { loadTheme } from "@zaly/tui"

const base = loadTheme("tokyonight-moon")
const theme = { ...base, primary: "#ffaa00" }
```

The `theme` demo (`bun demo/theme.ts`) shows every slot exercised side-by-side — use it as a reference while authoring.

## See also

- [Styling](./styling) — `ctx.style` chainable builder, how slot refs are resolved.
- [Demo: Theme preview](../demos/theme)
