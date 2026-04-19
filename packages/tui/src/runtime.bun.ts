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
  const { apc, rest } = extractApc(s)
  return apc + Bun.wrapAnsi(rest, width, { hard: char, trim: false, wordWrap: !char })
}

export function renderMarkdown(input: string, callbacks: MdCallbacks, opts?: MdOptions): string {
  return Bun.markdown.render(input, callbacks, opts)
}
