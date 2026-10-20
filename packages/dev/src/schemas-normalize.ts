type Schema = Record<string, unknown>

const nameOf = (ref: string) =>
  decodeURIComponent(ref.slice("#/definitions/".length)).replaceAll("~1", "/").replaceAll("~0", "~")

/** Inline anonymous compiler helpers so source offsets cannot churn generated artifacts. */
export function normalizeSchema(input: Schema): Schema {
  const schema = structuredClone(input)
  const definitions = (schema.definitions ?? {}) as Record<string, Schema | undefined>
  const target = (name: string) => {
    const value = definitions[name]
    if (!value) throw new Error(`Missing generated schema definition: ${name}`)
    return value
  }
  function walk(value: unknown, seen = new Set<string>()): unknown {
    if (Array.isArray(value)) return value.map((child) => walk(child, seen))
    if (value === null || typeof value !== "object") return value
    const node = value as Schema
    if (typeof node.$ref === "string" && node.$ref.startsWith("#/definitions/")) {
      const name = nameOf(node.$ref)
      if (/(?:structure|alias)-\d/.test(name)) {
        if (seen.has(name)) throw new Error(`Circular anonymous schema helper: ${name}`)
        const { $ref: _, ...siblings } = node
        const resolved = walk(target(name), new Set([...seen, name])) as Schema
        // A utility's JSDoc describes the mapping operation, not the resulting object.
        const { description: _description, ...shape } = resolved
        return walk({ ...shape, ...siblings }, seen)
      }
    }
    return Object.fromEntries(
      Object.entries(node).map(([key, child]) => [
        key,
        ["definitions", "const", "enum", "default", "examples"].includes(key)
          ? child
          : walk(child, seen),
      ])
    )
  }
  const result = walk(schema) as Schema
  const used = new Set<string>()
  function collect(value: unknown) {
    if (value === null || typeof value !== "object") return
    const node = value as Schema
    if (typeof node.$ref === "string" && node.$ref.startsWith("#/definitions/")) {
      const name = nameOf(node.$ref)
      if (!used.has(name)) {
        used.add(name)
        definitions[name] = walk(target(name)) as Schema
        collect(definitions[name])
      }
    }
    for (const [key, child] of Object.entries(node))
      if (!["definitions", "const", "enum", "default", "examples"].includes(key)) collect(child)
  }
  collect(result)
  if (schema.definitions)
    result.definitions = Object.fromEntries(
      Object.entries(definitions).filter(([name]) => used.has(name))
    )
  return result
}
