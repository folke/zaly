import type { Attachment, ContentPart, Message, TextPart } from "@zaly/ai"
import type { InputAttachment } from "@zaly/tui/widgets/input"
import type { ComposerCtx, ComposerPlugin, ComposerSubmitCtx } from "../composer.ts"

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
