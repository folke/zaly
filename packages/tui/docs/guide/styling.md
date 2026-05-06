# Styling

`@zaly/tui` has two tightly coupled styling primitives:

- **`Style`** — a plain object describing foreground, background, and attribute flags. What you pass when you want fully static styling.
- **`StyleBuilder`** — a chainable, theme-bound function reachable from `ctx.style` during a render. What you use when you want expressive inline styling.

Both funnel through the same resolver, so a builder chain, a theme slot name, and a raw `Style` object all produce identical ANSI output.

## The `Style` object

```ts
interface Style {
  fg?: Color
  bg?: Color
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  inverse?: boolean
  strikethrough?: boolean
}
```

Pass it anywhere a style is accepted:

```ts
text("hello", { fg: "primary", bold: true })
box({ bg: "muted", padding: [0, 1] } /* ... */)
```

Widget state types that extend `StyleState` pick up these fields automatically.

## `ctx.style` — the chainable builder

Inside any render function, `ctx.style` is a **`StyleBuilder`** bound to the current theme. It's a callable Proxy: reading a property returns a new builder with that attribute/color/slot applied; calling the builder styles a string.

```ts
text(({ style }) => style.primary.bold("zaly"))
// → ANSI bold + primary-theme-color around "zaly"
```

Every chain access returns a fresh builder, so intermediates are reusable:

```ts
const err = ctx.style.red.bold
err("oops") // "\x1b[1;31moops\x1b[0m"
err.underline("fatal") // with an added underline
```

Calling an empty builder is a no-op: `ctx.style()("x") === "x"`.

### Attributes

Any of `bold`, `dim`, `italic`, `underline`, `inverse`, `strikethrough` can chain anywhere in the expression:

```ts
style.bold("title")
style.italic.dim("aside")
style.underline.strikethrough("ugh")
```

### ANSI colors

Sixteen names, plus their `bright*` variants:

```ts
style.red("err")
style.brightCyan("note")
style.bgYellow.black("flag")
```

### Theme slots

Any key from the active theme — `primary`, `accent`, `muted`, `success`, `error`, `mdCode`, etc. — works as a chain property:

```ts
style.primary("zaly")
style.success("ok")
style.mdCodeBlock("<pre>")
```

Theme slots whose value is a `Style` object (not just a color) merge all of their fields onto the chain. So a slot like `title: { bold: true, fg: "primary" }` gives you the full attr + fg in one access:

```ts
style.title("Hello") // bold + theme primary fg
```

### Background variants — `bgFoo` / `fgFoo`

Prefixing any color name or theme slot with `bg` or `fg` sets that channel explicitly:

```ts
style.bgPrimary.white("tag")
style.fgAccent("label")
style.bgMuted.fgError("!")
```

`bg` + name follows the same rules for style-valued slots — `bgDiffAdd` extracts the `bg` channel from the `diffAdd` slot and applies it.

### Setting colors explicitly — `.fg()` / `.bg()`

When you need a color that isn't an ANSI name or theme slot — hex values, for example — use `.fg()` / `.bg()`:

```ts
style.fg("#82aaff")("text")
style.bg("#1a1b26").fg("#c0caf5")("block")
```

These are identical to the chain-property form; the setter variant is just an escape hatch when the key isn't known ahead of time.

### Tonal variants — `[step]`

After setting a color, a numeric step property shifts it along an OKLCH tonal scale. Steps are `50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950`:

```ts
style.primary[300]("lighter")
style.primary[900]("darker")
style.fg("#82aaff")[200]("shifted hex")
```

Steps replace any previously applied step — `[300][500]` lands on `500`, not on a stacked suffix.

Tonal shifts work on hex colors and theme slots. They're a no-op on ANSI names (which don't map to a tonal scale) and on `inherit`.

### Alpha — `.alpha()`

Appends an alpha percentage (0..100) to the most recently set color channel. The color resolver pre-composites it against the theme's background at render time, so subtle washes work natively:

```ts
style.primary.alpha(20)("soft")
style.bgError.alpha(15)(" !! ")
style.fg("#82aaff").alpha(50)("half-opaque")
```

Alpha replaces any existing alpha suffix (`/xx`) on the color.

### Merging a Style — `.add()`

Take a theme-slot name or an arbitrary `Style` object and merge its fields onto the current chain:

```ts
style.add("menuActive")("row")
style.add({ bold: true, bg: "primary/20" })("inline")
style.bold.add(userStyle)("composed")
```

Useful when the caller hands you a `string | Style | undefined` from state — `.add(opt ?? {})` keeps the chain working even when `opt` is unset.

## Colors, in depth

A `Color` is any of:

| Form               | Example                              |
| ------------------ | ------------------------------------ |
| Hex                | `"#82aaff"`, `"#fa8"`, `"#82aaff88"` |
| ANSI name          | `"red"`, `"gray"`                    |
| Bright ANSI        | `"brightRed"`, `"brightBlue"`        |
| Theme slot         | `"primary"`, `"mdCode"`              |
| `"inherit"`        | leaves the channel untouched         |
| `"<base>-<step>"`  | `"primary-300"`, `"#82aaff-900"`     |
| `"<slot>/<alpha>"` | `"primary/20"` (20% opacity over bg) |

The tonal (`-300`) and alpha (`/20`) suffixes stack cleanly — e.g. `"primary-300/50"` is valid.

### Hex with alpha

`#rrggbbaa` is supported natively; no separate `/<alpha>` suffix needed:

```ts
style.fg("#82aaff88")(" · ") // 53% alpha
```

Alpha-tagged colors are always composited against `theme.bg` at resolve time, so they behave like a "tint" over the surface rather than a translucent overlay.

## Usage patterns

### In a `text` callback

```ts
text(({ style }) => `${style.primary("zaly")} ${style.dim("ready")}`)
```

### Pre-bound outside render

For performance-sensitive paths, build once and reuse:

```ts
const err = ctx.style.error.bold
rows.map((line) => err(line))
```

### Composing with state-level styling

Widget `TextStyle` / `BoxStyle` fields (`fg`, `bg`, `bold`, etc.) and builder chains produce the same ANSI — pick whichever reads best:

```ts
// state-driven
text("hi", { fg: "primary", bold: true })

// callback
text(({ style }) => style.primary.bold("hi"))
```

### Custom themes

Every theme slot you define becomes a chain property automatically. Add a `fancyBadge` slot to your theme, and `style.fancyBadge(…)` and `style.bgFancyBadge(…)` work without any framework changes.

## Escape hatches

- `openStyle(style, theme)` — return the raw opening SGR escape for a `Style`.
- `reapplyStyle(s, escape)` — post-process a string so an outer style is re-applied after any inner reset.
- `hyperlink(url, text)` — wrap text in an OSC 8 hyperlink (independent of the SGR channel).

These live at the `@zaly/tui` root exports and are used by a few of the built-in widgets when the builder abstraction doesn't fit.
