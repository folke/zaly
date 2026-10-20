import { Ajv } from "ajv"
import { expect, test } from "vitest"
import { enrichThemeSchema } from "../src/schemas-theme.ts"

function fixture() {
  return {
    definitions: {
      "Color<false,false>": { type: "string" },
      "Color<false>": { type: "string" },
      HexColor: { type: "string" },
      InternalHelper123: {
        additionalProperties: false,
        properties: {
          bold: { type: "boolean" },
          fg: { $ref: "#/definitions/Color%3Cfalse%3E" },
          bg: { $ref: "#/definitions/Color%3Cfalse%3E" },
        },
        type: "object",
      },
      ThemeKey: { enum: ["fg", "bg", "primary", "title"] },
      "ThemeStyle<false>": { $ref: "#/definitions/InternalHelper123" },
      "ThemeValue<false>": {
        anyOf: [
          { $ref: "#/definitions/ThemeStyle%3Cfalse%3E" },
          { $ref: "#/definitions/Color%3Cfalse%3E" },
        ],
      },
    } as Record<string, Record<string, unknown>>,
    properties: {
      id: { type: "string" },
      fg: { $ref: "#/definitions/Color%3Cfalse%2Cfalse%3E" },
      bg: { $ref: "#/definitions/Color%3Cfalse%2Cfalse%3E" },
      primary: { $ref: "#/definitions/Color%3Cfalse%3E" },
      title: { $ref: "#/definitions/ThemeValue%3Cfalse%3E" },
    },
    required: ["id", "fg", "bg", "primary"],
    type: "object",
  }
}

test("theme enrichment enforces colors, preserves structure, and normalizes aliases", () => {
  const input = fixture()
  const before = structuredClone(input)
  const schema = enrichThemeSchema(input)
  expect(input).toEqual(before)
  expect(schema.required).toEqual(input.required)
  expect(schema.definitions).not.toHaveProperty("InternalHelper123")
  const validate = new Ajv({ strict: true }).compile(schema)
  const theme = { id: "test", fg: "#fff", bg: "#000", primary: "#123456+51" }
  expect(validate(theme)).toBe(true)
  for (const primary of [
    "red",
    "brightBlue+51",
    "garbage",
    "#ggg",
    "#12345",
    "title+",
    "title+1.5",
    "title++1",
    "name",
  ])
    expect(validate({ ...theme, primary })).toBe(false)
  expect(validate({ ...theme, primary: "title-10", title: { fg: "inherit", bold: true } })).toBe(
    true
  )
  expect(validate({ ...theme, fg: "inherit" })).toBe(false)
  expect(validate({ ...theme, plugin: { fg: "primary+5" } })).toBe(true)
  expect(validate({ ...theme, plugin: "garbage" })).toBe(false)
  expect(validate({ ...theme, plugin: { fg: "red" } })).toBe(false)
  expect(validate({ ...theme, plugin: { style: "primary" } })).toBe(false)
})

test.each([
  "HexColor",
  "ThemeKey",
  "Color<false>",
  "Color<false,false>",
  "ThemeStyle<false>",
  "ThemeValue<false>",
])("theme enrichment fails if %s disappears", (name) => {
  const input = fixture()
  delete input.definitions[name]
  expect(() => enrichThemeSchema(input)).toThrow(/Missing generated theme definition/)
})

test("theme enrichment rejects new unhandled color variants", () => {
  const input = fixture()
  input.definitions["Color<true>"] = { type: "string" }
  expect(() => enrichThemeSchema(input)).toThrow(/Unexpected generated theme color variant/)
})

test("theme enrichment verifies slot names and flat styles", () => {
  const input = fixture()
  input.definitions.ThemeKey.enum = ["primary"]
  expect(() => enrichThemeSchema(input)).toThrow(/ThemeKey does not match/)
  const nested = fixture()
  nested.definitions.InternalHelper123 = {
    type: "object",
    properties: { style: { type: "string" } },
  }
  expect(() => enrichThemeSchema(nested)).toThrow(/flat generated ThemeStyle/)
})
