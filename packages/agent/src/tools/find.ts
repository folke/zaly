import type { MetaPart, TextPart, ToolContext } from "@zaly/ai"

import { AiError, defineTool } from "@zaly/ai"
import { normPath } from "@zaly/shared"
import { Spawn, TextStream } from "@zaly/shared/process"
import { cleanTextTui } from "@zaly/shared/text"
import { platform } from "node:process"
import { Type } from "typebox"
import {
  bin,
  compactPath,
  defaultExcludes,
  fileTypeExtensions,
  fileTypeGlobs,
} from "../utils/search.ts"
import { truncate } from "../utils/truncate.ts"

const MAX_BUFFER = 512 * 1024
const DEFAULT_LIMIT = 200
const MAX_LIMIT = 1000

export type FindTool = typeof findTool
export type FindToolMeta = {
  cwd: string
  pattern: string
  matches: number
  truncated: boolean
  cmd: string[]
}

// oxlint-disable-next-line sort-keys -- semantic field order: name, desc, params, call
export const findTool = defineTool({
  name: "find",
  desc:
    "Find files using fd/fdfind or rg --files. Respects .gitignore by default; " +
    "prefer this over bash find for file discovery.",
  parallel: true,
  // oxlint-disable-next-line sort-keys -- semantic param order
  params: Type.Object({
    pattern: Type.Optional(
      Type.String({ default: "", description: "Filename/path pattern to search for." })
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
    file_type: Type.Optional(
      Type.Array(Type.String(), {
        description:
          "File types/extensions to include. Known rg-style types like `ts`, `rust`, `markdown` expand to common extensions; unknown values are treated as extensions.",
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
    const paths = args.paths?.length ? args.paths : []

    const command = resolveFinder(args.type)
    if (!command) {
      throw new AiError({
        code: "MISSING_TOOL",
        message: "find requires fd/fdfind, rg, or find to be available",
      })
    }

    const cmdArgs = buildArgs(command.kind, args, paths)
    const proc = new Spawn(command.cmd, cmdArgs, {
      cwd,
      maxBuffer: MAX_BUFFER,
      signal: ctx.signal,
      stderr: new TextStream(),
      stdout: new TextStream(),
      timeout: 60_000,
    })
    const result = await proc.result.catch((error: unknown) => {
      throw new AiError({ cause: error, code: "FIND_FAILED", message: String(error) })
    })

    if (result.code !== 0 && result.killReason !== "maxBuffer") {
      throw new AiError({
        code: "FIND_FAILED",
        data: { code: result.code, stderr: result.stderr },
        message: `${command.cmd} failed (${result.code}): ${result.stderr.slice(0, 500)}`,
      })
    }

    const text = cleanTextTui(result.stdout)
      .split("\n")
      .filter((l) => l !== "")
      .map((p) => compactPath(p, cwd))

    const limit = args.limit ?? DEFAULT_LIMIT
    const summary = truncate(text.join("\n"), {
      maxLines: limit + 1,
      strategy: "head",
    })

    const truncated = summary.truncated || result.killReason === "maxBuffer"
    ctx.meta = {
      cmd: [command.cmd, ...cmdArgs],
      cwd,
      matches: summary.origLines,
      pattern: args.pattern ?? "",
      truncated,
    }

    const parts: (MetaPart | TextPart)[] = []

    const stderr = result.stderr.trim()
    if (stderr || result.killReason) {
      const meta: Record<string, unknown> = {
        command: command.cmd,
        cwd,
        truncated,
      }
      if (result.killReason) meta.killReason = result.killReason
      if (stderr) meta.stderr = stderr.slice(0, 500)
      parts.push({ data: meta, tag: "grep", type: "meta" })
    }
    parts.push({ text: summary.text || "No files found.", type: "text" })
    return parts
  },
})

type FindArgs = Parameters<typeof findTool.call>[0]
type Finder = { cmd: string; kind: "fd" | "rg" | "find" }

function resolveFinder(type: FindArgs["type"]): Finder | undefined {
  const fd = bin("fd")
  if (fd) return { cmd: fd, kind: "fd" }
  if (type === "file") {
    const rg = bin("rg")
    if (rg) return { cmd: rg, kind: "rg" }
  }
  if (platform === "win32") return
  const find = bin("find")
  return find ? { cmd: find, kind: "find" } : undefined
}

function buildArgs(kind: Finder["kind"], args: FindArgs, paths: string[]): string[] {
  if (kind === "fd") return fdArgs(args, paths)
  if (kind === "rg") return rgFilesArgs(args, paths)
  return findArgs(args, paths)
}

function fdArgs(args: FindArgs, paths: string[]): string[] {
  const ret = ["--color", "always", "--max-results", String(args.limit ?? DEFAULT_LIMIT)]
  if (args.type === "file") ret.push("--type", "file", "--type", "symlink")
  else if (args.type === "dir") ret.push("--type", "directory")
  if (args.hidden) ret.push("--hidden")
  if (!args.ignore) ret.push("--no-ignore")
  if (args.follow) ret.push("--follow")
  for (const e of [...defaultExcludes(paths), ...(args.exclude ?? [])]) ret.push("--exclude", e)
  for (const t of args.file_type ?? []) {
    for (const e of fileTypeExtensions(t)) ret.push("--extension", e)
  }
  ret.push(args.pattern ?? ".", ...paths)
  return ret
}

function rgFilesArgs(args: FindArgs, paths: string[]): string[] {
  const ret = ["--files", "--no-messages", "--color", "never"]
  if (args.hidden) ret.push("--hidden")
  if (!args.ignore) ret.push("--no-ignore")
  if (args.follow) ret.push("--follow")
  for (const e of [...defaultExcludes(paths), ...(args.exclude ?? [])]) ret.push("--glob", `!${e}`)
  for (const t of args.file_type ?? []) {
    for (const g of fileTypeGlobs(t)) ret.push("--glob", g)
  }
  if (args.pattern) ret.push("--glob", args.pattern)
  ret.push(...paths)
  return ret
}

function findArgs(args: FindArgs, paths: string[]): string[] {
  const ret = [...paths]
  if (args.type === "file") ret.push("-type", "f")
  else if (args.type === "dir") ret.push("-type", "d")
  if (!args.hidden) ret.push("-not", "-path", "*/.*")
  for (const e of defaultExcludes(paths)) ret.push("-not", "-path", `*/${e}/*`)
  if (args.pattern) ret.push("-name", args.pattern)
  for (const t of args.file_type ?? []) {
    for (const g of fileTypeGlobs(t)) ret.push("-name", g)
  }
  for (const e of args.exclude ?? []) ret.push("-not", "-path", e)
  return ret
}
