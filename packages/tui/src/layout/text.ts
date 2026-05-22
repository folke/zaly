import type { Layout } from "../core/state.ts"
import type { StyleBuilder } from "../style/builder.ts"

import { clamp } from "@zaly/shared"
import { splitAnsi, stringWidth, truncateAnsi, wrapAnsi } from "../style/ansi.ts"

export type WrapMode = "word" | "char" | "none"

const ELLIPSIS = "…"

export function formatText(
  text: string,
  opts: { wrap?: WrapMode; width: number; style?: StyleBuilder }
): string[] {
  const mode = opts.wrap ?? "word"
  const lines = splitAnsi(text)
  const ret: string[] = []
  if (mode === "none") ret.push(...lines)
  else {
    for (const line of lines) {
      const wrapped = splitAnsi(wrapAnsi(line, opts.width, { mode }))
      // strip single leading space from wrapped lines after the first
      for (let r = 0; r < wrapped.length; r++) {
        const row = r > 0 && wrapped[r].startsWith(" ") ? wrapped[r].slice(1) : wrapped[r]
        if (row === "" && r > 0 && r < wrapped.length - 1) continue
        ret.push(row)
      }
    }
  }
  return ret.map((line) => (opts.style ? opts.style(line) : line))
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

function maxContent(text: string): number {
  return text.split("\n").reduce((m, line) => Math.max(m, stringWidth(line)), 0)
}

function minContent(text: string, mode: WrapMode): number | undefined {
  switch (mode) {
    case "none": {
      return
    } // can't break, same as max
    case "char": {
      return 1
    } // can break anywhere → 1cell floor
    case "word": {
      // longest unbreakable run
      return text.split(/\s+/).reduce((m, word) => Math.max(m, stringWidth(word)), 0)
    }
    default: {
      mode satisfies never // future modes get caught at type-check time
      return undefined
    }
  }
}

export function calcLayout(text: string, opts: { wrap?: WrapMode } = {}): Layout {
  const width = maxContent(text)
  return {
    minWidth: minContent(text, opts.wrap ?? "word") ?? width,
    width,
  }
}

export function countLines(text: string): number {
  let count = 0
  let pos = text.indexOf("\n")
  while (pos !== -1) {
    count++
    pos = text.indexOf("\n", pos + 1)
  }
  return count
}
