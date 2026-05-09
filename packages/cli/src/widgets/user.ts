import type { Attachment, FilePart } from "@zaly/ai"
import type { Node } from "@zaly/tui"

import { prettyPath } from "@zaly/shared"
import { box, hyperlink, image, text, widget } from "@zaly/tui"
import { bubble } from "./bubble.ts"

/** Single user-turn bubble. Plain text plus optional attachments —
 *  images render as real picture rows via `image()`, PDFs as a text
 *  link with the file name. Static once committed; no closure
 *  reactivity needed. */
export const userMessage = widget(
  (props: { content: string; attachments?: readonly Attachment[] }) => {
    const children: Node[] = []
    if (props.content !== "") children.push(text(props.content))
    for (const att of props.attachments ?? []) {
      const info = fileInfo(att)
      if (info.type === "image") {
        children.push(box({ padding: [1, 0, 0, 0] }, image({ alt: info.name, src: info.src })))
      } else {
        const link = info.source.type === "base64" ? info.name : hyperlink(info.src, info.name)
        children.push(text(({ style }) => style.dim(`📄 ${link}`)))
      }
    }
    return bubble({ type: "user" }, ...children)
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
