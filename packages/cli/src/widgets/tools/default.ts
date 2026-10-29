import type { FileTool } from "@zaly/agent"
import type { Tool } from "@zaly/ai"
import type { ShikiLanguage } from "@zaly/tui"
import type { WrapMode } from "@zaly/tui/text"
import type { ToolView } from "../tool.ts"

import { stringifyContent } from "@zaly/ai"
import { prettyPath } from "@zaly/shared"
import { memo } from "@zaly/tui"
import { code } from "@zaly/tui/widgets/code"
import { toolPreview } from "../params.ts"

const PREVIEW_LINE_LIMIT = 10

/// Show the pretty printed file path in the call preview.
export function fileCall(props: Readonly<ToolView<FileTool>>) {
  const path = memo(() => {
    const p = props.result?.meta?.path
    return { path: p ? prettyPath(p) : (props.params.path ?? "") }
  })
  return toolPreview(props.name, path)
}

export function genericRenderer(
  opts: { limit?: number; lang?: ShikiLanguage; wrap?: WrapMode } = {}
) {
  return {
    call<T extends Tool>(this: void, ctx: Readonly<ToolView<T>>) {
      return toolPreview(
        ctx.name,
        memo(() => ctx.params)
      )
    },
    result<T extends Tool>(this: void, ctx: Readonly<ToolView<T>>) {
      const content = memo(() => {
        const r = ctx.result
        if (r === undefined) return ""
        return stringifyContent(r.content)
      })
      return code({
        code: content,
        lang: opts.lang,
        limit: opts.limit ?? PREVIEW_LINE_LIMIT,
        more: (_more, msg) => `${msg} lines`,
        numbered: false,
        style: opts.lang ? undefined : { dim: true, style: "code" },
        wrap: opts.wrap ?? "word",
      })
    },
  }
}

/** Generic fallback renderer — dim text preview of the result content,
 *  truncated to 500 chars. Used for any tool that doesn't have a
 *  specialised renderer registered. Mirrors the behaviour the inline
 *  result preview had before tool-renderer dispatch. */
export const defaultRenderer = genericRenderer()
