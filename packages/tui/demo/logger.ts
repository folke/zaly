import { box, createRenderer, spinner, text } from "@zaly/tui"

/**
 * Demo for the logger surface.
 *
 * `renderer.log` is a callable — `log("...")` logs at the default `"log"`
 * level; `log.info(...)`, `log.error(...)`, etc. are also available. Each
 * call appends a `log()` widget to `renderer.stream`.
 *
 *   - Strings that look like markdown get rendered as such (bold, code,
 *     links, lists, code fences with syntax highlighting).
 *   - `util.format`-style placeholders (`%s`, `%d`) are interpolated.
 *   - `Error` values are reduced to their `.message` (set
 *     `logger: { stacktrace: true }` to include the stack).
 *   - `log.install()` patches `console.log` / `.info` / `.warn` / `.error`
 *     / `.debug` / `.trace` so existing `console.*` calls route through
 *     the logger and land in the stream like any other entry.
 */

const renderer = await createRenderer({ logger: { minLevel: "trace" } })

renderer.ui.add(() =>
  box(
    { flexDirection: "column", padding: [0, 1], style: "ui" },
    box(
      { flexDirection: "row", gap: 1 },
      spinner({ color: "accent" }),
      text(
        ({ style }) =>
          `${style.primary("zaly")} ${style.dim("·")} ${style.muted("logger demo · ctrl-c to quit")}`
      )
    )
  )
)

const { log } = renderer
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

renderer.start()

async function main(): Promise<void> {
  await wait(250)

  // ── 1. One entry per level, so you can see the default prefix styles ──
  log.trace("trace-level breadcrumb")
  log.debug("debug-level diagnostic")
  log("plain log — no chrome")
  log.info("informational message")
  log.success("operation completed")
  log.cancel("user cancelled the action")
  log.warn("deprecation: please update your config")
  log.error("failed to connect to 127.0.0.1:5432")
  log.fatal("unrecoverable — shutting down")

  await wait(800)

  // ── 2. util.format placeholders ──
  log.info("resolved %d of %d tasks in %dms", 4, 5, 128)
  log.info("user=%s id=%s", "folke", "7f3b1c")
  log.info({ code: 123, message: "Connection refused" })

  await wait(800)

  // ── 3. Error values unwrap to .message by default ──
  try {
    JSON.parse("{not-valid")
  } catch (error) {
    log.error(error)
  }

  await wait(800)

  // ── 4. Markdown — strings with MD markers render as a Markdown widget ──
  log.info("**bold** and *italic* and `inline code` work inline")
  log.info(
    [
      "## Multi-line markdown",
      "",
      "- bullet one",
      "- bullet two with a [link](https://zaly.dev)",
      "",
      "```ts",
      'const ok = renderer.log.info("nested fence") // syntax-highlighted',
      "```",
    ].join("\n")
  )

  await wait(800)

  // ── 5. Patch console.* so third-party code lands here too ──
  log.install()
  console.log("hello from patched console.log")
  console.warn("hello from patched console.warn")
  console.error("hello from patched console.error")
  log.uninstall()

  await wait(3500)

  renderer.stop()
}

void main()
