import type { MetaPart, TextPart, ToolContext } from "@zaly/ai"

import { AiError, defineTool } from "@zaly/ai"
import { cleanTextTui, normPath } from "@zaly/shared"
import { Spawn, TextStream } from "@zaly/shared/process"
import { Type } from "typebox"
import { bin, compactPath, defaultExcludes, fileTypeGlobs } from "../utils/search.ts"
import { truncate } from "../utils/truncate.ts"

const MAX_BUFFER = 512 * 1024
const DEFAULT_LIMIT = 100
const MAX_LIMIT = 1000
const MAX_COLUMNS = 200

export type GrepTool = typeof grepTool
export type GrepToolMeta = {
  cwd: string
  pattern: string
  matches: number
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
    fixed_strings: Type.Boolean({
      default: false,
      description: "Treat all patterns as literals instead of as regular expressions",
    }),
    case_sensitive: Type.Boolean({
      default: false,
      description:
        "Case sensitive search. Default false is smart case (case-insensitive if pattern is lowercase).",
    }),
    hidden: Type.Boolean({ default: false, description: "Search hidden files/directories." }),
    ignore: Type.Boolean({ default: true, description: "Respect .gitignore/.ignore rules." }),
    follow: Type.Boolean({ default: false, description: "Follow symlinks." }),
    context: Type.Integer({
      default: 0,
      description: "Context lines before/after each match. 0-5.",
      maximum: 5,
      minimum: 0,
    }),
    limit: Type.Integer({
      default: DEFAULT_LIMIT,
      description: "Maximum matched lines to keep inline.",
      maximum: MAX_LIMIT,
      minimum: 1,
    }),
  }),

  async call(args, ctx: ToolContext<GrepToolMeta>): Promise<(MetaPart | TextPart)[]> {
    const command = resolveGrep()
    if (!command) throw new AiError({ code: "MISSING_TOOL", message: "grep requires rg or grep" })

    const cwd = normPath(ctx.cwd, args.cwd ?? ".")
    await ctx.need?.("read", cwd)

    let paths = (args.paths?.length ? args.paths : ["."]).map((p) => normPath(cwd, p))
    await Promise.all(paths.map((path) => Promise.resolve(ctx.need?.("read", path))))
    paths = args.paths?.length ? args.paths : []

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

    const parsed =
      command.kind === "rg"
        ? parseRgOutput(result.stdout, cwd)
        : parseGrepOutput(result.stdout, cwd)
    const limited = parsed.lines.slice(0, args.limit)
    let text = limited.join("\n")
    const dropped = parsed.lines.length - limited.length
    if (dropped > 0) text += `${text ? "\n" : ""}… [truncated ${dropped} matches]`

    const summary = truncate(text, {
      maxLineChars: command.kind === "rg" ? 500 : MAX_COLUMNS,
      maxLines: args.limit + 1,
      strategy: "head",
    })

    const truncated = dropped > 0 || summary.truncated || result.killReason === "maxBuffer"
    ctx.meta = {
      cmd: [command.cmd, ...cmdArgs],
      cwd,
      matches: parsed.matches,
      pattern: args.pattern,
      truncated,
    }

    const meta: Record<string, unknown> = {
      command: command.cmd,
      cwd,
      matches: parsed.matches,
      truncated,
    }
    if (result.killReason) meta.killReason = result.killReason
    if (result.stderr.trim() !== "") meta.stderr = result.stderr.trim().slice(0, 500)

    const parts: (MetaPart | TextPart)[] = [{ data: meta, tag: "grep", type: "meta" }]
    parts.push({ text: summary.text || "No matches found.", type: "text" })
    return parts
  },
})

type GrepArgs = Parameters<GrepTool["call"]>[0]
type GrepBackend = { cmd: string; kind: "rg" | "grep" }

function resolveGrep(): GrepBackend | undefined {
  const rg = bin("rg")
  if (rg) return { cmd: rg, kind: "rg" }
  const grep = bin("grep")
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
    "-0",
  ]

  if (args.fixed_strings) ret.push("--fixed-strings")
  if (args.case_sensitive) ret.push("--case-sensitive")
  else ret.push("--smart-case")
  if (args.hidden) ret.push("--hidden")
  else ret.push("--no-hidden")
  if (!args.ignore) ret.push("--no-ignore")
  if (args.follow) ret.push("--follow")
  if (args.context > 0) ret.push(`--context=${args.context}`)

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
  if (args.context > 0) ret.push("--context", String(args.context))
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

function parseRgOutput(output: string, cwd: string): { lines: string[]; matches: number } {
  if (output === "") return { lines: [], matches: 0 }
  const lines: string[] = []
  for (const raw of output.split("\n")) {
    // if (raw === "") continue
    const nul = raw.indexOf("\0")
    if (nul === -1) {
      lines.push(raw)
      continue
    }
    const file = raw.slice(0, nul)
    const rest = cleanTextTui(raw.slice(nul + 1))
    lines.push(`${compactPath(file, cwd)}:${rest}`)
  }
  return { lines, matches: lines.length }
}

function parseGrepOutput(output: string, cwd: string): { lines: string[]; matches: number } {
  if (output === "") return { lines: [], matches: 0 }
  const lines = output
    .split("\n")
    .filter((l) => l !== "")
    .map((line) => {
      const match = /^(.*?):(\d+):(.*)$/.exec(line)
      if (!match) return cleanTextTui(line)
      const [, file, row, text] = match
      return `${compactPath(file, cwd)}:${row}:${cleanTextTui(text)}`
    })
  return { lines, matches: lines.length }
}
