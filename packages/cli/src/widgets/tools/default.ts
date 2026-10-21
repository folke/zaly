import type { FileTool } from "@zaly/agent"
import type { ShikiLanguage } from "@zaly/tui"
import type { WrapMode } from "@zaly/tui/text"
import type { ToolRenderer, ToolResultCtx } from "./registry.ts"

import { stringifyContent } from "@zaly/ai"
import { prettyPath } from "@zaly/shared"
import { memo, unwrap } from "@zaly/tui"
import { code } from "@zaly/tui/widgets/code"
import { toolPreview } from "../params.ts"

const PREVIEW_LINE_LIMIT = 10

/// Show the pretty printed file path in the call preview.
export function fileCall(props: ToolResultCtx<FileTool>) {
  const path = memo(() => {
    const p = unwrap(props.result)?.meta?.path
    return { path: p ? prettyPath(p) : (props.params?.path ?? "unknown path") }
  })
  return toolPreview(props.call.name, path)
}

export function genericRenderer(
  opts: { limit?: number; lang?: ShikiLanguage; wrap?: WrapMode } = {}
): Required<ToolRenderer> {
  return {
    call(ctx: ToolResultCtx) {
      return toolPreview(ctx.call.name, ctx.params)
    },
    result(ctx: ToolResultCtx) {
      const content = memo(() => {
        const r = unwrap(ctx.result)
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
export const defaultRenderer: Required<ToolRenderer> = genericRenderer()
