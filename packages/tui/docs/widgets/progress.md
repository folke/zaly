# progress

A horizontal progress bar with an optional label.

## Example

```ts
import { progress, signal } from "@zaly/tui"

const [value, setValue] = signal(0)

progress({ value, total: 1, label: "auto" })

// Drive from async work; the bar auto-re-renders on signal writes.
for (let i = 0; i <= 100; i++) setValue(i / 100)
```

## State

| field        | type                                            | default     | description                                                                                                    |
| ------------ | ----------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------- |
| `value`      | `Reactive<number>`                              | —           | Current value, clamped to `[0, total]`. Accepts a signal accessor for reactive updates.                        |
| `total`      | `Reactive<number>`                              | `1`         | Maximum value. Pair with fractional `value` to use as a 0..1 bar.                                              |
| `width`      | `Size`                                          | `"fill"`    | Bar width in cells. Shrinks to fit if `label` is present.                                                      |
| `label`      | `string \| "auto" \| (ctx, fraction) => string` | —           | Right-column label. `"auto"` formats as a percentage; the function form lets you style inline via `ctx.style`. |
| `color`      | `Color`                                         | `"primary"` | Theme slot for the filled portion.                                                                             |
| `trackColor` | `Color`                                         | `"muted"`   | Theme slot for the empty portion.                                                                              |
| `complete`   | `string`                                        | `█`         | Glyph for filled cells.                                                                                        |
| `incomplete` | `string`                                        | `░`         | Glyph for empty cells.                                                                                         |

## Notes

- `value` and `total` both accept signal accessors, so a `for await` streaming loop that just calls `setValue(x)` is all you need — no manual `setState`.
- For sub-cell precision the widget interpolates via Unicode partial blocks. Set `complete` / `incomplete` to ASCII (`#` / `-`) for terminals where that looks wrong.
