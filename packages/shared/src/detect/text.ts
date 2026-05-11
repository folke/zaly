import type { FileData } from "./data.ts"

export type TextFormat = "plain" | "json" | "xml" | "html" | "markdown" | "csv"

/** Best-effort text format from MIME → extension → content peek.
 *  Returns "plain" when nothing matches. Order is deliberate: more
 *  reliable signals (server MIME, explicit extension) win over content
 *  sniffing, which is fragile for short or unusual files.
 *
 *  Distinct from the type-detect engine: text classification is two
 *  steps (binary check → format), and the format step is heuristic
 *  rather than magic-byte-anchored, so it stays out of the generic
 *  `FileTypeDetect` shape. */
export function detectTextFormat(file: FileData): TextFormat {
  if (file.mime) {
    const m = file.mime.toLowerCase()
    if (m.includes("json")) return "json"
    if (m.includes("html")) return "html"
    if (m.includes("xml")) return "xml"
    if (m.includes("markdown")) return "markdown"
    if (m.includes("csv")) return "csv"
  }
  if (file.path) {
    const dot = file.path.lastIndexOf(".")
    if (dot !== -1) {
      const ext = file.path.slice(dot + 1).toLowerCase()
      const byExt: Partial<Record<string, TextFormat>> = {
        csv: "csv",
        htm: "html",
        html: "html",
        json: "json",
        markdown: "markdown",
        md: "markdown",
        svg: "xml",
        xml: "xml",
      }
      if (byExt[ext]) return byExt[ext]
    }
  }
  const head = Buffer.from(file.data.subarray(0, 256)).toString("utf8").trimStart()
  if (head.startsWith("<?xml")) return "xml"
  if (head.startsWith("<!DOCTYPE html") || head.startsWith("<html")) return "html"
  if (head.startsWith("{") || head.startsWith("[")) return "json"
  return "plain"
}
