import type { ReadTool } from "@zaly/agent"
import type { Message, ParamsOf } from "@zaly/ai"
import type { Node } from "@zaly/tui"
import type {
  ComposerFormatCtx,
  ComposerPlugin,
  ComposerRenderCtx,
  ComposerSubmitCtx,
} from "../composer.ts"

import { normPath, safeStatAsync } from "@zaly/shared"

export type FileRef = {
  ref: string
  path: string
  from?: number
  to?: number
}

const fileRefRe = () => /@([^\s,;]+)/g

export class FilesComposer implements ComposerPlugin {
  name = "files"
  when = fileRefRe()

  async format(value: string, ctx: ComposerFormatCtx) {
    const fileMatch = value.match(fileRefRe())
    if (!fileMatch) return

    const s = ctx.style
    if (ctx.message?.meta?.fileRefs) {
      const refs = ctx.message.meta.fileRefs as FileRef[]
      for (const ref of refs) {
        const link = s.mdLink(ref.ref)
        value = value.replace(ref.ref, link)
      }
    } else {
      value = value.replace(fileRefRe(), (file) => s.mdLink(file))
    }
    return value
  }

  async submit(value: string, ctx: ComposerSubmitCtx): Promise<void> {
    const refs = new Map<string, FileRef>()

    const RANGE_RE = /^(.*?)(?::(\d+)(?:-(\d+))?)?$/
    const CONTEXT = 3

    for (const [, ref] of value.matchAll(fileRefRe())) {
      const match = ref.match(RANGE_RE)
      if (!match) continue

      const [, file, fromRaw, toRaw] = match
      const from = fromRaw ? Number(fromRaw) : undefined
      const to = toRaw ? Number(toRaw) : undefined
      const path = normPath(file)
      // oxlint-disable-next-line no-await-in-loop
      const s = await safeStatAsync(path)
      if (!s?.isFile()) continue
      refs.set(path, { from, path, ref: `@${ref}`, to })
    }

    if (refs.size > 0 && ctx.message) {
      ctx.message.meta ??= {}
      ctx.message.meta.fileRefs = [...refs.values()]
    }

    const messages: Message[] = []

    await Promise.all(
      [...refs.values()].map(async (ref) => {
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

        const toolUse = await ctx.agent.useTool<ReadTool>(
          "read",
          { limit, offset, path } as ParamsOf<ReadTool>,
          "File references from the previous user message were read automatically",
          { hidden: true }
        )
        messages.push(...toolUse.messages)
      })
    )
    ctx.agent.send(messages, { run: false })
  }

  async render(ctx: ComposerRenderCtx): Promise<Node[]> {
    const m = ctx.message
    const refs = (m.meta?.fileRefs ?? []) as FileRef[]
    if (refs.length === 0) return []

    const { text } = await import("@zaly/tui/widgets/text")
    const { hyperlink } = await import("@zaly/tui/ansi")
    const children: Node[] = []

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
    return children
  }
}
