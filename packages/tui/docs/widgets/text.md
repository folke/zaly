# text

The primitive for rendering a string as one or more rows. Handles ANSI-aware wrapping, per-row padding, and ambient style inheritance.

## Example

```ts
import { text } from "@zaly/tui"

text("hello")
text("hello", { fg: "primary", bold: true })
text({ content: "hello", fg: "primary" })
text(({ style }) => `ok: ${style.success("yes")}`)
```

The function form of `content` runs at render time and gets the live `RenderCtx`, so you can mix theme-aware spans without pre-binding a style builder.

## State

| field      | type                                         | default | description |
|------------|----------------------------------------------|---------|-------------|
| `content`  | `string \| (ctx) => string`                  | —       | The text to render. Function form is re-evaluated per render. |
| `wrap`     | `"word" \| "char" \| "none"`                 | `"word"`| Wrap strategy. `"none"` keeps explicit newlines only. |
| `width`    | `Size`                                       | `"fill"`| Target width. See `Size` for numeric / `"fill"` / `"auto"` forms. |
| `fg`, `bg`, attrs | see [Styling](../guide/styling)       | theme   | Ambient style; nested ANSI is re-applied around inner `RESET`s. |

## Notes

- ANSI inside `content` is preserved through wrapping and padding — `splitAnsi` normalizes any SGR state the runtime leaves open across inserted line breaks.
- For multi-element layout, compose with [`box`](./box) rather than stuffing everything into one `text`.

> [!TIP]
> Use `wrap: "none"` when rendering pre-wrapped ANSI art, a code block, or anything where you control line breaks yourself.
