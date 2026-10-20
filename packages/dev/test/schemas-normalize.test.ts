import { expect, test } from "vitest"
import { normalizeSchema } from "../src/schemas-normalize.ts"

function fixture(offset: number) {
  const helper = `Simplify<structure-${offset}>`
  return {
    definitions: {
      [helper]: {
        description: "Utility description",
        properties: { mode: { $ref: "#/definitions/Mode" } },
        type: "object",
      },
      Mode: { enum: ["dark", "light"], type: "string" },
      Unused: { type: "number" },
    },
    properties: {
      ui: { $ref: `#/definitions/${encodeURIComponent(helper)}`, description: "User interface" },
    },
    type: "object",
  }
}

test("anonymous helpers are inlined without losing annotations or named references", () => {
  const input = fixture(123)
  const before = structuredClone(input)
  const result = normalizeSchema(input)
  expect(input).toEqual(before)
  expect(result).toEqual(normalizeSchema(fixture(456)))
  expect(result.properties).toEqual({
    ui: {
      description: "User interface",
      properties: { mode: { $ref: "#/definitions/Mode" } },
      type: "object",
    },
  })
  expect(result.definitions).toEqual({ Mode: { enum: ["dark", "light"], type: "string" } })
})

test("named recursive schemas remain references", () => {
  const schema = {
    $ref: "#/definitions/Tree",
    definitions: {
      Tree: { properties: { child: { $ref: "#/definitions/Tree" } }, type: "object" },
    },
  }
  expect(normalizeSchema(schema)).toEqual(schema)
})

test("missing references and recursive anonymous helpers fail loudly", () => {
  expect(() => normalizeSchema({ $ref: "#/definitions/Missing" })).toThrow(/Missing generated/)
  expect(() =>
    normalizeSchema({
      $ref: "#/definitions/structure-123",
      definitions: { "structure-123": { $ref: "#/definitions/structure-123" } },
    })
  ).toThrow(/Circular anonymous/)
})
