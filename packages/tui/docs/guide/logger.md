# Logger

`renderer.log` is a `console.log`-shaped callable that appends [`log()`](../widgets/log) entries to the stream surface. When no stream is attached (or the renderer isn't running) it falls back to writing plain lines to stdout / stderr, so the same calls work identically in non-interactive runs.

## Basic use

```ts
const { log } = renderer

log("hi") // level "log"
log.info("resolved %d tasks in %dms", 4, 128)
log.success("build complete")
log.warn("deprecated — please update your config")
log.error(new Error("boom"))
log.fatal("unrecoverable")
```

- Every `LogLevel` is a method: `trace`, `debug`, `log`, `info`, `success`, `cancel`, `warn`, `error`, `fatal`.
- `util.format` placeholders (`%s`, `%d`, `%O`) are interpolated.
- `Error` values are reduced to `.message` by default — set `stacktrace: true` to keep the full trace.
- Strings with markdown markers are rendered as markdown (bold, inline code, fenced blocks with syntax highlighting, …).
- Routing: `error`, `fatal`, `warn` → `stderr` fallback; everything else → `stdout`.

## Intercepting `console.*`

Opt-in, so existing `console.log` calls from third-party code route through the same pipeline:

```ts
log.install()
console.log("from-patched-console") // renders as a log() entry
log.uninstall() // restores the originals
```

> [!WARNING]
> `install()` patches globals. Only do it when the renderer is running and attached to a TTY — in non-interactive contexts, either skip the install or rely on the stdout/stderr fallback.

## Configuration

Pass through `createRenderer({ logger: {...} })`:

```ts
const renderer = createRenderer({
  logger: {
    minLevel: "info", // skip trace/debug
    stacktrace: false, // Error → .message only
    markdown: true, // render MD in string bodies (default)
    styles: {
      error: { icon: "✗" }, // per-level overrides
    },
    factory: (level, msg) => log({ level, content: inspect(msg) }),
  },
})
```

| field        | type                                          | default            | description                                                                              |
| ------------ | --------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| `minLevel`   | `LogLevel`                                    | `"log"`            | Below this is dropped.                                                                   |
| `markdown`   | `boolean`                                     | `true`             | Render MD-looking strings as a `markdown()` node.                                        |
| `stacktrace` | `boolean`                                     | `false`            | Keep `Error` stack traces instead of `.message`.                                         |
| `styles`     | `Partial<Record<LogLevel, LogStyleOverride>>` | —                  | Per-level overrides for the `log()` widget's prefix (icon / color / style).              |
| `factory`    | `(level, msg) => Node`                        | built-in           | Replace the default `log()` builder — emit any Node you like (tool cards, images, etc.). |
| `inspect`    | `util.InspectOptions`                         | `{ colors: true }` | Forwarded to `formatWithOptions` for non-string args.                                    |
| `write`      | `(text, "stdout" \| "stderr") => void`        | —                  | Override the no-stream fallback writer. Mainly for tests.                                |

## Direct `Logger` use

Apps that want a standalone logger (no renderer) can construct one directly:

```ts
import { Logger } from "@zaly/tui"

const logger = new Logger({ minLevel: "info" })
logger.error("boom") // goes to stderr
logger.attach(stream) // now goes to the stream surface
logger.detach() // back to stdout/stderr
logger.install() / uninstall() // console.* patching
```

The callable wrapper (`makeLog(logger)`) is what `renderer.log` is — it preserves the same `fn(msg)` + `fn.level(...)` surface.

## See also

- [`log()`](../widgets/log) widget — the default entry renderer.
- [Demo: Logger](../demos/logger) — every level + markdown + console interception on one screen.
