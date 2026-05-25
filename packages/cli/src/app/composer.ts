import type { Agent, ReadTool } from "@zaly/agent"
import type { Attachment, ContentPart, Message, Model, ParamsOf, TextPart } from "@zaly/ai"
import type { InputAttachment, Renderer } from "@zaly/tui"
import type { App } from "./app.ts"

import { normPath, safeStatAsync } from "@zaly/shared"
import { input } from "@zaly/tui"
import { userMessage } from "../widgets/user.ts"

export type FileRef = {
  ref: string
  path: string
  from?: number
  to?: number
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

function canAttach(att: InputAttachment, model?: Model): boolean {
  if (!model) return false
  if (att.type === "image" && model.canAttach("image")) return true
  if (att.type === "pdf" && model.canAttach("pdf")) return true
  return false
}

export const createComposer = ({ app }: { app: App }) =>
  input({
    canAttach: (att) => canAttach(att, app.agent.model),
    format: (value, ctx) =>
      value
        .replace(/^(\/\w+)/, (_, slashcmd) => ctx.style.primary(slashcmd))
        .replace(/(@\S+)/g, (_, file) => ctx.style.mdLink(file)),
    placeholder: "Ask zaly anything…",
  }).on("submit", async ({ value, attachments }) => {
    const trimmed = value.trim()
    if (trimmed === "" || !app.ready) return
    if (!app.agent.model) {
      app.ctx.error("No active model. Please use `/model` to select a model and try again.")
      return
    }
    const atts = await attachmentParts(attachments)
    await submit(value, atts, app.agent, app.renderer)
    void app.agent.waitIdle()
  })

/**
 * Submit user text + staged attachments. Appends the user widget to
 * the stream (so the bubble shows the text the user typed, including
 * `[Image #n]` / `[PDF #n]` placeholders that render as inline image
 * / PDF widgets), then injects the equivalent `Message` into the
 * agent.
 *
 * Pure-ish: depends on `renderer.stream` and `agent.inject` but holds
 * no state. Caller is responsible for clearing the composer + the
 * attachment buffer around this call.
 */
async function submit(
  text: string,
  attachments: readonly Attachment[],
  agent: Agent,
  renderer: Renderer
): Promise<void> {
  const message: Message<"user"> =
    attachments.length === 0
      ? { content: text, role: "user" }
      : {
          content: [{ text, type: "text" } as TextPart, ...attachments] as ContentPart[],
          role: "user",
        }

  const refs: FileRef[] = []
  const messages: Message[] = []

  const REF_RE = /@([^\s,;]+)/g
  const RANGE_RE = /^(.*?)(?::(\d+)(?:-(\d+))?)?$/
  const CONTEXT = 3

  for (const [, ref] of text.matchAll(REF_RE)) {
    const match = ref.match(RANGE_RE)
    if (!match) continue

    const [, file, fromRaw, toRaw] = match
    const from = fromRaw ? Number(fromRaw) : undefined
    const to = toRaw ? Number(toRaw) : undefined
    const path = normPath(file)
    // oxlint-disable-next-line no-await-in-loop
    const s = await safeStatAsync(path)
    if (!s?.isFile()) continue
    refs.push({ from, path, ref: `@${ref}`, to })
  }

  if (refs.length > 0) {
    message.meta ??= {}
    message.meta.fileRefs = refs
  }

  renderer.stream.append(() => userMessage({ message }))

  await Promise.all(
    refs.map(async (ref) => {
      const { path, from, to } = ref

      let offset: number | undefined
      let limit: number | undefined

      if (from !== undefined) {
        if (to === undefined) {
          offset = Math.max(1, from - CONTEXT)
          limit = CONTEXT * 2 + 1
        } else {
          const start = Math.min(from, to)
          const end = Math.max(from, to)
          offset = start
          limit = end - start + 1
        }
      }

      const toolUse = await agent.useTool<ReadTool>(
        "read",
        { limit, offset, path } as ParamsOf<ReadTool>,
        "<auto-injected>File references from the previous user message were read automatically.</auto-injected>"
      )
      messages.push(...toolUse.messages.map((m) => Object.assign(m, { hidden: true })))
    })
  )

  agent.inject(message, ...messages)
}
