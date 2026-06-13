import type { MetaPart, TextPart, ToolContext } from "@zaly/ai"

import { AiError, defineTool } from "@zaly/ai"
import { normPath } from "@zaly/shared"
import { defaultExcludes } from "@zaly/shared/find"
import { Spawn, TextStream, which } from "@zaly/shared/process"
import { cleanTextTui } from "@zaly/shared/text"
import { Type } from "typebox"
import { truncate } from "../utils/truncate.ts"

const MAX_BUFFER = 512 * 1024
const DEFAULT_LIMIT = 100
const MAX_LIMIT = 1000
const MAX_COLUMNS = 200

export type GrepTool = typeof grepTool
export type GrepToolMeta = {
  cwd: string
  pattern: string
  truncated: boolean
  cmd: string[]
}

// oxlint-disable-next-line sort-keys -- semantic field order: name, desc, params, call
export const grepTool = defineTool({
  name: "grep",
  desc:
    `Search file contents using rg/grep. Respects .gitignore by default when ripgrep is available; ` +
    "prefer this over bash grep/find for code search. Returns human-readable grouped matches with line numbers.",
  parallel: true,
  // oxlint-disable-next-line sort-keys -- semantic param order
  params: Type.Object({
    pattern: Type.String({ description: "Text or regex pattern to search for.", minLength: 1 }),
    cwd: Type.Optional(Type.String({ description: "Directory to search from. Defaults to cwd." })),
    paths: Type.Optional(
      Type.Array(Type.String(), {
        description: "Optional files/directories to search, relative to cwd or absolute.",
      })
    ),
    glob: Type.Optional(
      Type.Array(Type.String(), {
        description: "Ripgrep glob filters, e.g. [`*.ts`, `!dist/**`].",
      })
    ),
    exclude: Type.Optional(
      Type.Array(Type.String(), {
        description: "Patterns to exclude, e.g. [`node_modules`, `dist/**`].",
      })
    ),
    file_type: Type.Optional(
      Type.Array(Type.String(), {
        description: "Ripgrep file types (`-t`), e.g. [`ts`, `rust`, `markdown`].",
      })
    ),
    fixed_strings: Type.Optional(
      Type.Boolean({
        default: false,
        description: "Treat all patterns as literals instead of as regular expressions",
      })
    ),
    case_sensitive: Type.Optional(
      Type.Boolean({
        default: false,
        description:
          "Case sensitive search. Default false is smart case (case-insensitive if pattern is lowercase).",
      })
    ),
    hidden: Type.Optional(
      Type.Boolean({ default: false, description: "Search hidden files/directories." })
    ),
    ignore: Type.Optional(
      Type.Boolean({ default: true, description: "Respect .gitignore/.ignore rules." })
    ),
    follow: Type.Optional(Type.Boolean({ default: false, description: "Follow symlinks." })),
    context: Type.Optional(
      Type.Integer({
        default: 0,
        description: "Context lines before/after each match. 0-5.",
        maximum: 5,
        minimum: 0,
      })
    ),
    limit: Type.Optional(
      Type.Integer({
        default: DEFAULT_LIMIT,
        description: "Maximum matched lines to keep inline.",
        maximum: MAX_LIMIT,
        minimum: 1,
      })
    ),
  }),

  async preflight(args, ctx: ToolContext<GrepToolMeta>) {
    const cwd = normPath(ctx.cwd, args.cwd ?? ".")
    await ctx.need?.("read", cwd)

    const paths = (args.paths?.length ? args.paths : ["."]).map((p) => normPath(cwd, p))
    await Promise.all(paths.map((path) => Promise.resolve(ctx.need?.("read", path))))
  },

  async call(args, ctx: ToolContext<GrepToolMeta>): Promise<(MetaPart | TextPart)[]> {
    const command = resolveGrep()
    if (!command) throw new AiError({ code: "MISSING_TOOL", message: "grep requires rg or grep" })

    const cwd = normPath(ctx.cwd, args.cwd ?? ".")
    const paths = args.paths?.length ? args.paths : []

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
      throw new AiError({ cause: error, code: "GREP_FAILED", message: String(error) })
    })

    // rg/grep: 0 matches found, 1 no matches, >1 error.
    if (result.code > 1 && result.killReason !== "maxBuffer") {
      throw new AiError({
        code: "GREP_FAILED",
        data: { code: result.code, stderr: result.stderr },
        message: `${command.cmd} failed (${result.code}): ${result.stderr.slice(0, 500)}`,
      })
    }

    const text = cleanTextTui(result.stdout)
    const limit = args.limit ?? DEFAULT_LIMIT
    const summary = truncate(text, {
      maxLineChars: command.kind === "rg" ? 500 : MAX_COLUMNS,
      maxLines: limit + 1,
      strategy: "head",
    })

    const truncated = summary.truncated || result.killReason === "maxBuffer"
    ctx.meta = {
      cmd: [command.cmd, ...cmdArgs],
      cwd,
      pattern: args.pattern,
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
    parts.push({ text: summary.text || "No matches found.", type: "text" })
    return parts
  },
})

