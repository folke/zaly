import type { MdCallbacks, MdOptions } from "./style/md/marked.ts"

import { extractApc } from "./style/apc.ts"

export type * from "./style/md/marked.ts"

export interface WrapOpts {
  mode?: "word" | "char"
}

export function stringWidth(s: string): number {
  return Bun.stringWidth(extractApc(s).rest)
}

export function sliceAnsi(s: string, start: number, end?: number): string {
  const { apc, rest } = extractApc(s)
  return apc + Bun.sliceAnsi(rest, start, end)
}

export function wrapAnsi(s: string, width: number, opts?: WrapOpts): string {
  const char = opts?.mode === "char"
  // Wrap line-by-line so APC escapes (zero width, positional — e.g. kitty
  // image placements) stay on their source line. A single global
  // extract+prepend would collapse every APC onto row 0 of the output,
  // and downstream `splitAnsi` then re-prepends those to every row; the
  // net effect is the image placement firing on every painted row and
  // ending up wherever the last paint landed.
  return s
    .split("\n")
    .map((line) => {
      const { apc, rest } = extractApc(line)
      return apc + Bun.wrapAnsi(rest, width, { hard: char, trim: false, wordWrap: !char })
    })
    .join("\n")
}

export function renderMarkdown(input: string, callbacks: MdCallbacks, opts?: MdOptions): string {
  return Bun.markdown.render(input, callbacks, opts)
}
