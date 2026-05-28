import type { Message } from "@zaly/ai"
import type { Accessor, Reactive } from "@zaly/tui"
import type { Box } from "@zaly/tui/widgets/box"
import type { Composer } from "../app/composer.ts"

import { justText } from "@zaly/ai"
import { createAsync, createRef, RenderContext, unwrap, useContext } from "@zaly/tui"
import { text } from "@zaly/tui/widgets/text"
import { widget } from "@zaly/tui/widgets/widget"
import { bubble } from "./bubble.ts"

/** Single user-turn bubble. Plain text plus optional attachments —
 *  images render as real picture rows via `image()`, PDFs as a text
 *  link with the file name. Static once committed; no closure
 *  reactivity needed. */
export const userMessage = widget(
  (props: {
    message: Reactive<Message<"user">>
    pending?: Accessor<boolean>
    composer?: Composer
  }) => {
    const { composer, message } = props
    const children = createRef<Box>()

    const context = useContext(RenderContext)

    const formatted = createAsync(
      async () => {
        const style = context?.style()
        const m = unwrap(message)
        const content = justText(m.content)
        if (!composer || !style) return content
        const nodes = await composer.render(content, { message: m, style })
        const childBox = children()
        childBox.splice(1, childBox.children.length - 1, ...nodes)
        return await composer.format(content, { message: m, style })
      },
      { initialValue: justText(unwrap(message).content) }
    )

    return bubble({ childrenBox: children, pending: props.pending, type: "user" }, text(formatted))
  }
)
