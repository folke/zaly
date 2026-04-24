import type { TSchema } from "typebox"
import type { TLocalizedValidationError } from "typebox/error"

import { Value } from "typebox/value"

/** Render `value` as pretty-printed JSONC with inline `// ❌` comments
 *  at every path a validation error points to.
 *
 *  Designed for feeding back to an LLM after tool-argument validation
 *  fails: the model sees its own output annotated with exactly what
 *  went wrong where, which empirically repairs on the next turn far
 *  better than a flat error list.
 *
 *  Three error shapes get special handling:
 *    - `required`            → synthetic `"key": undefined` line on the
 *                              parent with a type-shaped message + `(missing)`
 *    - `additionalProperties`→ annotation on the offending key
 *    - everything else       → annotation on the leaf at `instancePath`
 *
 *  Errors whose `instancePath` doesn't resolve to any rendered node
 *  (exotic keywords like `anyOf`/`oneOf`, or paths through a union
 *  branch the value didn't take) are appended in a trailing
 *  `// Unmappable errors:` block so the LLM still sees them.
 *
 *  Paths follow JSON Pointer (RFC 6901) — the same encoding TypeBox emits.
 */
export function stringifyErrors(
  schema: TSchema,
  value: unknown,
  errors: readonly TLocalizedValidationError[]
): string {
  const annotations = new Map<string, string[]>()
  const missing = new Map<string, Set<string>>()
  const errorsByTarget = new Map<string, TLocalizedValidationError[]>()

  const place = (path: string, msg: string, source: TLocalizedValidationError): void => {
    pushAnnotation(annotations, path, msg)
    const list = errorsByTarget.get(path)
    if (list) list.push(source)
    else errorsByTarget.set(path, [source])
  }

  for (const err of errors) {
    if (err.keyword === "required") {
      const parent = walkSchema(schema, err.instancePath)
      for (const prop of err.params.requiredProperties) {
        const sub = parent?.properties?.[prop]
        place(joinPath(err.instancePath, prop), missingMessage(sub), err)
        let set = missing.get(err.instancePath)
        if (!set) {
          set = new Set()
          missing.set(err.instancePath, set)
        }
        set.add(prop)
      }
    } else if (err.keyword === "additionalProperties") {
      for (const prop of err.params.additionalProperties) {
        place(joinPath(err.instancePath, prop), err.message, err)
      }
    } else {
      place(err.instancePath, err.message, err)
    }
  }

  const visited = new Set<string>()
  const rendered = render(value, "", { annotations, depth: 0, missing, visited })
  const body = `${rendered.body}${rendered.comment}`

  const used = new Set<TLocalizedValidationError>()
  for (const path of visited) {
    for (const err of errorsByTarget.get(path) ?? []) used.add(err)
  }
  const leftover = errors.filter((e) => !used.has(e))
  if (leftover.length === 0) return body

  const block = leftover
    .map((e) => `//   ${e.instancePath || "<root>"}: ${e.message} (${e.keyword})`)
    .join("\n")
  return `${body}\n// Unmappable errors:\n${block}`
}

interface RenderCtx {
  annotations: Map<string, string[]>
  depth: number
  missing: Map<string, Set<string>>
  visited: Set<string>
}

interface SchemaLike {
  items?: SchemaLike
  properties?: Record<string, SchemaLike>
}

function walkSchema(schema: SchemaLike, path: string): SchemaLike | undefined {
  if (path === "") return schema
  const parts = path
    .slice(1)
    .split("/")
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"))
  let node: SchemaLike = schema
  for (const part of parts) {
    if (node.properties && part in node.properties) node = node.properties[part]
    else if (node.items) node = node.items
    else return undefined
  }
  return node
}

function missingMessage(sub: SchemaLike | undefined): string {
  if (!sub) return "required (missing)"
  const errs = Value.Errors(sub as TSchema, undefined)
  const base = errs[0]?.message ?? "required"
  return `${base} (missing)`
}

interface Rendered {
  body: string
  comment: string
}

function pushAnnotation(m: Map<string, string[]>, path: string, msg: string): void {
  const list = m.get(path)
  if (list) list.push(msg)
  else m.set(path, [msg])
}

function joinPath(parent: string, key: string | number): string {
  const encoded = String(key).replace(/~/g, "~0").replace(/\//g, "~1")
  return `${parent}/${encoded}`
}

function commentFor(msgs: string[] | undefined): string {
  if (!msgs || msgs.length === 0) return ""
  return ` // ❌ ${msgs.join("; ")}`
}

function render(value: unknown, path: string, ctx: RenderCtx): Rendered {
  ctx.visited.add(path)
  const pad = "  ".repeat(ctx.depth)
  const childPad = "  ".repeat(ctx.depth + 1)
  const ownComment = commentFor(ctx.annotations.get(path))
  const childCtx: RenderCtx = { ...ctx, depth: ctx.depth + 1 }

  if (Array.isArray(value)) {
    if (value.length === 0) return { body: "[]", comment: ownComment }
    const items = value.map((item, i) => render(item, joinPath(path, i), childCtx))
    const lines = items.map((r, i) => {
      const sep = i === items.length - 1 ? "" : ","
      return `${childPad}${r.body}${sep}${r.comment}`
    })
    return { body: `[\n${lines.join("\n")}\n${pad}]`, comment: ownComment }
  }

  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
    const missingKeys = [...(ctx.missing.get(path) ?? [])]
    if (keys.length === 0 && missingKeys.length === 0) {
      return { body: "{}", comment: ownComment }
    }
    const entries: { comment: string; key: string; value: string }[] = []
    for (const k of keys) {
      const r = render(obj[k], joinPath(path, k), childCtx)
      entries.push({ comment: r.comment, key: k, value: r.body })
    }
    for (const k of missingKeys) {
      const childPath = joinPath(path, k)
      ctx.visited.add(childPath)
      entries.push({
        comment: commentFor(ctx.annotations.get(childPath)),
        key: k,
        value: "undefined",
      })
    }
    const lines = entries.map((e, i) => {
      const sep = i === entries.length - 1 ? "" : ","
      return `${childPad}${JSON.stringify(e.key)}: ${e.value}${sep}${e.comment}`
    })
    return { body: `{\n${lines.join("\n")}\n${pad}}`, comment: ownComment }
  }

  return { body: JSON.stringify(value), comment: ownComment }
}
