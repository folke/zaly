import type { StyleBuilder } from "../style/builder.ts"

import { clamp } from "@zaly/shared"
import { splitAnsi, wrapAnsi } from "../style/ansi.ts"

export type WrapMode = "word" | "char" | "none"

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
    offset?: number
    limit?: number
    style?: StyleBuilder
  } = {}
): string[] {
  const lines = typeof text === "string" ? splitAnsi(text) : text
  const offset = clamp(opts.offset ?? 0, { max: lines.length, min: 0 })
  const limit = clamp(opts.limit ?? lines.length, { max: lines.length - offset, min: 1 })
  const slice = lines.slice(offset, offset + limit)
  if (!opts.numbered) return slice

  const numberOffset = opts.numberOffset ?? offset + 1
  const gutterWidth = String(numberOffset + slice.length - 1).length + 2

  return slice.map((line, i) => {
    const n = numberOffset + i
    const lineo = `${String(n).padStart(gutterWidth - 2)} │`
    return `${opts.style?.(lineo) ?? lineo} ${line}`
  })
}
