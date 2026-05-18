// oxlint-disable no-await-in-loop
import type { IJsonSchemaUnit } from "typia"

import { globSync, mkdirSync, statSync, writeFileSync } from "node:fs"
import { basename, join } from "pathe"

export function hasSchemas(root: string) {
  const schemas = join(root, "src/schemas/tpl/")
  try {
    return statSync(schemas).isDirectory()
  } catch {
    return false
  }
}

export async function compile(root: string) {
  // Step 1: Generate typia validation code from templates
  console.log("Generating typia validators and schemas...")
  const { TypiaGenerator } = await import("@typia/transform")
  await TypiaGenerator.build({
    input: join(root, "src/schemas/tpl"),
    output: join(root, "src/schemas/gen"),
    project: join(root, "tsconfig.json"),
  })
  console.log("✔  Typia validators generated")
}

export async function generateJsonSchemas(root: string) {
  const schemaFiles = globSync(join(root, "src/schemas/gen/*.schema.ts"))
  if (schemaFiles.length === 0) return
  console.log("Generating JSON schemas...")
  mkdirSync(join(root, "assets/schemas"), { recursive: true })
  for (const file of schemaFiles) {
    console.log(file)
    const mod = (await import(file)) as Record<string, unknown>
    const name = basename(file, ".schema.ts")
    const outPath = join(root, "assets", "schemas", `${name}.schema.json`)
    const openApiSchema = Object.values(mod).find((v) => typeof v === "object" && v !== null) as
      | IJsonSchemaUnit
      | undefined
    if (openApiSchema) {
      const jsonSchema = toJsonSchema(openApiSchema)
      if (jsonSchema) {
        writeFileSync(outPath, `${JSON.stringify(jsonSchema, undefined, 2)}\n`)
        console.log(`✔  ${outPath}`)
      }
    }
  }
}

// Convert $ref paths from OpenAPI 3.0 to JSON Schema draft-07 definitions,
// and split any schema node that carries both `pattern` and `enum` into a
// `oneOf` of the two alternatives. typia emits that combined shape for
// unions of template-literal + string-literal types (our `Color` mixes
// `` `#${string}` `` with a big enum); the combined form is unsatisfiable
// since a value would need to match both simultaneously.
function convertRefs(obj: any): any {
  if (obj === null || typeof obj !== "object") return obj
  if (Array.isArray(obj)) return obj.map(convertRefs)

  // Split pattern + enum into a oneOf so external validators accept either.
  if (obj.type === "string" && typeof obj.pattern === "string" && Array.isArray(obj.enum)) {
    const { pattern, enum: enumValues, description, ...rest } = obj
    return {
      ...rest,
      oneOf: [
        { pattern, type: "string" },
        { enum: enumValues, type: "string" },
      ],
      ...(description === undefined ? {} : { description }),
    }
  }

  const result: any = {}
  for (const [key, value] of Object.entries(obj)) {
    result[key] =
      key === "$ref" && typeof value === "string"
        ? value.replace("#/components/schemas/", "#/definitions/")
        : convertRefs(value)
  }
  return result
}

// Step 2: Convert OpenAPI 3.0 schemas from gen/*.schema.ts into standard
// JSON Schema draft-07 files under assets/schemas/.
function toJsonSchema(openApiSchema: IJsonSchemaUnit): any {
  const components = openApiSchema.components.schemas ?? {}
  const rootName = Object.keys(components)[0]
  if (!rootName) return

  const root = components[rootName]
  const definitions: any = {}
  for (const [name, schema] of Object.entries(components)) {
    if (name !== rootName) definitions[name] = convertRefs(schema)
  }

  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    ...convertRefs(root),
    ...(Object.keys(definitions).length > 0 ? { definitions } : {}),
  }
}
