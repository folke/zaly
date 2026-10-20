import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"
import { toJsonSchema } from "../src/typia.ts"

describe("Typia JSON Schema conversion", () => {
  test("uses an inline root even when components are empty", () => {
    expect(
      toJsonSchema({
        version: "3.0",
        schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
        components: {},
      })
    ).toEqual({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    })
  })

  test("uses a referenced root rather than the first component", () => {
    const schema = toJsonSchema({
      version: "3.0",
      schema: { $ref: "#/components/schemas/Theme" },
      components: {
        schemas: {
          Color: { type: "string" },
          Theme: {
            type: "object",
            properties: { bg: { $ref: "#/components/schemas/Color" } },
            required: ["bg"],
          },
        },
      },
    })
    expect(schema.$ref).toBe("#/definitions/Theme")
    expect(schema.definitions.Theme.properties.bg.$ref).toBe("#/definitions/Color")
    expect(schema.definitions.Color).toEqual({ type: "string" })
  })

  test("keeps root components needed by recursive references", () => {
    const schema = toJsonSchema({
      version: "3.0",
      schema: {
        type: "object",
        properties: { child: { $ref: "#/components/schemas/Node" } },
      },
      components: {
        schemas: {
          Node: {
            type: "object",
            properties: { child: { $ref: "#/components/schemas/Node" } },
          },
        },
      },
    })
    expect(schema.properties.child.$ref).toBe("#/definitions/Node")
    expect(schema.definitions.Node.properties.child.$ref).toBe("#/definitions/Node")
  })

  test("preserves the pattern/enum union conversion within definitions", () => {
    const schema = toJsonSchema({
      version: "3.0",
      schema: { $ref: "#/components/schemas/Color" },
      components: {
        schemas: {
          Color: { type: "string", pattern: "^#.*$", enum: ["red"], description: "Color" },
        },
      },
    })
    expect(schema.definitions.Color).toEqual({
      type: "string",
      description: "Color",
      oneOf: [
        { type: "string", pattern: "^#.*$" },
        { type: "string", enum: ["red"] },
      ],
    })
  })
})

test.each([
  ["tui", "theme"],
  ["config", "config"],
  ["config", "models"],
])("published %s/%s schema has no dangling local references", (pkg, name) => {
  const schema = JSON.parse(
    readFileSync(
      new URL(`../../${pkg}/assets/schemas/${name}.schema.json`, import.meta.url),
      "utf8"
    )
  )
  const walk = (value: unknown) => {
    if (value === null || typeof value !== "object") return
    const node = value as Record<string, unknown>
    if (typeof node.$ref === "string" && node.$ref.startsWith("#/")) {
      expect(node.$ref.startsWith("#/components/")).toBe(false)
      const target = node.$ref
        .slice(2)
        .split("/")
        .reduce((parent, token) => {
          const key = decodeURIComponent(token).replaceAll("~1", "/").replaceAll("~0", "~")
          return parent?.[key]
        }, schema)
      expect(target).toBeDefined()
    }
    for (const child of Object.values(value)) walk(child)
  }
  walk(schema)
})

test("published theme schema describes a theme object with optional defaults", () => {
  const schema = JSON.parse(
    readFileSync(new URL("../../tui/assets/schemas/theme.schema.json", import.meta.url), "utf8")
  )
  expect(schema.type).toBe("object")
  expect(schema.properties.id).toEqual({ type: "string" })
  expect(schema.properties.bg).toBeDefined()
  expect(schema.properties.appearance.enum).toEqual(["dark", "light"])
  expect(schema.required).toContain("id")
  expect(schema.required).toContain("bg")
  expect(schema.required).not.toContain("appearance")
  expect(schema.required).not.toContain("ui")
  expect(schema.required).not.toContain("$schema")
})

test.each(["config", "models"])("published %s schema describes an object, not a tuple", (name) => {
  const schema = JSON.parse(
    readFileSync(
      new URL(`../../config/assets/schemas/${name}.schema.json`, import.meta.url),
      "utf8"
    )
  )
  expect(schema.type).toBe("object")
  if (name === "config") expect(schema.properties.ui).toBeDefined()
  else expect(schema.additionalProperties.type).toBe("object")
  expect(schema.items).toBeUndefined()
})
