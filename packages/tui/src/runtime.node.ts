import sliceAnsiImpl from "slice-ansi"
import stringWidthImpl from "string-width"
import wrapAnsiImpl from "wrap-ansi"

export { renderMarkdown } from "./md.ts"
export type * from "./md.ts"

export interface WrapOpts {
  mode?: "word" | "char"
}

export function stringWidth(s: string): number {
  return stringWidthImpl(s)
}

export function sliceAnsi(s: string, start: number, end?: number): string {
  return sliceAnsiImpl(s, start, end)
}

export function wrapAnsi(s: string, width: number, opts?: WrapOpts): string {
  const char = opts?.mode === "char"
  return wrapAnsiImpl(s, width, { hard: char, trim: false, wordWrap: !char })
}
