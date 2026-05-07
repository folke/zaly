import type { StyleBuilder } from "../style/builder.ts"

import { clamp } from "@zaly/shared"
import { splitAnsi, truncateAnsi, wrapAnsi } from "../style/ansi.ts"

export type WrapMode = "word" | "char" | "none"

const ELLIPSIS = "…"

export function formatText(text: string, opts: { wrap?: WrapMode; width: number }): string[] {
  const mode = opts.wrap ?? "word"
  text = mode === "none" ? text : wrapAnsi(text, opts.width, { mode })
  return splitAnsi(text)
}

export function formatLines(
  text: string | string[],
  opts: {
    numbered?: boolean
    numberOffset?: number
    maxLineLength?: number
    offset?: number
    limit?: number
    more?: false | ((more: number, msg: string) => string)
    style?: StyleBuilder
  } = {}
): string[] {
  const lines = typeof text === "string" ? splitAnsi(text) : text
  const offset = clamp(opts.offset ?? 0, 0, lines.length - 1)
  const limit = clamp(opts.limit ?? lines.length, 1, lines.length - offset)
  const ellipsis = opts.style?.(ELLIPSIS) ?? ELLIPSIS
  let slice = lines
    .slice(offset, offset + limit)
    .map((line) => (opts.maxLineLength ? truncateAnsi(line, opts.maxLineLength, ellipsis) : line))

  const numberOffset = opts.numberOffset ?? offset + 1
  const gutterWidth = String(numberOffset + slice.length - 1).length + 2

  if (opts.numbered) {
    slice = slice.map((line, i) => {
      const n = numberOffset + i
      const lineo = `${String(n).padStart(gutterWidth - 2)} │`
      return `${opts.style?.(lineo) ?? lineo} ${line}`
    })
  }

  if (slice.length < lines.length && opts.more !== false) {
    const moreN = lines.length - slice.length
    let more = `+${moreN} more line${moreN > 1 ? "s" : ""}`
    more = opts.more?.(moreN, more) ?? more
    if (opts.numbered) {
      const moreGutter = `${"…".padStart(gutterWidth - 2)} │`
      slice.push(`${opts.style?.(moreGutter) ?? moreGutter} ${opts.style?.(more) ?? more}`)
    } else slice.push(opts.style?.(more) ?? more)
  }

  return slice
}
