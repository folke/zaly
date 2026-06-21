import type { Attachment, ContentPart, FilePart, Message, TextPart } from "@zaly/ai"
import type { Node } from "@zaly/tui"
import type { InputAttachment } from "@zaly/tui/widgets/input"
import type {
  ComposerCtx,
  ComposerPlugin,
  ComposerRenderCtx,
  ComposerSubmitCtx,
} from "../composer.ts"

import { prettyPath } from "@zaly/shared"
import { box } from "@zaly/tui/widgets/box"

export class MessageComposer implements ComposerPlugin {
  name = "message"

  async submit(text: string, ctx: ComposerSubmitCtx): Promise<void> {
    const attachments = await attachmentParts(ctx.attachments)
    const message: Message<"user"> = {
      content:
        attachments.length === 0
          ? text
          : ([{ text, type: "text" } as TextPart, ...attachments] as ContentPart[]),
      role: "user",
    }
    ctx.message = message
    ctx.agent.send(message, { run: false })
  }

  validate(_text: string, ctx: ComposerCtx): true | string {
    if (!ctx.app.ready) return "App is not ready yet. Please wait a moment and try again."
    if (!ctx.app.agent.model)
      return "No active model. Please use `/model` to select a model and try again."
    return true
  }

  async render(ctx: ComposerRenderCtx): Promise<Node[]> {
    const m = ctx.message
    const children: Node[] = []
    const { isAttachment, toParts } = await import("@zaly/ai")
    const { image } = await import("@zaly/tui/widgets/image")
    const { text } = await import("@zaly/tui/widgets/text")
    const { hyperlink } = await import("@zaly/tui/ansi")

    const attachments = toParts(m.content).filter((p) => isAttachment(p))

    for (const att of attachments) {
      const info = fileInfo(att)
      if (info.type === "image") {
        children.push(box({ padding: [1, 0, 0, 0] }, image({ alt: info.name, src: info.src })))
      } else {
        const link = info.source.type === "base64" ? info.name : hyperlink(info.src, info.name)
        children.push(text(({ style }) => style.dim(`📄 ${link}`)))
      }
    }
    return children
  }
}

export async function attachmentParts(atts: InputAttachment[]): Promise<Attachment[]> {
  const ret = await Promise.all(atts.map((att) => attachmentPart(att)))
  return ret.filter((a): a is Attachment => a !== undefined)
}

async function attachmentPart(att: InputAttachment): Promise<Attachment | undefined> {
  if (att.type === "image") {
    const { toImagePart } = await import("@zaly/ai")
    const { imageConvert, imageInfo } = await import("@zaly/shared/image")
    const info = await imageInfo(att)
    const ready = await imageConvert(info, ["png", "jpeg", "webp"])
    if (!ready) {
      console.error(`couldn't convert \`${att.path}\` (**${info.format}**) to png/jpeg/webp`)
      return
    }
    return toImagePart(ready)
  }

  if (att.type === "pdf") {
    const { toPdfPart } = await import("@zaly/ai")
    return toPdfPart(att.data)
  }
}

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
    ret.name = `[Image ${part.mime}]`
  }
  return ret
}
