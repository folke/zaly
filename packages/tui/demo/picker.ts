import type { Input } from "@zaly/tui"

import { installLogger, Logger } from "@zaly/shared/logger"
import { box, createRef, createRenderer, input, picker } from "@zaly/tui"

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

const logger = new Logger({ name: "demo-logger" }, { level: "trace" })
const renderer = await createRenderer({ logger })

installLogger(logger)
const ref = createRef<Input>()

renderer.ui.add(() =>
  box(
    { flexDirection: "column", padding: [0, 1], style: "ui" },
    input({ placeholder: "try picking something…" }).ref(ref).focus(),
    picker({
      input: ref,
      async items(query) {
        console.log("finding", query)
        await new Promise((r) => setTimeout(r, 250)) // simulate async
        return ["apple", "banana", "cherry"]
          .map((label) => ({ label, value: label }))
          .filter((item) => item.label.includes(query))
      },
    }).on("select", ({ item }) => {
      logger.info(`you picked: ${item.value}`)
    })
  )
)

renderer.start()
