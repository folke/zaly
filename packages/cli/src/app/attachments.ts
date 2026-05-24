import type { Attachment, Model } from "@zaly/ai"
import type { InputAttachment } from "@zaly/tui"

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

export function canAttach(att: InputAttachment, model?: Model): boolean {
  if (!model) return false
  if (att.type === "image" && model.canAttach("image")) return true
  if (att.type === "pdf" && model.canAttach("pdf")) return true
  return false
}
