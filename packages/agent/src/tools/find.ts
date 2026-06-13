import type { MetaPart, TextPart, ToolContext } from "@zaly/ai"

import { AiError, defineTool } from "@zaly/ai"
import { normPath } from "@zaly/shared"
import { find } from "@zaly/shared/find"
import { Type } from "typebox"
import { truncate } from "../utils/truncate.ts"

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 1000

export type FindTool = typeof findTool
export type FindToolMeta = {
  cwd: string
  glob: string | string[]
  matches: number
  truncated: boolean
}

// oxlint-disable-next-line sort-keys -- semantic field order: name, desc, params, call
export const findTool = defineTool({
  name: "find",
  desc:
    "Find files using fd/fdfind or rg --files. `glob` is a filename/path glob, " +
    "array of globs, or plain substring; empty, `*`, or `**/*` lists all files. " +
    "Respects .gitignore by default; prefer this over bash find for file discovery.",
  parallel: true,
  // oxlint-disable-next-line sort-keys -- semantic param order
  params: Type.Object({
    glob: Type.Optional(
      Type.Union([Type.String(), Type.Array(Type.String())], {
        default: "",
        description:
          "Filename/path glob, array of globs, or plain substring. Empty, `*`, or `**/*` lists all files.",
      })
    ),
    cwd: Type.Optional(Type.String({ description: "Directory to search from. Defaults to cwd." })),
    paths: Type.Optional(
      Type.Array(Type.String(), {
        description: "Optional directories to search, relative to cwd or absolute.",
      })
    ),
    type: Type.Optional(
      Type.Union([Type.Literal("file"), Type.Literal("dir"), Type.Literal("any")], {
        default: "file",
        description: "Entry type to return. `dir` requires fd/fdfind or find fallback.",
      })
    ),
    exclude: Type.Optional(
      Type.Array(Type.String(), {
        description: "Patterns to exclude, e.g. [`node_modules`, `dist/**`].",
      })
    ),
    hidden: Type.Optional(
      Type.Boolean({ default: false, description: "Include hidden files/directories." })
    ),
    ignore: Type.Optional(
      Type.Boolean({ default: true, description: "Respect .gitignore/.ignore rules." })
    ),
    follow: Type.Optional(Type.Boolean({ default: false, description: "Follow symlinks." })),
    limit: Type.Optional(
      Type.Integer({
        default: DEFAULT_LIMIT,
        description: "Maximum paths to keep inline.",
        maximum: MAX_LIMIT,
        minimum: 1,
      })
    ),
  }),

  async preflight(args, ctx: ToolContext<FindToolMeta>) {
    const cwd = normPath(ctx.cwd, args.cwd ?? ".")
    await ctx.need?.("read", cwd)
    const paths = (args.paths?.length ? args.paths : ["."]).map((p) => normPath(cwd, p))
    await Promise.all(paths.map((path) => Promise.resolve(ctx.need?.("read", path))))
  },

  async call(args, ctx: ToolContext<FindToolMeta>): Promise<(MetaPart | TextPart)[]> {
    const cwd = normPath(ctx.cwd, args.cwd ?? ".")

    let result: string[] = []
    try {
      const batch = await Array.fromAsync(
        find({ ...args, cwd, pattern: args.glob, signal: ctx.signal })
      )
      result = batch.flat()
    } catch (error) {
      throw AiError.from(error)
    }

    const limit = args.limit ?? DEFAULT_LIMIT
    const summary = truncate(result.join("\n"), {
      maxLines: limit + 1,
      strategy: "head",
    })

    const truncated = summary.truncated
    ctx.meta = {
      cwd,
      glob: args.glob ?? "",
      matches: summary.origLines,
      truncated,
    }

    return [{ text: summary.text || "No files found.", type: "text" }]
  },
})
