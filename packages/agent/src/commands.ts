import type { ArgsOpts, ArgsResult } from "@zaly/shared/args"
import type { Logger } from "@zaly/shared/logger"

import { normPath, safeReadFile } from "@zaly/shared"
import { basename } from "pathe"

export type Command = {
  name: string
  body: string
  path: string
  description?: string
  model?: string
  args?: ArgsOpts
}

export interface CommandsOptions {
  /** SKILL.md paths, sorted from highest to lowest precedence. */
  paths?: string[]
  logger?: Logger
}

function resolveCommandVar(
  key: string,
  positionals: string[],
  repl: Record<string, string | undefined>
): string | undefined {
  const slice = /^@:(\d+)(?::(\d+))?$/.exec(key)
  if (slice) {
    const start = Math.max(Number(slice[1]) - 1, 0)
    const length = slice.at(2)
    const end = length === undefined ? undefined : start + Math.max(Number(length), 0)
    return positionals.slice(start, end).join(" ")
  }
  return repl[key]
}

export class Commands {
  #opts: CommandsOptions
  readonly catalog = new Map<string, Command>()
  #logger?: Logger

  constructor(opts: CommandsOptions = {}) {
    this.#opts = opts
    this.#logger = opts.logger
  }

  async load(): Promise<this> {
    const paths = this.#opts.paths ?? []
    await Promise.all(paths.map(async (path) => await this.add(path)))
    return this
  }

  async add(path: string): Promise<void> {
    path = normPath(path)
    const name = basename(path, ".md")
    const { parseFrontmatter } = await import("@zaly/shared/yaml")
    try {
      const content = await safeReadFile(path)
      if (!content) throw new Error(`Failed to read command file at ${path}`)

      const { fm, body } = await parseFrontmatter(content)

      const cmd: Command = {
        ...fm,
        body,
        name,
        path,
      }
      if (this.catalog.has(name)) return
      this.catalog.set(name, cmd)
    } catch (error) {
      this.#logger?.error(`Error loading **command** from ${path}: ${(error as Error).message}`)
    }
  }

  get(name: string): Command | undefined {
    return this.catalog.get(name)
  }

  async format(input: string | ArgsResult, cmd: Command): Promise<string> {
    let args: ArgsResult
    if (typeof input === "string") {
      const { argsParse } = await import("../../shared/src/args.ts")
      args = await argsParse(input, cmd.args ?? {})
    } else args = input

    const positionals = args._.join(" ")
    const repl: Record<string, string | undefined> = {
      "*": positionals,
      "@": positionals,
      ARGUMENTS: positionals,
      raw: args.$,
    }
    for (let i = 0; i < args._.length; i++) {
      repl[`${i + 1}`] = args._[i]
    }
    for (const [k, v] of Object.entries(args)) {
      if (k === "_" || k === "$" || v === undefined) continue
      repl[k] = Array.isArray(v) ? v.map(String).join(", ") : String(v)
    }

    return cmd.body.replace(
      /\$(?:\{([^}]+)\}|([A-Za-z_][A-Za-z0-9_]*|\d+|[@*]))/g,
      (match, braced, bare) => {
        const key = braced ?? bare
        const res = resolveCommandVar(key, args._, repl) ?? process.env[key]
        return res ?? match
      }
    )
  }
}
