import { box, createRenderer, image, input, markdown, text } from "@zaly/tui"

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

const renderer = await createRenderer()

renderer.ui.add(() =>
  box(
    { flexDirection: "column", padding: [0, 1], style: "ui" },
    text(
      ({ style }) =>
        `${style.primary("›")} ${style.dim("enter to send · ctrl-v to paste · ctrl-c to quit")}`
    ),
    box(
      { flexDirection: "row", gap: 1 },
      text(({ style }) => style.primary("❯"), { width: 1 }),
      input({ placeholder: "type a message, paste an image…" })
        .focus()
        .on("submit", ({ value, attachments }) => {
          if (value.trim() === "") return
          for (const att of attachments) {
            renderer.stream.append(() => markdown(`*attached ${att.type}:* \`${att.path}\``))
            if (att.type === "image") {
              renderer.stream.append(() => image(att.path))
            }
          }
          renderer.stream.append(() => markdown(`**you:** ${value}`))
        })
    )
  )
)

renderer.start()
