import { splitAnsi, wrapAnsi } from "../style/ansi.ts"

export type WrapMode = "word" | "char" | "none"

export function formatText(text: string, opts: { wrap?: WrapMode; width: number }): string[] {
  const mode = opts.wrap ?? "word"
  text = mode === "none" ? text : wrapAnsi(text, opts.width, { mode })
  return splitAnsi(text)
}
