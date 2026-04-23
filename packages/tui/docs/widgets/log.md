# log

Render a single log entry — level-styled prefix followed by the body. Used internally by [`Logger`](../guide/logger) but also handy for custom log pipelines.

## Example

```ts
import { log, markdown } from "@zaly/tui"

log({ level: "info", content: "indexing complete" })
log({ level: "error", content: "failed to connect to 127.0.0.1:5432" })

// Body can be any Node, so markdown / code / images compose cleanly:
log({ level: "success", content: markdown("Upload **done** in 1.2s") })
```

## State

| field       | type                                | default       | description |
|-------------|-------------------------------------|---------------|-------------|
| `level`     | `LogLevel`                          | —             | One of `trace`, `debug`, `log`, `info`, `success`, `cancel`, `warn`, `error`, `fatal`. Drives the default prefix style. |
| `content`   | `Node \| string \| (ctx) => string` | —             | The message body. Strings wrap in [`text`](./text); pass a Node for richer content. |
| `style`     | `"badge" \| "icon" \| "prompt" \| "title" \| "text"` | per-level | Rendering of the prefix chunk. |
| `icon`      | `string`                            | per-level     | Glyph for `icon` / `prompt` styles. |
| `color`     | `Color`                             | per-level     | Theme slot tinting the prefix. |
| `textColor` | `Color`                             | —             | Optional fg applied to a string body. Ignored when `content` is a Node. |
| `prefix`    | `string`                            | —             | Extra plain text prepended to the auto-prefix (unstyled). |

## Default per-level styles

| level | style | icon | color |
|-------|-------|------|-------|
| `trace`   | icon   | ⠿ | `dim` |
| `debug`   | prompt | ⚙ | `info` |
| `log`     | icon   | ● | `dim` |
| `info`    | icon   | ℹ | `info` |
| `success` | icon   | ✔ | `success` |
| `cancel`  | icon   | ✖ | `warn` |
| `warn`    | badge  | ⚠ | `warn` |
| `error`   | badge  | ✖ | `error` |
| `fatal`   | badge  | ☢ | `error` |

## Notes

- Wrapped body rows indent to align with the prefix width — multi-line messages read cleanly.
- Prefix styles: `badge` is a filled-bg label, `icon` is just the glyph, `prompt` is icon + bold level, `title` is `level:` bold.

> [!TIP]
> For `console.*`-style logging that appends entries into the stream surface, use [`renderer.log`](../guide/logger) — it wraps this widget in a full `Logger` with level filtering, `util.format` placeholders, and console interception.
