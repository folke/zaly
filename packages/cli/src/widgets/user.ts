import type { FilePart, Message } from "@zaly/ai"
import type { Accessor, Node } from "@zaly/tui"
import type { FileRef, InputFormatter } from "../app/composer.ts"

import { isAttachment, justText, toParts } from "@zaly/ai"
import { prettyPath } from "@zaly/shared"
import { box, createAsync, image, RenderContext, text, useContext, widget } from "@zaly/tui"
import { hyperlink } from "@zaly/tui/ansi"
import { bubble } from "./bubble.ts"

/** Single user-turn bubble. Plain text plus optional attachments —
 *  images render as real picture rows via `image()`, PDFs as a text
 *  link with the file name. Static once committed; no closure
 *  reactivity needed. */
export const userMessage = widget(
  (props: { message: Message<"user">; pending?: Accessor<boolean>; format?: InputFormatter }) => {
    const children: Node[] = []
    const m = props.message
    const content = justText(m.content)
    const attachments = toParts(m.content).filter((p) => isAttachment(p))

    const context = useContext(RenderContext)

    const formatted = createAsync(
      async () => {
        const style = context?.style()
        if (!props.format || !style) return content
        return (await props.format(content, { message: props.message, style })) ?? content
      },
      { initialValue: content }
    )

    const refs = (m.meta?.fileRefs ?? []) as FileRef[]
    if (content !== "") children.push(text(formatted))
    for (const att of attachments) {
      const info = fileInfo(att)
      if (info.type === "image") {
        children.push(box({ padding: [1, 0, 0, 0] }, image({ alt: info.name, src: info.src })))
      } else {
        const link = info.source.type === "base64" ? info.name : hyperlink(info.src, info.name)
        children.push(text(({ style }) => style.dim(`📄 ${link}`)))
      }
    }
    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i]
      const link = hyperlink(ref.path, ref.ref)
      const prefix = i === refs.length - 1 ? "└╴" : "├╴"
      children.push(
        text(
          ({ style }) =>
            `${style.border(prefix)}${style.primary.bold("read")}(${style.success(`"${link}"`)})`
        )
      )
    }

    return bubble({ pending: props.pending, type: "user" }, ...children)
  }
)

function fileInfo<T extends FilePart>(part: T): T & { src: string; name: string } {
  const source = part.source
  const ret = { ...part, name: source.type as string, src: "" }
  if (source.type === "file") {
    ret.src = source.path
    ret.name = prettyPath(source.path)
  } else if (source.type === "url") {
    ret.src = source.url
    ret.name = source.url
    // oxlint-disable-next-line typescript/no-unnecessary-condition
  } else if (source.type === "base64") {
    ret.src = `data:${part.mime};base64,${source.data}`
  }
  return ret
}
