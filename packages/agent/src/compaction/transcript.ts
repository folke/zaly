import type { AnyPart, Message } from "@zaly/ai"

import {
  attachmentToMeta,
  ContentTransform,
  errorToMeta,
  metaToText,
  sanitizeText,
  stringifyContent,
} from "@zaly/ai"
import { safeStringify } from "@zaly/shared"

/** Create a shared per-message text extractor. Tool results are uncapped unless requested. */
export function messageExtractor(opts: { maxToolResultLen?: number; excludeTool?: string } = {}) {
  const transform = ContentTransform.create<AnyPart>()
    .drop("reasoning")
    .map("tool-call", (part) =>
      part.name === opts.excludeTool
        ? undefined
        : {
            content: [
              {
                text: `${part.name}(${safeStringify(part.params)})`,
                type: "text" as const,
              },
            ],
            tag: "tool-call",
            type: "meta",
          }
    )
    .map("tool-result", (part) => {
      if (part.name === opts.excludeTool) return undefined
      const full = stringifyContent(part.content)
      const limit = opts.maxToolResultLen
      const text = limit !== undefined && full.length > limit ? `${full.slice(0, limit)}…` : full
      return {
        content: text === "" ? undefined : [{ text, type: "text" as const }],
        data: { tool: part.name, ...(part.isError ? { error: true } : {}) },
        tag: "tool-result",
        type: "meta" as const,
      }
    })
    .pipe(attachmentToMeta("image", "pdf", "audio", "video"))
    .pipe(errorToMeta())
    .pipe(metaToText())
    .pipe(sanitizeText())

  return (m: Message) => ({
    id: m.id,
    message: stringifyContent(
      transform.runSync(
        typeof m.content === "string" ? [{ text: m.content, type: "text" }] : m.content
      )
    ).trim(),
    role: m.role,
  })
}
