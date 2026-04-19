import sliceAnsiImpl from "slice-ansi"
import stringWidthImpl from "string-width"
import wrapAnsiImpl from "wrap-ansi"

import { extractApc } from "./style/apc.ts"

export { renderMarkdown } from "./style/md/marked.ts"
export type * from "./style/md/marked.ts"

export interface WrapOpts {
  mode?: "word" | "char"
}

export function stringWidth(s: string): number {
  return stringWidthImpl(extractApc(s).rest)
}

export function sliceAnsi(s: string, start: number, end?: number): string {
  const { apc, rest } = extractApc(s)
  return apc + sliceAnsiImpl(rest, start, end)
}

export function wrapAnsi(s: string, width: number, opts?: WrapOpts): string {
  const char = opts?.mode === "char"
  const { apc, rest } = extractApc(s)
  return apc + wrapAnsiImpl(rest, width, { hard: char, trim: false, wordWrap: !char })
}
