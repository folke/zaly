import type { ToolResultProps } from "./registry.ts"

import { stringifyContent } from "@zaly/ai"
import { unwrap } from "@zaly/tui"
import { text } from "@zaly/tui/widgets/text"
import { widget } from "@zaly/tui/widgets/widget"

/** Generic fallback renderer — dim text preview of the result content,
 *  truncated to 500 chars. Used for any tool that doesn't have a
 *  specialised renderer registered. Mirrors the behaviour the inline
 *  result preview had before tool-renderer dispatch. */
export const defaultResult = widget((props: ToolResultProps) =>
  text(({ style }) => {
    const r = unwrap(props.result)
    if (r === undefined) return ""
    const content = stringifyContent(r.content)
    const trimmed = content.length > 500 ? `${content.slice(0, 497)}...` : content
    return style.dim(trimmed.replaceAll(/^/gm, "  "))
  })
)
