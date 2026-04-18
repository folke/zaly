import type { MdCallbacks, MdOptions } from "./md.ts"

export type * from "./md.ts"

export interface WrapOpts {
  mode?: "word" | "char"
}

export function stringWidth(s: string): number {
  return Bun.stringWidth(s)
}

export function sliceAnsi(s: string, start: number, end?: number): string {
  return Bun.sliceAnsi(s, start, end)
}

export function wrapAnsi(s: string, width: number, opts?: WrapOpts): string[] {
  const char = opts?.mode === "char"
  return Bun.wrapAnsi(s, width, { hard: char, wordWrap: !char }).split("\n")
}

export function renderMarkdown(input: string, callbacks: MdCallbacks, opts?: MdOptions): string {
  return Bun.markdown.render(input, callbacks, opts)
}
