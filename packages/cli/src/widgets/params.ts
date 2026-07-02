import type { Tool } from "@zaly/ai"
import type { InspectOpts } from "@zaly/tui"

import { safeParseToolParams } from "@zaly/ai"
import { truncateAnsi } from "@zaly/shared/ansi"
import { inspect } from "@zaly/tui"
import { text } from "@zaly/tui/widgets/text"

const COMMON_PARAMS = ["path", "command", "url", "pattern", "glob"]

/** Render a tool call preview: `toolName(param)` */
export function toolPreview(tool: string, params: string | Record<string, unknown> = "") {
  return text((ctx) => {
    const { style, width } = ctx
    const p = toolParams(params, { width: Math.min(80, width - tool.length - 2) })
    return `${style.primary.bold(tool)}(${p})`
  })
}

/** Convert tool params to a string for preview:
 * - If `params` is a string, try to parse it as JSON first.
 * - If `params` is an object, extract the first common param if available.
 * - Otherwise, inspect the value with optional quoting and truncation.
 */
export function toolParams(
  params: unknown = "",
  opts: InspectOpts & { quote?: boolean; width?: number } = {}
) {
  // Try to parse params as JSON if it's a string
  if (typeof params === "string")
    params = safeParseToolParams<Tool<Record<string, unknown>>>(params) ?? params

  let value = params

  // Check if params is an object and extract the first common param if available
  if (typeof params === "object" && params !== null && !Array.isArray(params)) {
    const rec = params as Record<string, unknown>
    const key = COMMON_PARAMS.find((k) => rec[k] !== undefined)
    value = key ? rec[key] : params
  }

  const ret =
    typeof value === "string" && opts.quote === false
      ? value
      : inspect(value, { indent: 0, ...opts })
  return opts.width ? truncateAnsi(ret, opts.width) : ret
}
