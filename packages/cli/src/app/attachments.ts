import type { Attachment, Model } from "@zaly/ai"
import type { Input } from "@zaly/tui"

import { readFile } from "node:fs/promises"

/**
 * Paste flow staging buffer. The user pastes a file path; we encode
 * the bytes into the right `Attachment` part, reserve a `[Image #n]`
 * / `[PDF #n]` placeholder in the input, and remember the mapping
 * until submit time.
 *
 * On submit, the App walks the input text for placeholders and pulls
 * the matching parts from `consume()`; everything is cleared so the
 * next message starts fresh.
 */
export class AttachmentBuffer {
  readonly #entries = new Map<number, Attachment>()
  #counter = 0

  /** Resolve the parts referenced by `[Image #n]` / `[PDF #n]` markers
   *  in `text`, in document order. Then clear the buffer — every paste
   *  staged before this point has either been consumed or silently
   *  dropped by the user editing it out. */
  consume(text: string): Attachment[] {
    const re = /\[(?:Image|PDF) #(\d+)\]/g
    const out: Attachment[] = []
    for (const m of text.matchAll(re)) {
      const entry = this.#entries.get(Number(m[1]))
      if (entry) out.push(entry)
    }
    this.#entries.clear()
    this.#counter = 0
    return out
  }

  /** Stage a paste event from the composer. Detects image vs PDF,
   *  checks model support, encodes the payload, and inserts the
   *  matching placeholder at the input's cursor. Unsupported kinds
   *  fall through to pasting the path as plain text. */
  async stage(
    att: { kind: "image" | "file"; path: string; type: string },
    input: Input,
    model: Model
  ): Promise<void> {
    const isImage = att.kind === "image" || att.type.startsWith("image/")
    const isPdf =
      att.kind === "file" &&
      (att.type === "application/pdf" || att.path.toLowerCase().endsWith(".pdf"))

    if (isImage && model.canAttach("image")) {
      const { toImagePart } = await import("@zaly/ai")
      const { fileDetect } = await import("@zaly/shared/detect")
      const detected = await fileDetect(att.path)
      if (detected?.type !== "image") {
        console.error(`couldn't read image \`${att.path}\``)
        return insertAtCursor(input, att.path)
      }
      const { imageConvert, imageInfo } = await import("@zaly/shared/image")
      const info = await imageInfo(detected)
      const ready = await imageConvert(info, ["png", "jpeg", "webp"])
      if (!ready) {
        console.error(`couldn't convert \`${att.path}\` (**${info.format}**) to png/jpeg/webp`)
        return insertAtCursor(input, att.path)
      }
      const idx = ++this.#counter
      this.#entries.set(idx, toImagePart(ready))
      insertAtCursor(input, `[Image #${idx}]`)
      return
    }

    if (isPdf && model.canAttach("pdf")) {
      const { toPdfPart } = await import("@zaly/ai")
      const data = await readFile(att.path).catch((error: unknown) => {
        console.error(`couldn't read **PDF** \`${att.path}\`: ${(error as Error).message}`)
        return undefined
      })
      if (!data) return insertAtCursor(input, att.path)
      const idx = ++this.#counter
      this.#entries.set(idx, toPdfPart(data))
      insertAtCursor(input, `[PDF #${idx}]`)
      return
    }

    // Unsupported modality, unknown file kind, or model doesn't accept
    // attachments of this type — surface the path as plain text so the
    // user can keep typing or remove it.
    insertAtCursor(input, att.path)
  }
}

/** Insert `s` at the input's current cursor and advance the cursor. */
function insertAtCursor(input: Input, s: string): void {
  const v = input.state.value ?? ""
  const c = input.state.cursor ?? 0
  input.setState({ cursor: c + s.length, value: v.slice(0, c) + s + v.slice(c) })
}
