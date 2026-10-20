type Schema = {
  $ref?: string
  type?: string
  definitions?: Record<string, Schema>
  properties?: Record<string, Schema>
  enum?: string[]
  description?: string
  [key: string]: unknown
}

function definition(schema: Schema, name: string): Schema {
  const value = schema.definitions?.[name]
  if (!value) throw new Error(`Missing generated theme definition: ${name}`)
  return value
}

function referenceName(ref: string): string {
  if (!ref.startsWith("#/definitions/"))
    throw new Error(`Unexpected generated theme reference: ${ref}`)
  return decodeURIComponent(ref.slice("#/definitions/".length))
    .replaceAll("~1", "/")
    .replaceAll("~0", "~")
}

function resolve(schema: Schema, value: Schema, seen = new Set<string>()): Schema {
  if (!value.$ref) return value
  const name = referenceName(value.$ref)
  if (seen.has(name)) throw new Error(`Circular generated theme alias: ${name}`)
  seen.add(name)
  const { $ref: _, ...siblings } = value
  return { ...resolve(schema, definition(schema, name), seen), ...siblings }
}

function pruneDefinitions(schema: Schema) {
  const used = new Set<string>()
  function walk(value: unknown) {
    if (value === null || typeof value !== "object") return
    const node = value as Record<string, unknown>
    if (typeof node.$ref === "string") {
      const name = referenceName(node.$ref)
      if (!used.has(name)) {
        used.add(name)
        walk(definition(schema, name))
      }
    }
    for (const [key, child] of Object.entries(node)) if (key !== "definitions") walk(child)
  }
  walk(schema)
  schema.definitions = Object.fromEntries(
    Object.entries(schema.definitions ?? {}).filter(([name]) => used.has(name))
  )
}

/** Add constraints not expressible by the theme's TypeScript declarations. */
export function enrichThemeSchema(input: Record<string, unknown>): Schema {
  const schema = structuredClone(input) as Schema
  if (schema.type !== "object" || !schema.properties)
    throw new Error("Expected a generated CustomTheme object schema")
  const metadata = new Set(["$schema", "id", "name", "appearance", "shiki"])
  const slots = Object.keys(schema.properties)
    .filter((key) => !metadata.has(key))
    .toSorted()
  const keys = definition(schema, "ThemeKey").enum
  if (!keys || JSON.stringify(keys.toSorted()) !== JSON.stringify(slots))
    throw new Error("Generated ThemeKey does not match CustomTheme slots")
  const hex = "#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})"
  Object.assign(definition(schema, "HexColor"), { pattern: `^${hex}$`, type: "string" })
  const base = `(?:${hex}|${slots.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)).join("|")})`
  for (const [name, inherit] of [
    ["Color<false,false>", false],
    ["Color<false>", true],
  ] as const) {
    definition(schema, name)
    schema.definitions![name] = {
      description: `Hex color or theme slot${inherit ? ", or inherit" : ""}. Hex colors and theme slots may have an integer +/- lightness adjustment.`,
      pattern: `^(?:${base}(?:[+-][0-9]+)?${inherit ? "|inherit" : ""})$`,
      type: "string",
    }
  }
  for (const name of Object.keys(schema.definitions ?? {})) {
    if (name.startsWith("Color<") && name !== "Color<false>" && name !== "Color<false,false>")
      throw new Error(`Unexpected generated theme color variant: ${name}`)
  }
  // Flatten compiler-generated aliases so source positions do not leak into artifact names.
  const style = resolve(schema, definition(schema, "ThemeStyle<false>"))
  if (style.type !== "object" || !style.properties || "style" in style.properties)
    throw new Error("Expected a flat generated ThemeStyle<false> object")
  schema.definitions!["ThemeStyle<false>"] = style
  definition(schema, "ThemeValue<false>")
  schema.additionalProperties = { $ref: `#/definitions/${encodeURIComponent("ThemeValue<false>")}` }
  pruneDefinitions(schema)
  return schema
}
