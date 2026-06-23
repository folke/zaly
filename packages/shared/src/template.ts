import type { Context } from "node:vm"

import vm from "node:vm"

export type TemplateVars = Record<string, unknown>
export type TemplateFn<T extends TemplateVars = TemplateVars> = (values: T) => string
export type TemplateOpts = {
  name?: string
  expr?: boolean
}

const exprRe = /\{\{([\s\S]*?)\}\}/g
const keyRe = /^[A-Za-z_$][\w$]*$/

type Token =
  | { type: "text"; value: string }
  | { type: "expr"; value: string }
  | { type: "if"; value: string }
  | { type: "else" }
  | { type: "endif" }

function tokenize(template: string): Token[] {
  const tokens: Token[] = []
  let last = 0
  let match: RegExpExecArray | null

  while ((match = exprRe.exec(template)) !== null) {
    if (match.index > last) tokens.push({ type: "text", value: template.slice(last, match.index) })
    const expr = match[1].trim()
    if (expr.startsWith("#if ")) tokens.push({ type: "if", value: expr.slice(3).trim() })
    else if (expr === "else") tokens.push({ type: "else" })
    else if (expr === "/if") tokens.push({ type: "endif" })
    else tokens.push({ type: "expr", value: expr })
    last = match.index + match[0].length
  }

  if (last < template.length) tokens.push({ type: "text", value: template.slice(last) })

  return tokens
}

export class Template<T extends TemplateVars = TemplateVars> {
  #opts: TemplateOpts
  #tokens: Token[]

  constructor(tpl: string, opts: TemplateOpts = {}) {
    this.#opts = opts
    this.#tokens = tokenize(tpl)
  }

  get name() {
    return this.#opts.name ?? "template"
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
      return vm.runInContext(`(${expr})`, ctx, {
        displayErrors: true,
        filename: this.name,
        timeout: 100,
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      // oxlint-disable-next-line preserve-caught-error
      throw new Error(
        `Error evaluating expression \`(${expr})\` in template **"${this.name}"**:\n${msg}`
      )
    }
  }

  #ctx(values: Record<string, unknown>): Context {
    return vm.createContext(values, { name: this.name })
  }

  #render(value: unknown): string {
    if (value === null || value === undefined) return ""
    if (typeof value === "string") return value
    if (typeof value === "number" || typeof value === "boolean") return String(value)
    if (Array.isArray(value)) return value.map((v) => this.#render(v)).join(" ")
    if (typeof value === "object") return JSON.stringify(value)
    return String(value as unknown)
  }

  render(values: T): string {
    const ctx = this.#ctx(values)
    const ret: string[] = []
    const skips: boolean[] = []

    for (const token of this.#tokens) {
      const t = token.type
      const skip = skips.some((s) => s)
      if (t === "text" && !skip) ret.push(token.value)
      else if (t === "expr" && !skip) {
        const value = this.#expr(token.value, ctx)
        ret.push(this.#render(value))
      } else if (t === "if") {
        skips.push(skip || !this.#expr(token.value, ctx))
      } else if (t === "else") {
        if (skips.length === 0)
          throw new Error(`Unexpected {{else}} in template **"${this.name}"**`)
        skips[skips.length - 1] = !skips[skips.length - 1]
      } else if (t === "endif") {
        if (skips.length === 0) throw new Error(`Unexpected {{/if}} in template **"${this.name}"**`)
        skips.pop()
      }
    }
    if (skips.length > 0) throw new Error(`Missing {{/if}} in template **"${this.name}"**`)

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
