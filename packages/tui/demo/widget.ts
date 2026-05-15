import { box, createCtx, text } from "@zaly/tui"
import { loadTheme } from "@zaly/tui/themes"

async function demo(label: string, name: string): Promise<void> {
  const theme = await loadTheme(name)
  const ctx = await createCtx({ theme })

  const status = (props: { level: "success" | "warn" | "error"; msg: string }) =>
    text(({ style }) => `${style.bold[props.level](" ● ")}${style.dim(props.msg)}`)

  const app = box(
    { gap: 1 },
    box(
      { bg: "primary", padding: [0, 1] },
      text(({ style }) => style.brightWhite.bold("@zaly/tui")),
      text(({ style }) => style.brightWhite("  agent harness · dev build"))
    ),
    box(
      { flexDirection: "row", gap: 1 },
      box(
        { border: "rounded", borderTitle: "passing", flexGrow: 1, padding: [0, 1] },
        text("168 / 168", { bold: true, fg: "success" })
      ),
      box(
        { border: "rounded", borderTitle: "pending", flexGrow: 1, padding: [0, 1] },
        text("3 queued", { fg: "warn" })
      ),
      box(
        { border: "rounded", borderTitle: "failed", flexGrow: 1, padding: [0, 1] },
        text("0", { fg: "error" })
      )
    ),
    box(
      { border: "rounded", borderTitle: "activity", borderTitleAlign: "center", padding: 1 },
      text("tool: read_file", { fg: "primary" }),
      text("  path: src/index.ts", { fg: "muted" }),
      text("  bytes: 2847", { fg: "muted" }),
      text(""),
      text("tool: edit", { fg: "primary" }),
      text("  path: src/nodes/box.ts", { fg: "muted" }),
      // Mixed-span line — resolves `ctx.style` at render time via the
      // function form of `text()`. No need to pre-bind a builder outside.
      text(({ style }) => `  lines: ${style.success("+12")} ${style.error("-4")}`),
      text(""),
      text("tool: bash", { fg: "primary" }),
      text("  cmd: bun test", { fg: "muted" }),
      text("  exit: 0", { fg: "success" })
    ),
    // Custom widget — state-driven status line. Uses `ctx.style` so the fg
    // color is picked dynamically at render time: `.bold[state.level]` maps
    // to theme slots via `keyof Theme`.
    status({ level: "success" as "success" | "warn" | "error", msg: "all systems nominal" })
  )

  console.log(`── ${label} ──`)
  const rows = await app.render(ctx)
  console.log(rows.join("\n"))
  console.log()
}

await demo("tokyonight-moon (truecolor / author palette)", "tokyonight-moon")
await demo("ansi (palette-driven — your terminal picks the hues)", "ansi")
