import { box, createRenderer, input, markdown, text } from "../src/index.ts"

/**
 * Minimal echo chat. Type a message, press Enter — it's appended to the
 * stream as a markdown node. Ctrl-C quits via the default `global.quit`
 * binding that the Renderer installs on `start()`.
 */

const renderer = createRenderer()

renderer.ui.add(
  box(
    { bg: "bg", flexDirection: "column", padding: [0, 1] },
    text(({ style }) => `${style.primary("›")} ${style.dim("enter to send · ctrl-c to quit")}`),
    box(
      { flexDirection: "row", gap: 1 },
      text(({ style }) => style.primary("❯"), { width: 1 }),
      input({ placeholder: "type a message…" })
        .focus()
        .on("submit", (value, self) => {
          if (value.trim() === "") return
          renderer.stream.append(markdown(`**you:** ${value}`))
          self.setState({ cursor: 0, value: "" })
        })
    )
  )
)

renderer.start()