type GrepArgs = Parameters<GrepTool["call"]>[0]
type GrepBackend = { cmd: string; kind: "rg" | "grep" }

const FILE_TYPE_EXTENSIONS: Record<string, string[]> = {
  c: ["c", "h"],
  cpp: ["cpp", "cc", "cxx", "hpp", "hh", "hxx"],
  go: ["go"],
  java: ["java"],
  js: ["js", "jsx", "mjs", "cjs"],
  json: ["json"],
  lua: ["lua"],
  markdown: ["md", "markdown"],
  md: ["md", "markdown"],
  py: ["py"],
  python: ["py"],
  rs: ["rs"],
  rust: ["rs"],
  toml: ["toml"],
  ts: ["ts", "tsx", "mts", "cts"],
  yaml: ["yml", "yaml"],
}

function fileTypeExtensions(type: string): string[] {
  return FILE_TYPE_EXTENSIONS[type] ?? [type]
}

function fileTypeGlobs(type: string): string[] {
  return fileTypeExtensions(type).map((e) => `*.${e}`)
}

function resolveGrep(): GrepBackend | undefined {
  const rg = which("rg")
  if (rg) return { cmd: rg, kind: "rg" }
  const grep = which("grep")
  return grep ? { cmd: grep, kind: "grep" } : undefined
}

function buildArgs(kind: GrepBackend["kind"], args: GrepArgs, paths: string[]): string[] {
  return kind === "rg" ? buildRgArgs(args, paths) : buildGrepArgs(args, paths)
}

function buildRgArgs(args: GrepArgs, paths: string[]): string[] {
  const ret = [
    "--color=always",
    "--heading",
    "--with-filename",
    "--line-number",
    `--max-columns=${MAX_COLUMNS}`,
    "--max-columns-preview",
    "--path-separator=/",
  ]

  if (args.fixed_strings) ret.push("--fixed-strings")
  if (args.case_sensitive) ret.push("--case-sensitive")
  else ret.push("--smart-case")
  if (args.hidden) ret.push("--hidden")
  else ret.push("--no-hidden")
  if (!args.ignore) ret.push("--no-ignore")
  if (args.follow) ret.push("--follow")
  const context = args.context ?? 0
  if (context > 0) ret.push(`--context=${context}`)

  for (const e of [...defaultExcludes(paths), ...(args.exclude ?? [])]) ret.push("--glob", `!${e}`)
  for (const g of args.glob ?? []) ret.push("--glob", g)
  for (const t of args.file_type ?? []) ret.push("--type", t)

  ret.push("--", args.pattern, ...paths)
  return ret
}

function buildGrepArgs(args: GrepArgs, paths: string[]): string[] {
  const ret = [
    "--recursive",
    "--line-number",
    "--with-filename",
    "--binary-files=without-match",
    "--color=always",
  ]
  if (args.fixed_strings) ret.push("--fixed-strings")
  else ret.push("--extended-regexp")
  const hasUpper = /[A-Z]/.test(args.pattern)
  if (!args.case_sensitive && !hasUpper) ret.push("--ignore-case")
  const context = args.context ?? 0
  if (context > 0) ret.push("--context", String(context))
  for (const e of [...defaultExcludes(paths), ...(args.exclude ?? [])]) ret.push("--exclude-dir", e)
  for (const t of args.file_type ?? []) {
    for (const g of fileTypeGlobs(t)) ret.push("--include", g)
  }
  for (const g of args.glob ?? []) ret.push(...grepGlobArgs(g))
  ret.push("--", args.pattern, ...paths)
  return ret
}

function grepGlobArgs(glob: string): string[] {
  if (!glob.startsWith("!")) return ["--include", glob]
  const exclude = glob.slice(1)
  if (exclude.endsWith("/**") && !exclude.slice(0, -3).includes("*")) {
    return ["--exclude-dir", exclude.slice(0, -3)]
  }
  return ["--exclude", exclude]
}
