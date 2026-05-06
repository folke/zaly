# spinner

Animated spinner keyed off wall time.

## Example

```ts
import { signal, spinner } from "@zaly/tui"

spinner({ color: "accent" })

// Toggleable via a signal — no manual timers.
const [running, setRunning] = signal(true)
spinner({ running, frames: "dots" })
setRunning(false) // stops without tearing down
```

## State

| field     | type                                                                            | default     | description                                                             |
| --------- | ------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------- |
| `frames`  | `"arrow" \| "bouncingBar" \| "circle" \| "dots" \| "line" \| readonly string[]` | `"dots"`    | Built-in frame set name or a custom array.                              |
| `speed`   | `number`                                                                        | `80`        | Milliseconds per frame.                                                 |
| `color`   | `Color`                                                                         | `"primary"` | Theme slot or explicit color.                                           |
| `running` | `Reactive<boolean>`                                                             | `true`      | When `false`, the interval stops and the current frame stays on screen. |

## Notes

- The frame is a pure function of `Date.now() / speed` — no per-node state. That means two spinners with the same `speed` stay in lockstep.
- Flipping `running` from `true` → `false` stops the interval but keeps the glyph; flipping back to `true` resumes cleanly.
- Built-in frame sets are listed in `src/widgets/spinner.ts` — copy any of them as a starting point for custom ones.
