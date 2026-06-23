import type { Context, Script } from "node:vm"

import { inspect } from "node:util"
import vm from "node:vm"
import { quote } from "shell-quote"

export type TemplateVars = Record<string, unknown>
export type TemplateFn<T extends TemplateVars = TemplateVars> = (values: T) => string
export type TemplateOpts = {
  name?: string
  expr?: boolean
  format?: (value: unknown) => string | undefined
}

const exprRe = /\{\{([\s\S]*?)\}\}/g
const keyRe = /^[A-Za-z_$][\w$]*$/

type Token =
  | { type: "text"; value: string }
  | { type: "expr"; value: string }
  | { type: "if"; value: string }
  | { type: "else" }
  | { type: "endif" }

type Trim = { start?: boolean; end?: boolean }

function tokenize(template: string): Token[] {
  const tokens: Token[] = []
  let last = 0
  let match: RegExpExecArray | null
  let lastTrim: Trim = {}

  const text = (from: number, to: number | undefined, trim: Trim) => {
    let value = template.slice(from, to)
    if (trim.start) value = value.trimStart()
    if (trim.end) value = value.trimEnd()
    return value
  }

  while ((match = exprRe.exec(template)) !== null) {
    let expr = match[1].trim()
    const nextTrim: Trim = { end: expr.endsWith("~"), start: expr.startsWith("~") }
    expr = expr.replace(/^~|~$/g, "").trim()
    if (match.index > last) {
      tokens.push({
        type: "text",
        value: text(last, match.index, { end: nextTrim.start, start: lastTrim.end }),
      })
    }
    if (expr.startsWith("#if ")) tokens.push({ type: "if", value: expr.slice(3).trim() })
    else if (expr === "else") tokens.push({ type: "else" })
    else if (expr === "/if") tokens.push({ type: "endif" })
    else tokens.push({ type: "expr", value: expr })
    last = match.index + match[0].length
    lastTrim = nextTrim
  }

  if (last < template.length)
    tokens.push({
      type: "text",
      value: text(last, template.length, { start: lastTrim.end }),
    })

  return tokens
}

export class Template<T extends TemplateVars = TemplateVars> {
  #opts: TemplateOpts
  #tokens: Token[]
  #scripts = new Map<string, Script>()

  constructor(tpl: string, opts: TemplateOpts = {}) {
    this.#opts = opts
    this.#tokens = tokenize(tpl)
  }

  get name() {
    return this.#opts.name ?? "template"
  }

  #script(expr: string): Script {
    let ret = this.#scripts.get(expr)
    ret ??= new vm.Script(`(${expr})`, {
      filename: this.name,
      importModuleDynamically: async (specifier) => {
        throw new Error(
          `Dynamic import is not allowed in template **"${this.name}"**: ${specifier}`
        )
      },
    })
    this.#scripts.set(expr, ret)
    return ret
  }

  #expr(expr: string, ctx: Context) {
    if (this.#opts.expr === false) {
      const key = expr.trim()
      if (!keyRe.test(key)) {
        throw new Error(
          `Expression \`(${expr})\` is not allowed in template **"${this.name}"**. ` +
            `Set the \`expr\` option to \`true\` to enable expression evaluation.`
        )
      }
      return ctx[key]
    }
    try {
      const script = this.#script(expr)
      return script.runInContext(ctx, { displayErrors: true, timeout: 100 })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      // oxlint-disable-next-line preserve-caught-error
      throw new Error(
        `Error evaluating expression \`(${expr})\` in template **"${this.name}"**:\n${msg}`
      )
    }
  }

  #ctx(vars: Record<string, unknown>): Context {
    return vm.createContext(
      {
        ...vars,
        $: (arg: unknown) => {
          const args = Array.isArray(arg) ? arg : [arg]
          return quote(args.map((a) => this.#render(a)))
        },
        env: process.env,
        error: (msg: string) => {
          throw new Error(msg)
        },
        json: (value: unknown) => JSON.stringify(value, undefined, 2),
        vars,
      },
      {
        codeGeneration: { strings: false, wasm: false },
        name: this.name,
      }
    )
  }

  #render(value: unknown): string {
    const formatted = this.#opts.format?.(value)
    if (formatted !== undefined) return formatted
    if (value === null || value === undefined) return ""
    if (typeof value === "string") return value
    return inspect(value, { breakLength: 80, colors: false, compact: true })
  }

  render(values: T): string {
    const ctx = this.#ctx(values)
    const ret: string[] = []
    const stack: { skip: boolean; else: boolean }[] = []
    let skip = false

    for (const token of this.#tokens) {
      const t = token.type
      if (t === "text" && !skip) ret.push(token.value)
      else if (t === "expr" && !skip) {
        const value = this.#expr(token.value, ctx)
        ret.push(this.#render(value))
      } else if (t === "if") {
        stack.push({ else: false, skip })
        skip ||= !this.#expr(token.value, ctx)
      } else if (t === "else") {
        const top = stack.at(-1)
        if (!top) throw new Error(`Unexpected {{else}} in template **"${this.name}"**`)
        if (top.else) throw new Error(`Unexpected {{else}} in template **"${this.name}"**`)
        top.else = true
        skip = top.skip || !skip
      } else if (t === "endif") {
        const top = stack.pop()
        if (!top) throw new Error(`Unexpected {{/if}} in template **"${this.name}"**`)
        skip = top.skip
      }
    }
    if (stack.length > 0) throw new Error(`Missing {{/if}} in template **"${this.name}"**`)

    return ret.join("")
  }
}

export function createTemplate<T extends TemplateVars = TemplateVars>(
  tpl: string,
  opts: TemplateOpts = {}
): TemplateFn<T> {
  const ret = new Template<T>(tpl, opts)
  return (values: T) => ret.render(values)
}
