import { box, createRenderer, image, input, markdown, text } from "../src/index.ts"

/**
 * Minimal echo chat. Type a message, press Enter — it's appended to the
 * stream as a markdown node.
 *
 *   - `ctrl-c`  quits via the default `global.quit` binding.
 *   - `ctrl-v`  pastes from the system clipboard. Text is inserted at
 *     the cursor; images are appended to the stream as a rendered
 *     `image()` node (via the Kitty graphics protocol on supporting
 *     terminals, alt-text otherwise).
 */

const renderer = createRenderer()

renderer.ui.add(
  box(
    { bg: "bg", flexDirection: "column", padding: [0, 1] },
    text(
      ({ style }) =>
        `${style.primary("›")} ${style.dim("enter to send · ctrl-v to paste · ctrl-c to quit")}`
    ),
    box(
      { flexDirection: "row", gap: 1 },
      text(({ style }) => style.primary("❯"), { width: 1 }),
      input({ placeholder: "type a message, paste an image…" })
        .focus()
        .on("submit", ({ value }, self) => {
          if (value.trim() === "") return
          renderer.stream.append(markdown(`**you:** ${value}`))
          self.setState({ cursor: 0, value: "" })
        })
        .on("attach", ({ attachment: att }) => {
          renderer.stream.append(markdown(`*pasted ${att.kind}:* \`${att.path}\``))
          if (att.kind === "image" || att.type.startsWith("image/")) {
            renderer.stream.append(image(att.path))
          }
        })
    )
  )
)

renderer.start()
