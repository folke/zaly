// oxlint-disable no-await-in-loop
import type { ArgsOpts, ArgsResult } from "@zaly/shared/args"
import type { Logger } from "@zaly/shared/logger"

import { normPath, prettyPath, safeReadFile, toError } from "@zaly/shared"
import { basename } from "pathe"

export type Command = {
  name: string
  body: string
  path: string
  description?: string
  args: ArgsOpts
}

export interface CommandsOptions {
  /** cmd.md paths, sorted from highest to lowest precedence. */
  paths?: string[]
  logger?: Logger
  /** Bash execution of commands:
   * - `true`: Use the system default bash shell.
   * - `false`: Disable bash execution.
   * - `string[]`: Use a custom bash shell with the provided arguments. */
  bash?: boolean | string[]
  /** When `false`, template expressions are disabled and only simple variable interpolation is allowed. */
  expr?: boolean
}

type Token =
  | { type: "text"; value: string }
  | { type: "block"; value: string; lang?: string; body: string }
  | { type: "script"; value: string }

const BASH_RE = /^!`(.*)`$/

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

      const args: ArgsOpts = {}
      const fmArgs = (fm.args ?? {}) as Record<string, Partial<ArgsOpts[string]>>

      for (const [o, opt] of Object.entries(fmArgs)) {
        // Set default values for boolean
        if (opt.type === "boolean") opt.default ??= false
        // Make string options required if no default is provided
        else if (opt.type === "string") opt.required ??= opt.default === undefined
        else {
          this.#logger?.warn(
            `Unsupported argument type for \`--${o}\` in command **${name}** at \`${prettyPath(path)}\`\nOnly \`string\` and \`boolean\` are supported. Skipping this argument.`
          )
          continue
        }
        args[o] = opt as ArgsOpts[string]
      }

      const cmd: Command = {
        ...fm,
        args,
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
      const { argsParse } = await import("@zaly/shared/args")
      args = await argsParse(input, cmd.args)
    } else args = input

    const { createTemplate } = await import("@zaly/shared/template")
    const tpl = createTemplate(cmd.body, {
      expr: this.#opts.expr,
      format: (value) => {
        if (value === args._) return args._.join(" ")
      },
      name: cmd.name,
    })

    const vars = {
      ...args,
      args: args._,
      raw: args.$,
    }

    const rendered = tpl(vars)
    if (this.#opts.bash === false) return rendered
    const bash = Array.isArray(this.#opts.bash) ? this.#opts.bash : ["bash"]

    const lines = rendered.split("\n")

    const ret: string[] = []
    for (const token of this.#tokenize(lines, cmd)) {
      let text: string | undefined
      if (token.type === "script") text = await exec(token.value, { bash })
      else if (token.type === "block" && /^bash\s*!$/.test(token.lang ?? ""))
        text = await exec(token.body, { bash })
      ret.push(text ?? token.value)
    }

    return ret.join("\n")
  }

  *#tokenize(lines: string[], cmd: Command): Generator<Token> {
    let block: string[] = []
    let marker: RegExp | undefined = undefined
    let lang: string | undefined = undefined
    for (const line of lines) {
      const m = line.match(/^\s*(`{3,}|~{3,})(.*)$/)
      const script = line.match(BASH_RE)
      if (marker && line.match(marker)) {
        block.push(line)
        yield {
          body: block.slice(1, -1).join("\n"),
          lang,
          type: "block",
          value: block.join("\n"),
        }
        marker = undefined // end of code block
      } else if (!marker && m) {
        marker = new RegExp(`^\\s*${m[1]}\\s*$`) // start of code block
        lang = m[2].trim() || undefined
        block = [line]
      } else if (marker) block.push(line)
      else if (script) yield { type: "script", value: script[1] }
      else yield { type: "text", value: line }
    }
    if (marker) throw new Error(`Unclosed code block in command **${cmd.name}**`)
  }
}

async function exec(script: string, opts: { bash?: string[] } = {}): Promise<string | undefined> {
  if (!script.trim()) return
  const { spawnCmd } = await import("@zaly/shared/process")
  let result: string
  try {
    const r = await spawnCmd(script, { bash: opts.bash ?? true, throw: true })
    result = r?.trim() ?? ""
  } catch (error) {
    result = toError(error).message.trim()
  }
  const md: string[] = []
  if (script.includes("\n")) {
    md.push("```bash")
    md.push(script)
    md.push("```")
    md.push("")
    md.push("```shellsession")
    md.push(result)
    md.push("```")
  } else {
    md.push("```shellsession")
    md.push(`$ ${script}`)
    md.push(result)
    md.push("```")
  }
  md.push("")
  return md.join("\n")
}
