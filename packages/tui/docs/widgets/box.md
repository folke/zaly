# box

Layout container. Stacks children in a column or row, with optional border, padding, gap, and a titled frame.

## Example

```ts
import { box, text } from "@zaly/tui"

box(
  { border: "rounded", borderTitle: "activity", padding: 1, gap: 1 },
  text("tool: read_file", { fg: "primary" }),
  text("  path: src/index.ts", { fg: "muted" })
)

// Row layout — children flex into available width.
box(
  { flexDirection: "row", gap: 1 },
  box({ border: "rounded", flexGrow: 1 }, text("one")),
  box({ border: "rounded", flexGrow: 1 }, text("two"))
)

// Style-less shorthand — just children.
box(text("a"), text("b"))
```

Falsy children (`false`, `null`, `undefined`) are filtered out, so conditional composition works cleanly: `box(cond && child)`.

## State

| field                              | type                            | default              | description                                                            |
| ---------------------------------- | ------------------------------- | -------------------- | ---------------------------------------------------------------------- |
| `flexDirection`                    | `"row" \| "column"`             | `"column"`           | Child stacking axis.                                                   |
| `gap`                              | `number`                        | `0`                  | Cells between children on the main axis.                               |
| `padding`                          | `number \| [v,h] \| [t,r,b,l]`  | `0`                  | Inner padding.                                                         |
| `border`                           | `BorderSpec`                    | —                    | `"rounded"`, `"single"`, `"double"`, `"thick"`, or a custom glyph set. |
| `borderTitle`                      | `string`                        | —                    | Title string rendered into the top border.                             |
| `borderTitleAlign`                 | `"left" \| "center" \| "right"` | `"left"`             |                                                                        |
| `borderStyle`                      | `string \| Style`               | `"border"` slot      | Style for border glyphs.                                               |
| `borderTitleStyle`                 | `string \| Style`               | `"borderTitle"` slot | Style for title text.                                                  |
| `width`, `minWidth`, `maxWidth`    | `Size`                          | `"fill"`             | See `Size`.                                                            |
| `height`, `minHeight`, `maxHeight` | `Size`                          | auto                 | Vertical sizing in column layouts.                                     |
| `flexGrow`                         | `number`                        | `0`                  | Share of remaining row-axis space in a `row` parent.                   |
| `fg`, `bg`, attrs                  | —                               | theme                | Ambient style wrapping the whole box.                                  |

## Notes

- Row layout allocates widths from child `flexGrow` / `minWidth` / `maxWidth` — see `layout/row.ts` for the algorithm.
- Column layout stacks children at the box's inner width; each child renders top-to-bottom with `gap` blank rows between.
- Background fills apply to padded rows too — set `bg` to fill the entire box with a color.
- Borders reserve two cells of outer width (one on each side); padding sits inside the border.
